import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { HttpError, parse, toPubkey } from "../http.js";
import { currentUser } from "../plugins/auth.js";
import type { HackathonAccount } from "../services/solana/chain.js";
import { FraudKind, inactiveMembers, isNewAccount } from "../services/fraud/rules.js";
import { numberOfDays, sha256Hex } from "../services/ids.js";

const MAX_MEMBERS = 5;
// Must match the program constants.
const FIRE_GRACE = 3 * 3_600;
const WINNERS_DEADLINE = 7 * 86_400;
const CLAIM_WINDOW = 30 * 86_400;

function phase(start: Date, end: Date, now = new Date()) {
  if (now < start) return "upcoming";
  if (now < end) return "running";
  return "ended";
}

export function chainView(h: HackathonAccount) {
  return {
    organizer: h.organizer.toBase58(),
    oracle: h.oracle.toBase58(),
    mint: h.mint.toBase58(),
    vault: h.vault.toBase58(),
    startTs: h.startTs.toNumber(),
    endTs: h.endTs.toNumber(),
    registrationEndTs: h.registrationEndTs.toNumber(),
    /** set_winners and finalize open at this time (end + fire grace) */
    settlementTs: h.endTs.toNumber() + FIRE_GRACE,
    /** without winners by then, qualified participants share the prize equally */
    winnersDeadlineTs: h.endTs.toNumber() + FIRE_GRACE + WINNERS_DEADLINE,
    /** the organizer may sweep unclaimed funds from then on */
    sweepTs: h.endTs.toNumber() + FIRE_GRACE + CLAIM_WINDOW,
    qualifiedCount: h.qualifiedCount,
    depositAmount: h.depositAmount.toString(),
    requiredFires: h.requiredFires,
    prizePool: h.prizePool.toString(),
    teamCount: h.teamCount,
    participantCount: h.participantCount,
    settledCount: h.settledCount,
    status: h.status.finalized ? "finalized" : "active",
    winnersSet: h.winnersSet,
    winners: h.winners.slice(0, h.winnerCount).map((w) => ({ team: w.team.toBase58(), bps: w.bps })),
  };
}

const idParam = z.object({ id: z.string() });
const inviteCode = () => randomBytes(6).toString("base64url");

