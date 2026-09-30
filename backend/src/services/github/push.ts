import { Prisma } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import type { FastifyBaseLogger } from "fastify";
import type { Deps } from "../../deps.js";
import { dayIndex } from "../ids.js";
import {
  FraudKind,
  commitDateSkewHours,
  fireEligibility,
  isCommitDateSkewed,
  isHistoryRewrite,
  isHugeCommit,
  type CommitDetails,
} from "../fraud/rules.js";
import { FIRE_GRACE_MS } from "./redelivery.js";

/** The subset of the GitHub push payload that is used. */
export type PushPayload = {
  ref: string;
  before: string;
  after: string;
  forced: boolean;
  created: boolean;
  deleted: boolean;
  /** The authenticated account that pushed. Unlike commit authors, it cannot be forged. */
  sender?: { login?: string };
  repository: { id: number; full_name: string; pushed_at?: number | string };
  commits: {
    id: string;
    distinct: boolean;
    timestamp: string;
    author?: { username?: string; email?: string };
  }[];
};

export type FireOutcome =
  | "fire_recorded"
  | "fire_already_today"
  | "pusher_not_in_team"
  | "no_own_commit"
  | "no_eligible_commit"
  | "outside_hackathon"
  | "push_too_old"
  | "fire_failed";

export type PushResult =
  | { status: "ignored"; reason: string }
  | {
      status: "processed";
      pusher: string | null;
      fire: { outcome: FireOutcome; sha?: string; day?: number; tx?: string };
      skipped: { sha: string; reason: string }[];
    };

/** At most this many commits of one push are inspected through the GitHub API. */
const MAX_INSPECTED = 30;
const RECORD_ATTEMPTS = 3;

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

async function flag(
  deps: Pick<Deps, "prisma">,
  data: {
    kind: FraudKind;
    dedupeKey: string;
    participantId?: string | null;
    repoId?: bigint;
    details: Prisma.InputJsonValue;
  },
) {
  await deps.prisma.fraudFlag.upsert({ where: { dedupeKey: data.dedupeKey }, create: data, update: {} });
}

