import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { HttpError, explorerTx, parse, toPubkey } from "../http.js";
import { currentUser } from "../plugins/auth.js";

/** 1000 test tokens (6 decimals). */
const FAUCET_AMOUNT = 1_000_000_000n;
/** Per GitHub account, not per IP: a whole classroom often shares one IP. */
const PER_USER_PER_DAY = 5;
const DAY_MS = 86_400_000;

export default async function faucetRoutes(app: FastifyInstance, { deps }: { deps: Deps }) {
  const { prisma, chain, config } = deps;
  const recent = new Map<string, number[]>();

  /** Gives the linked wallet test USDC: for a hackathon's deposit, or for the prize of a new hackathon (by mint). */
  app.post(
    "/faucet",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = parse(
        z.union([z.object({ hackathon: z.string() }), z.object({ mint: z.string() })]),
        req.body,
      );
      const user = await currentUser(deps, req);
      if (!user.wallet) throw new HttpError(409, "Connect a wallet first");
      let mint;
      if ("hackathon" in body) {
        const h = await chain.fetchHackathon(toPubkey(body.hackathon, "hackathon id"));
        if (!h || !(await prisma.hackathon.findUnique({ where: { id: body.hackathon } }))) {
          throw new HttpError(404, "Hackathon not found");
        }
        mint = h.mint;
      } else {
        mint = toPubkey(body.mint, "mint");
      }
      if (!(await chain.canMint(mint))) {
        throw new HttpError(400, "This hackathon uses a real token: there is no faucet for it");
      }
      const now = Date.now();
      const times = (recent.get(user.id) ?? []).filter((t) => now - t < DAY_MS);
      if (times.length >= PER_USER_PER_DAY) throw new HttpError(429, "Test USDC limit reached, try again tomorrow");
      const wallet = toPubkey(user.wallet);
      if ((await chain.tokenBalance(mint, wallet)) >= FAUCET_AMOUNT) {
        throw new HttpError(409, "This wallet already has enough test USDC");
      }
      const tx = await chain.mintTestTokens(mint, wallet, FAUCET_AMOUNT);
      recent.set(user.id, [...times, now]);
      return reply.code(201).send({ amount: FAUCET_AMOUNT.toString(), tx, explorer: explorerTx(config.RPC_URL, tx) });
    },
  );
}
