import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { Deps } from "../deps.js";
import { HttpError } from "../http.js";
import { verifyWebhookSignature } from "../services/github/signature.js";
import { processPush, type PushPayload } from "../services/github/push.js";

export default async function webhookRoutes(app: FastifyInstance, { deps }: { deps: Deps }) {
  // GitHub sends bursts from a few IPs; the HMAC signature is the protection here.
  app.post("/webhooks/github", { config: { rateLimit: false } }, async (req, reply) => {
    const signature = req.headers["x-hub-signature-256"];
    if (
      !req.rawBody ||
      !verifyWebhookSignature(
        deps.config.GITHUB_WEBHOOK_SECRET,
        req.rawBody,
        typeof signature === "string" ? signature : undefined,
      )
    ) {
      throw new HttpError(401, "Invalid webhook signature");
    }

    const event = String(req.headers["x-github-event"] ?? "");
    const delivery = String(req.headers["x-github-delivery"] ?? "");
    if (!delivery) throw new HttpError(400, "Missing X-GitHub-Delivery");

    try {
      await deps.prisma.webhookDelivery.create({ data: { id: delivery, event } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return reply.code(200).send({ duplicate: true });
      }
      throw e;
    }

    if (event === "ping") return { pong: true };
    if (event !== "push") return reply.code(202).send({ ignored: event });

    // GitHub waits at most 10 s; record_fire confirmation can take longer, so answer first.
    const log = req.log.child({ delivery });
    void processPush(deps, req.body as PushPayload, log)
      .then((result) => log.info({ result }, "push processed"))
      .catch((err: unknown) => log.error({ err }, "push processing failed"));
    return reply.code(202).send({ accepted: true });
  });
}