/** GitHub sends repository.pushed_at as unix seconds in push events. */
function pushTime(payload: PushPayload, fallback: Date): Date {
  const v = payload.repository.pushed_at;
  if (typeof v === "number") return new Date(v * 1000);
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v);
  return fallback;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function processPush(
  deps: Pick<Deps, "prisma" | "chain" | "github" | "config">,
  payload: PushPayload,
  log: FastifyBaseLogger,
  now: Date = new Date(),
  retryDelayMs = 1500,
): Promise<PushResult> {
  const { prisma, chain, github, config } = deps;
  if (payload.deleted) return { status: "ignored", reason: "branch_deleted" };

  const repo = await prisma.repo.findUnique({
    where: { id: BigInt(payload.repository.id) },
    include: {
      hackathon: true,
      team: { include: { participants: { include: { user: true } } } },
    },
  });
  if (!repo) return { status: "ignored", reason: "repo_not_registered" };
  const hackathon = repo.hackathon;
  const pushedAt = pushTime(payload, now);

  const byLogin = new Map(repo.team.participants.map((p) => [p.user.githubLogin.toLowerCase(), p]));
  const pusherLogin = payload.sender?.login?.toLowerCase() ?? null;
  const pusher = pusherLogin ? byLogin.get(pusherLogin) : undefined;

  if (isHistoryRewrite(payload)) {
    await flag(deps, {
      kind: FraudKind.FORCE_PUSH,
      dedupeKey: `force:${repo.id}:${payload.after}`,
      participantId: pusher?.id ?? null,
      repoId: repo.id,
      details: { ref: payload.ref, before: payload.before, after: payload.after, pusher: pusherLogin },
    });
  }

  const commits = payload.commits.filter((c) => c.distinct).slice(0, MAX_INSPECTED);
  const details = new Map<string, CommitDetails | null>();
  let pushLines = 0;

  for (const c of commits) {
    const d = await github.getCommit(Number(repo.installationId), repo.fullName, c.id).catch((e: unknown) => {
      log.warn({ err: e, sha: c.id }, "could not fetch commit details");
      return null;
    });
    details.set(c.id, d);
    if (d) pushLines += d.additions + d.deletions;

    const authorLogin = c.author?.username?.toLowerCase();
    const authoredBySelf = !!pusher && authorLogin === pusherLogin;
    const namedMember = authorLogin ? byLogin.get(authorLogin) : undefined;
    const authoredAt = new Date(c.timestamp);

    await prisma.commit.upsert({
      where: { repoId_sha: { repoId: repo.id, sha: c.id } },
      create: {
        sha: c.id,
        repoId: repo.id,
        // Credited to the pusher only when they are also the author: a commit written "as" someone
        // else does not count as that person's work.
        participantId: authoredBySelf ? pusher!.id : null,
        authorLogin: c.author?.username ?? null,
        authoredAt,
        pushedAt,
        additions: d?.additions ?? null,
        deletions: d?.deletions ?? null,
      },
      update: {},
    });

    if (namedMember && pusher && namedMember.id !== pusher.id) {
      await flag(deps, {
        kind: FraudKind.AUTHOR_MISMATCH,
        dedupeKey: `author:${repo.id}:${c.id}`,
        participantId: namedMember.id,
        repoId: repo.id,
        details: { sha: c.id, author: c.author?.username ?? null, pusher: pusherLogin },
      });
    }
    if (d && isHugeCommit(d, config.HUGE_COMMIT_LINES)) {
      await flag(deps, {
        kind: FraudKind.HUGE_COMMIT,
        dedupeKey: `huge:${repo.id}:${c.id}`,
        participantId: pusher?.id ?? null,
        repoId: repo.id,
        details: { sha: c.id, additions: d.additions, deletions: d.deletions, threshold: config.HUGE_COMMIT_LINES },
      });
    }
    if (isCommitDateSkewed(authoredAt, pushedAt, config.COMMIT_SKEW_HOURS)) {
      await flag(deps, {
        kind: FraudKind.COMMIT_DATE_SKEW,
        dedupeKey: `skew:${repo.id}:${c.id}`,
        participantId: pusher?.id ?? null,
        repoId: repo.id,
        details: {
          sha: c.id,
          authoredAt: authoredAt.toISOString(),
          pushedAt: pushedAt.toISOString(),
          hours: Math.round(commitDateSkewHours(authoredAt, pushedAt) * 10) / 10,
        },
      });
    }
  }

  if (pushLines > config.BULK_PUSH_LINES) {
    await flag(deps, {
      kind: FraudKind.BULK_PUSH,
      dedupeKey: `bulk:${repo.id}:${payload.after}`,
      participantId: pusher?.id ?? null,
      repoId: repo.id,
      details: { lines: pushLines, commits: commits.length, threshold: config.BULK_PUSH_LINES },
    });
  }

  const done = (fire: Extract<PushResult, { status: "processed" }>["fire"], skipped: { sha: string; reason: string }[] = []) =>
    ({ status: "processed", pusher: pusherLogin, fire, skipped }) as const;

  if (!pusher) return done({ outcome: "pusher_not_in_team" });
  if (pushedAt < hackathon.startTs || pushedAt >= hackathon.endTs) return done({ outcome: "outside_hackathon" });
  if (now.getTime() - pushedAt.getTime() > FIRE_GRACE_MS) return done({ outcome: "push_too_old" });

  const own = commits.filter((c) => c.author?.username?.toLowerCase() === pusherLogin);
  if (own.length === 0) return done({ outcome: "no_own_commit" });

  const skipped: { sha: string; reason: string }[] = [];
  const eligible = own.find((c) => {
    const verdict = fireEligibility(details.get(c.id) ?? null, {
      minLines: config.MIN_FIRE_LINES,
      requireVerified: config.REQUIRE_VERIFIED_COMMITS,
    });
    if (!verdict.ok) skipped.push({ sha: c.id, reason: verdict.reason });
    return verdict.ok;
  });
  if (!eligible) return done({ outcome: "no_eligible_commit" }, skipped);

  const day = dayIndex(pushedAt, hackathon.startTs);
  // Reserve the (participant, day) slot first so concurrent pushes do not send two transactions.
  const reserved = await prisma.fire
    .create({ data: { participantId: pusher.id, dayIndex: day, commitSha: eligible.id } })
    .catch((e: unknown) => {
      if (isUniqueViolation(e)) return null;
      throw e;
    });
  if (!reserved) return done({ outcome: "fire_already_today", sha: eligible.id, day }, skipped);

  for (let attempt = 1; attempt <= RECORD_ATTEMPTS; attempt++) {
    try {
      const tx = await chain.recordFire({
        hackathon: new PublicKey(hackathon.id),
        participant: new PublicKey(pusher.id),
        team: new PublicKey(repo.teamId),
        day,
        commitSha: eligible.id,
        pushedAt,
      });
      await prisma.fire.update({ where: { id: reserved.id }, data: { txSignature: tx } });
      return done({ outcome: "fire_recorded", sha: eligible.id, day, tx }, skipped);
    } catch (e) {
      log.error({ err: e, sha: eligible.id, participant: pusher.id, day, attempt }, "record_fire failed");
      if (attempt < RECORD_ATTEMPTS) await sleep(retryDelayMs * attempt);
    }
  }
  await prisma.fire.delete({ where: { id: reserved.id } });
  return done({ outcome: "fire_failed", sha: eligible.id, day }, skipped);
}
