import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { HttpError, parse, toPubkey } from "../http.js";
import { currentUser } from "../plugins/auth.js";
import { FraudKind, repoCreatedBeforeStart } from "../services/fraud/rules.js";

export default async function teamRoutes(app: FastifyInstance, { deps }: { deps: Deps }) {
  const { prisma, chain, github } = deps;

  app.get("/teams/:id", async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const team = await prisma.team.findUnique({
      where: { id },
      include: { repos: true, participants: { include: { user: { select: { githubLogin: true } } } } },
    });
    if (!team) throw new HttpError(404, "Team not found");
    const onChain = await chain.fetchTeam(toPubkey(id));
    return {
      address: team.id,
      hackathon: team.hackathonId,
      name: team.name,
      captain: team.captain,
      confirmed: !!onChain,
      members: (onChain?.members ?? []).map((m) => m.toBase58()),
      qualifiedCount: onChain?.qualifiedCount ?? 0,
      participants: team.participants.map((p) => ({
        address: p.id,
        wallet: p.wallet,
        githubLogin: p.user.githubLogin,
      })),
      repos: team.repos.map((r) => ({ id: r.id.toString(), fullName: r.fullName })),
    };
  });

  /** The captain replaces a leaked invite code; the old one stops working at once. */
  app.post("/teams/:id/invite", { preHandler: app.authenticate }, async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const user = await currentUser(deps, req);
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) throw new HttpError(404, "Team not found");
    if (!user.wallet || user.wallet !== team.captain) throw new HttpError(403, "Only the team captain");
    const updated = await prisma.team.update({
      where: { id },
      data: { inviteCode: randomBytes(6).toString("base64url") },
    });
    return { inviteCode: updated.inviteCode };
  });

  app.get("/teams/:id/commits", async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
    const commits = await prisma.commit.findMany({
      where: { repo: { teamId: id } },
      orderBy: { pushedAt: "desc" },
      take: q.limit,
      include: { repo: { select: { fullName: true } } },
    });
    const shas = commits.map((c) => c.sha);
    const [fires, flags] = await Promise.all([
      prisma.fire.findMany({ where: { commitSha: { in: shas } } }),
      prisma.fraudFlag.findMany({ where: { repo: { teamId: id } } }),
    ]);
    const fireBySha = new Map(fires.map((f) => [f.commitSha, f]));
    const flagsBySha = new Map<string, string[]>();
    for (const f of flags) {
      const sha = (f.details as { sha?: string } | null)?.sha;
      if (sha) flagsBySha.set(sha, [...(flagsBySha.get(sha) ?? []), f.kind]);
    }
    return commits.map((c) => {
      const fire = fireBySha.get(c.sha);
      const commitFlags = flagsBySha.get(c.sha) ?? [];
      return {
        sha: c.sha,
        repo: c.repo.fullName,
        author: c.authorLogin,
        authoredAt: c.authoredAt.toISOString(),
        pushedAt: c.pushedAt.toISOString(),
        fireDay: fire?.dayIndex ?? null,
        fireTx: fire?.txSignature ?? null,
        flags: commitFlags,
        status: commitFlags.length ? "suspicious" : c.participantId ? "verified" : "unlinked",
      };
    });
  });

  /** The captain registers a repository; the team's GitHub App installation must cover it. */
  app.post("/teams/:id/repos", { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const body = parse(
      z.object({ fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo") }),
      req.body,
    );
    const user = await currentUser(deps, req);
    const team = await prisma.team.findUnique({ where: { id }, include: { hackathon: true } });
    if (!team) throw new HttpError(404, "Team not found");
    const onChain = await chain.fetchTeam(toPubkey(id));
    if (!onChain) throw new HttpError(409, "The team is not confirmed on-chain yet");
    if (!user.wallet || onChain.captain.toBase58() !== user.wallet) {
      throw new HttpError(403, "Only the team captain can register repositories");
    }

    const repo = await github.getRepo(body.fullName).catch((e: { status?: number }) => {
      if (e.status === 404) {
        throw new HttpError(400, "The Proof of Build GitHub App is not installed on this repository");
      }
      throw e;
    });

    try {
      await prisma.repo.create({
        data: {
          id: BigInt(repo.id),
          fullName: repo.fullName,
          hackathonId: team.hackathonId,
          teamId: team.id,
          installationId: BigInt(repo.installationId),
          githubCreatedAt: repo.createdAt,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new HttpError(409, "This repository is already registered");
      }
      throw e;
    }

    const flagged = repoCreatedBeforeStart(repo.createdAt, team.hackathon.startTs);
    if (flagged) {
      await prisma.fraudFlag.upsert({
        where: { dedupeKey: `repo-age:${repo.id}` },
        create: {
          kind: FraudKind.REPO_CREATED_BEFORE_START,
          dedupeKey: `repo-age:${repo.id}`,
          repoId: BigInt(repo.id),
          details: {
            repoCreatedAt: repo.createdAt.toISOString(),
            hackathonStart: team.hackathon.startTs.toISOString(),
          },
        },
        update: {},
      });
    }
    return reply.code(201).send({ id: String(repo.id), fullName: repo.fullName, flagged });
  });
}
