import Fastify, { type FastifyError, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { Deps } from "./deps.js";
import { HttpError } from "./http.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import hackathonRoutes from "./routes/hackathons.js";
import teamRoutes from "./routes/teams.js";
import webhookRoutes from "./routes/webhooks.js";
import attestationRoutes from "./routes/attestations.js";
import faucetRoutes from "./routes/faucet.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export async function buildApp(deps: Deps, opts: FastifyServerOptions = {}) {
  const app = Fastify({ trustProxy: true, bodyLimit: 5 * 1024 * 1024, ...opts });

  // Keep the raw body: the GitHub webhook signature is computed over the exact bytes.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    const buf = body as Buffer;
    req.rawBody = buf;
    if (buf.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(buf.toString("utf8")));
    } catch {
      done(new HttpError(400, "Invalid JSON"), undefined);
    }
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err instanceof HttpError ? err.statusCode : (err.statusCode ?? 500);
    if (status >= 500) req.log.error({ err }, "request failed");
    reply.code(status).send({ error: status >= 500 ? "Internal server error" : err.message });
  });

  await app.register(cors, { origin: deps.config.FRONTEND_URL, credentials: true });
  // Per IP by default; routes that spend oracle SOL set a stricter limit.
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(cookie);
  await app.register(authPlugin, { deps });

  app.get("/health", async () => ({ ok: true, oracle: deps.chain.oraclePublicKey.toBase58() }));
  await app.register(authRoutes, { deps });
  await app.register(hackathonRoutes, { deps });
  await app.register(teamRoutes, { deps });
  await app.register(webhookRoutes, { deps });
  await app.register(attestationRoutes, { deps });
  await app.register(faucetRoutes, { deps });
  return app;
}
