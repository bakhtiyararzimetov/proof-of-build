import type { FastifyBaseLogger } from "fastify";
import type { Deps } from "../../deps.js";
import type { HookDelivery } from "./client.js";

/** Pushes older than this cannot earn a fire any more (matches the program's FIRE_GRACE). */
export const FIRE_GRACE_MS = 3 * 3_600_000;

/**
 * Push deliveries that failed (server down, 5xx, timeout), are still inside the fire grace period,
 * never reached us, and were not already redelivered successfully.
 */
export function selectRedeliveries(
  deliveries: HookDelivery[],
  received: Set<string>,
  now: Date,
): HookDelivery[] {
  const ok = (d: HookDelivery) => d.statusCode >= 200 && d.statusCode < 300;
  const succeeded = new Set(deliveries.filter(ok).map((d) => d.guid));
  const picked = new Map<string, HookDelivery>();
  for (const d of deliveries) {
    if (d.event !== "push" || ok(d)) continue;
    if (now.getTime() - d.deliveredAt.getTime() > FIRE_GRACE_MS) continue;
    if (succeeded.has(d.guid) || received.has(d.guid) || picked.has(d.guid)) continue;
    picked.set(d.guid, d);
  }
  return [...picked.values()];
}

/** Asks GitHub to resend push webhooks we missed. Runs at startup and periodically. */
export async function redeliverMissedPushes(deps: Pick<Deps, "github" | "prisma">, log: FastifyBaseLogger) {
  const deliveries = await deps.github.listDeliveries();
  const guids = deliveries.map((d) => d.guid);
  const seen = await deps.prisma.webhookDelivery.findMany({ where: { id: { in: guids } }, select: { id: true } });
  const todo = selectRedeliveries(deliveries, new Set(seen.map((s) => s.id)), new Date());
  for (const d of todo) {
    await deps.github.redeliver(d.id);
    log.info({ delivery: d.guid }, "requested webhook redelivery");
  }
  return todo.length;
}