export default async function hackathonRoutes(app: FastifyInstance, { deps }: { deps: Deps }) {
  const { prisma, chain } = deps;

  async function loadHackathon(id: string) {
    const address = toPubkey(id, "hackathon id");
    const [db, onChain] = await Promise.all([
      prisma.hackathon.findUnique({ where: { id: address.toBase58() } }),
      chain.fetchHackathon(address),
    ]);
    if (!db || !onChain) throw new HttpError(404, "Hackathon not found");
    return { address, db, onChain };
  }

  app.get("/hackathons", async () => {
    const rows = await prisma.hackathon.findMany({
      orderBy: { startTs: "desc" },
      include: { _count: { select: { teams: true, participants: true } } },
    });
    // Prize pool and deposit live on-chain; a failed RPC call must not break the list.
    const onChain = await Promise.all(
      rows.map((h) => chain.fetchHackathon(new PublicKey(h.id)).catch(() => null)),
    );
    return rows.map((h, i) => ({
      id: h.id,
      prizePool: onChain[i]?.prizePool.toString() ?? null,
      depositAmount: onChain[i]?.depositAmount.toString() ?? null,
      status: onChain[i] ? (onChain[i]!.status.finalized ? "finalized" : "active") : null,
      title: h.title,
      description: h.description,
      organizer: h.organizer,
      startTs: h.startTs.toISOString(),
      endTs: h.endTs.toISOString(),
      requiredFires: h.requiredFires,
      phase: phase(h.startTs, h.endTs),
      teams: h._count.teams,
      participants: h._count.participants,
    }));
  });

  /** Registers off-chain metadata for a hackathon the organizer already created on-chain. */
  app.post("/hackathons", { preHandler: app.authenticate }, async (req, reply) => {
    const body = parse(
      z.object({
        address: z.string(),
        title: z.string().min(1).max(120),
        description: z.string().max(5000).default(""),
      }),
      req.body,
    );
    const user = await currentUser(deps, req);
    const address = toPubkey(body.address, "hackathon address");
    const h = await chain.fetchHackathon(address);
    if (!h) throw new HttpError(404, "Hackathon account not found on-chain");
    if (!user.wallet || h.organizer.toBase58() !== user.wallet) {
      throw new HttpError(403, "Only the organizer's linked wallet can register this hackathon");
    }
    if (!h.oracle.equals(chain.oraclePublicKey)) {
      throw new HttpError(400, `Hackathon oracle must be ${chain.oraclePublicKey.toBase58()}`);
    }
    const data = {
      title: body.title,
      description: body.description,
      organizer: h.organizer.toBase58(),
      startTs: new Date(h.startTs.toNumber() * 1000),
      endTs: new Date(h.endTs.toNumber() * 1000),
      requiredFires: h.requiredFires,
    };
    const saved = await prisma.hackathon.upsert({
      where: { id: address.toBase58() },
      create: { id: address.toBase58(), ...data },
      update: data,
    });
    return reply.code(201).send({ id: saved.id, title: saved.title });
  });

  app.get("/hackathons/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const { db, onChain } = await loadHackathon(id);
    const teams = await prisma.team.findMany({
      where: { hackathonId: db.id },
      include: { repos: true, _count: { select: { participants: true } } },
    });
    return {
      id: db.id,
      title: db.title,
      description: db.description,
      phase: phase(db.startTs, db.endTs),
      days: numberOfDays(db.startTs, db.endTs),
      ...chainView(onChain),
      teams: teams.map((t) => ({
        address: t.id,
        name: t.name,
        captain: t.captain,
        members: t._count.participants,
        repos: t.repos.map((r) => r.fullName),
      })),
    };
  });

  app.get("/hackathons/:id/participants", async (req) => {
    const { id } = parse(idParam, req.params);
    const { address, db, onChain } = await loadHackathon(id);
    const days = numberOfDays(db.startTs, db.endTs);

    const [chainParticipants, dbParticipants, teams, repoFlags] = await Promise.all([
      chain.listParticipants(address),
      prisma.participant.findMany({
        where: { hackathonId: db.id },
        include: {
          user: { select: { githubLogin: true } },
          fires: true,
          flags: true,
          _count: { select: { commits: true } },
        },
      }),
      prisma.team.findMany({ where: { hackathonId: db.id } }),
      prisma.fraudFlag.findMany({
        where: { participantId: null, repo: { hackathonId: db.id } },
        include: { repo: { select: { teamId: true, fullName: true } } },
      }),
    ]);
    const byId = new Map(dbParticipants.map((p) => [p.id, p]));
    const teamName = new Map(teams.map((t) => [t.id, t.name]));

    const rows = chainParticipants.map(({ address: pAddr, account }) => {
      const p = byId.get(pAddr.toBase58());
      const bitmap = BigInt(account.daysBitmap.toString());
      const fireByDay = new Map((p?.fires ?? []).map((f) => [f.dayIndex, f]));
      return {
        address: pAddr.toBase58(),
        wallet: account.wallet.toBase58(),
        team: account.team.toBase58(),
        teamName: teamName.get(account.team.toBase58()) ?? null,
        githubLogin: p?.user.githubLogin ?? null,
        fires: account.fires,
        requiredFires: onChain.requiredFires,
        qualified: !account.disqualified && account.fires >= onChain.requiredFires,
        disqualified: account.disqualified,
        disqualifiedReason: p?.disqualifiedReason ?? null,
        depositPaid: account.depositPaid,
        refundClaimed: account.refundClaimed,
        prizeClaimed: account.prizeClaimed,
        commitCount: p?._count.commits ?? 0,
        days: Array.from({ length: days }, (_, day) => {
          const fire = fireByDay.get(day);
          return {
            day,
            fire: (bitmap & (1n << BigInt(day))) !== 0n,
            commit: fire?.commitSha ?? null,
            tx: fire?.txSignature ?? null,
          };
        }),
        flags: (p?.flags ?? []).map((f) => ({
          kind: f.kind,
          details: f.details,
          createdAt: f.createdAt.toISOString(),
        })),
      };
    });

    // "No commits while the team is active" is computed on read, so it disappears once the member commits.
    const byTeam = new Map<string, typeof rows>();
    for (const r of rows) byTeam.set(r.team, [...(byTeam.get(r.team) ?? []), r]);
    for (const members of byTeam.values()) {
      for (const m of inactiveMembers(members)) {
        m.flags.push({
          kind: FraudKind.INACTIVE_MEMBER,
          details: { teamCommits: members.reduce((s, x) => s + x.commitCount, 0) },
          createdAt: new Date().toISOString(),
        });
      }
    }

    return {
      hackathon: db.id,
      days,
      currentDay: phase(db.startTs, db.endTs) === "running"
        ? Math.floor((Date.now() - db.startTs.getTime()) / 86_400_000)
        : null,
      requiredFires: onChain.requiredFires,
      participants: rows,
      teamFlags: repoFlags.map((f) => ({
        team: f.repo?.teamId ?? null,
        repo: f.repo?.fullName ?? null,
        kind: f.kind,
        details: f.details,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  });

  async function requireWalletUser(req: Parameters<typeof currentUser>[1]) {
    const user = await currentUser(deps, req);
    if (!user.wallet) throw new HttpError(400, "Link a wallet first (POST /auth/wallet)");
    return { user, wallet: new PublicKey(user.wallet) };
  }

  async function assertCanJoin(address: PublicKey, onChain: HackathonAccount, wallet: PublicKey) {
    if (Date.now() / 1000 >= onChain.registrationEndTs.toNumber()) {
      throw new HttpError(409, "Registration is closed");
    }
    if (onChain.organizer.equals(wallet)) {
      throw new HttpError(409, "The organizer cannot take part in their own hackathon");
    }
    const existing = await chain.fetchParticipant(chain.participantAddress(address, wallet));
    if (existing) throw new HttpError(409, "This wallet is already registered in this hackathon");
  }

  /** Throwaway GitHub accounts are a cheap way to add fake members: flag them for the organizer. */
  async function flagNewAccount(
    user: { githubLogin: string; githubCreatedAt: Date | null },
    participantId: string,
    hackathonStart: Date,
  ) {
    if (!isNewAccount(user.githubCreatedAt, hackathonStart, deps.config.NEW_ACCOUNT_DAYS)) return;
    await prisma.fraudFlag.upsert({
      where: { dedupeKey: `new-account:${participantId}` },
      create: {
        kind: FraudKind.NEW_GITHUB_ACCOUNT,
        dedupeKey: `new-account:${participantId}`,
        participantId,
        details: { login: user.githubLogin, createdAt: user.githubCreatedAt!.toISOString() },
      },
      update: {},
    });
  }

  /** Returns a transaction partially signed by the oracle; the wallet signs and sends it as is. */
  app.post("/hackathons/:id/register-tx", { preHandler: app.authenticate }, async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        teamName: z
          .string()
          .trim()
          .min(1)
          .refine((s) => Buffer.byteLength(s, "utf8") <= 32, "at most 32 bytes"),
      }),
      req.body,
    );
    const { user, wallet } = await requireWalletUser(req);
    const { address, db, onChain } = await loadHackathon(id);
    await assertCanJoin(address, onChain, wallet);

    const team = chain.teamAddress(address, body.teamName);
    if (await chain.fetchTeam(team)) throw new HttpError(409, "Team name is already taken");

    const transaction = await chain.buildRegisterTeamTx({
      hackathon: address,
      wallet,
      teamName: body.teamName,
      githubIdHash: Buffer.from(user.githubIdHash, "hex"),
    });

    const participant = chain.participantAddress(address, wallet).toBase58();
    const savedTeam = await prisma.team.upsert({
      where: { id: team.toBase58() },
      create: {
        id: team.toBase58(),
        hackathonId: db.id,
        name: body.teamName,
        captain: wallet.toBase58(),
        inviteCode: inviteCode(),
      },
      update: { captain: wallet.toBase58() },
    });
    await prisma.participant.upsert({
      where: { hackathonId_userId: { hackathonId: db.id, userId: user.id } },
      create: { id: participant, hackathonId: db.id, teamId: savedTeam.id, userId: user.id, wallet: wallet.toBase58() },
      update: { id: participant, teamId: savedTeam.id, wallet: wallet.toBase58() },
    });
    await flagNewAccount(user, participant, db.startTs);

    return { transaction, team: savedTeam.id, participant, inviteCode: savedTeam.inviteCode };
  });

  app.post("/hackathons/:id/join-tx", { preHandler: app.authenticate }, async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ inviteCode: z.string().min(1) }), req.body);
    const { user, wallet } = await requireWalletUser(req);
    const { address, db, onChain } = await loadHackathon(id);
    await assertCanJoin(address, onChain, wallet);

    const team = await prisma.team.findUnique({ where: { inviteCode: body.inviteCode } });
    if (!team || team.hackathonId !== db.id) throw new HttpError(404, "Invalid invite code");
    const teamOnChain = await chain.fetchTeam(new PublicKey(team.id));
    if (!teamOnChain) throw new HttpError(409, "The team is not confirmed on-chain yet");
    if (teamOnChain.members.length >= MAX_MEMBERS) throw new HttpError(409, "The team is full");

    const transaction = await chain.buildJoinTeamTx({
      hackathon: address,
      team: new PublicKey(team.id),
      wallet,
      githubIdHash: Buffer.from(user.githubIdHash, "hex"),
    });
    const participant = chain.participantAddress(address, wallet).toBase58();
    await prisma.participant.upsert({
      where: { hackathonId_userId: { hackathonId: db.id, userId: user.id } },
      create: { id: participant, hackathonId: db.id, teamId: team.id, userId: user.id, wallet: wallet.toBase58() },
      update: { id: participant, teamId: team.id, wallet: wallet.toBase58() },
    });
    await flagNewAccount(user, participant, db.startTs);
    return { transaction, team: team.id, participant };
  });

  /**
   * The organizer stores the human-readable reason after the on-chain `disqualify`.
   * Accepted only if the chain has the participant disqualified with SHA-256(reason).
   */
  app.post("/participants/:id/disqualification", { preHandler: app.authenticate }, async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ reason: z.string().trim().min(3).max(1000) }), req.body);
    const user = await currentUser(deps, req);
    const p = await prisma.participant.findUnique({ where: { id }, include: { hackathon: true } });
    if (!p) throw new HttpError(404, "Participant not found");
    if (!user.wallet || user.wallet !== p.hackathon.organizer) throw new HttpError(403, "Organizer only");
    const onChain = await chain.fetchParticipant(toPubkey(id));
    if (!onChain?.disqualified) throw new HttpError(409, "The participant is not disqualified on-chain");
    const expected = Buffer.from(onChain.disqualifyReason).toString("hex");
    if (sha256Hex(body.reason) !== expected) throw new HttpError(400, "The reason does not match the on-chain hash");
    await prisma.participant.update({ where: { id }, data: { disqualifiedReason: body.reason } });
    return { ok: true };
  });
}
