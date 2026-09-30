import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { HttpError, parse, toPubkey } from "../http.js";
import { currentUser } from "../plugins/auth.js";
import { githubIdHash } from "../services/ids.js";
import { NONCE_TTL_MS, buildLinkMessage, verifyWalletSignature } from "../services/wallet/verify.js";

const STATE_COOKIE = "gh_oauth_state";

export function userView(u: {
  id: string;
  githubLogin: string;
  email: string | null;
  wallet: string | null;
}) {
  return { id: u.id, githubLogin: u.githubLogin, hasEmail: !!u.email, wallet: u.wallet };
}

export default async function authRoutes(app: FastifyInstance, { deps }: { deps: Deps }) {
  const { config, prisma, github } = deps;
  const redirectUri = `${config.PUBLIC_URL}/auth/github/callback`;
  // PUBLIC_URL may carry a prefix (e.g. https://site/api behind the frontend proxy): the cookie path must include it.
  const statePath = `${new URL(config.PUBLIC_URL).pathname.replace(/\/$/, "")}/auth/github`;

  app.get("/auth/github", async (_req, reply) => {
    const state = randomBytes(16).toString("hex");
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.PUBLIC_URL.startsWith("https"),
      path: statePath,
      maxAge: 600,
    });
    return reply.redirect(github.authorizeUrl(state, redirectUri));
  });

  app.get("/auth/github/callback", async (req, reply) => {
    const q = parse(z.object({ code: z.string().min(1), state: z.string().min(1) }), req.query);
    const expected = req.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: "/auth/github" });
    if (!expected || expected !== q.state) throw new HttpError(400, "Invalid OAuth state");

    const token = await github.exchangeCode(q.code, redirectUri);
    const gh = await github.getUser(token);
    const user = await prisma.user.upsert({
      where: { githubId: BigInt(gh.id) },
      create: {
        githubId: BigInt(gh.id),
        githubLogin: gh.login,
        githubIdHash: githubIdHash(config.GITHUB_ID_SALT, gh.id).toString("hex"),
        email: gh.email,
        githubCreatedAt: gh.createdAt,
      },
      update: { githubLogin: gh.login, email: gh.email ?? undefined, githubCreatedAt: gh.createdAt ?? undefined },
    });
    const jwt = app.jwt.sign({ sub: user.id });
    // Fragment, so the token never reaches the frontend server logs.
    return reply.redirect(`${config.FRONTEND_URL}/auth/callback#token=${jwt}`);
  });

  app.get("/me", { preHandler: app.authenticate }, async (req) => {
    const user = await currentUser(deps, req);
    const [participations, organized] = await Promise.all([
      prisma.participant.findMany({
        where: { userId: user.id },
        include: { team: true, hackathon: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
      }),
      user.wallet
        ? prisma.hackathon.findMany({
            where: { organizer: user.wallet },
            select: { id: true, title: true },
            orderBy: { createdAt: "desc" },
          })
        : [],
    ]);
    return {
      ...userView(user),
      participations: participations.map((p) => ({
        participant: p.id,
        wallet: p.wallet,
        hackathon: p.hackathon,
        team: {
          id: p.team.id,
          name: p.team.name,
          isCaptain: p.team.captain === p.wallet,
          inviteCode: p.team.inviteCode,
        },
      })),
      organized,
    };
  });

  app.post("/auth/wallet/nonce", { preHandler: app.authenticate }, async (req) => {
    const body = parse(z.object({ wallet: z.string() }), req.body);
    const wallet = toPubkey(body.wallet, "wallet").toBase58();
    const user = await currentUser(deps, req);
    const nonce = randomBytes(16).toString("hex");
    const message = buildLinkMessage({
      wallet,
      githubLogin: user.githubLogin,
      nonce,
      issuedAt: new Date(),
    });
    await prisma.walletNonce.create({
      data: { nonce, userId: user.id, wallet, message, expiresAt: new Date(Date.now() + NONCE_TTL_MS) },
    });
    return { nonce, message };
  });

  app.post("/auth/wallet", { preHandler: app.authenticate }, async (req) => {
    const body = parse(
      z.object({ wallet: z.string(), nonce: z.string(), signature: z.string() }),
      req.body,
    );
    const user = await currentUser(deps, req);
    const n = await prisma.walletNonce.findUnique({ where: { nonce: body.nonce } });
    if (!n || n.userId !== user.id || n.wallet !== body.wallet) {
      throw new HttpError(400, "Unknown nonce");
    }
    if (n.usedAt || n.expiresAt < new Date()) throw new HttpError(400, "Nonce expired or already used");
    if (!verifyWalletSignature(n.message, body.signature, body.wallet)) {
      throw new HttpError(401, "Invalid wallet signature");
    }

    // Mark the nonce used first, conditionally, so a replay racing this request cannot reuse it.
    const used = await prisma.walletNonce.updateMany({
      where: { nonce: n.nonce, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) throw new HttpError(400, "Nonce expired or already used");

    try {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { wallet: body.wallet },
      });
      return userView(updated);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new HttpError(409, "This wallet is already linked to another GitHub account");
      }
      throw e;
    }
  });
}
