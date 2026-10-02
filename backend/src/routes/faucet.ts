import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { HttpError, explorerTx, parse, toPubkey } from "../http.js";
import { currentUser } from "../plugins/auth.js";

/** 1000 test tokens (6 decimals). */
const FAUCET_AMOUNT = 1_000_000_000n;

export default async function faucetRoutes(app: FastifyInstance, { deps }: { deps: Deps }) {
  const { prisma, chain, config } = deps;

  /** Gives the linked wallet test USDC for a devnet hackathon, so the deposit can be paid. */
  app.post(
    "/faucet",
    { preHandler: app.authenticate, config: { rateLimit: { max: 5, timeWindow: "1 day" } } },
    async (req, reply) => {
      const body = parse(z.object({ hackathon: z.string() }), req.body);
      const user = await currentUser(deps, req);
      if (!user.wallet) throw new HttpError(409, "Connect a wallet first");
      const h = await chain.fetchHackathon(toPubkey(body.hackathon, "hackathon id"));
      if (!h || !(await prisma.hackathon.findUnique({ where: { id: body.hackathon } }))) {
        throw new HttpError(404, "Hackathon not found");
      }
      if (!(await chain.canMint(h.mint))) {
        throw new HttpError(400, "This hackathon uses a real token: there is no faucet for it");
      }
      const wallet = toPubkey(user.wallet);
      if ((await chain.tokenBalance(h.mint, wallet)) >= FAUCET_AMOUNT) {
        throw new HttpError(409, "This wallet already has enough test USDC");
      }
      const tx = await chain.mintTestTokens(h.mint, wallet, FAUCET_AMOUNT);
      return reply.code(201).send({ amount: FAUCET_AMOUNT.toString(), tx, explorer: explorerTx(config.RPC_URL, tx) });
    },
  );
}
