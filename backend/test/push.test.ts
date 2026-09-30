import { describe, it, expect, beforeEach } from "vitest";
import { processPush, type PushPayload } from "../src/services/github/push.js";
import type { CommitDetails } from "../src/services/fraud/rules.js";
import { ALICE_P, BOB_P, DAY_MS, HACKATHON, START, END, TEAM, config, fakeChain, fakePrisma, silentLog } from "./helpers.js";

const sha = (n: number) => n.toString(16).padStart(40, "0");
const day1 = new Date(START.getTime() + DAY_MS + 3_600_000);

function push(p: Partial<PushPayload> & { commits: PushPayload["commits"]; at?: Date; by?: string }): PushPayload {
  const { at = day1, by = "alice", ...rest } = p;
  return {
    ref: "refs/heads/main",
    before: sha(0),
    after: sha(999),
    forced: false,
    created: false,
    deleted: false,
    sender: { login: by },
    repository: { id: 42, full_name: "team/app", pushed_at: Math.floor(at.getTime() / 1000) },
    ...rest,
  };
}

const commit = (n: number, author: string | undefined, at: Date = day1) => ({
  id: sha(n),
  distinct: true,
  timestamp: at.toISOString(),
  author: author ? { username: author } : {},
});

describe("processPush", () => {
  let env: ReturnType<typeof fakePrisma>;
  let ch: ReturnType<typeof fakeChain>;
  let details: Record<string, CommitDetails>;
  let deps: any;
  const d = (lines: number, extra: Partial<CommitDetails> = {}): CommitDetails => ({
    additions: lines,
    deletions: 0,
    parents: 1,
    verified: true,
    ...extra,
  });

  beforeEach(() => {
    env = fakePrisma();
    ch = fakeChain();
    details = {};
    deps = {
      prisma: env.prisma,
      chain: ch.chain,
      config,
      github: {
        getCommit: async (_i: number, _r: string, s: string) => {
          if (!details[s]) throw new Error("api down");
          return details[s];
        },
      },
    };
  });

  const run = (p: PushPayload, now = day1) => processPush(deps, p, silentLog, now, 0);

  it("credits the pusher for their own commit, on the day GitHub received the push", async () => {
    details[sha(1)] = d(20);
    const r = await run(push({ commits: [commit(1, "Alice")] }));
    expect(r.status === "processed" && r.fire.outcome).toBe("fire_recorded");
    expect(ch.calls).toEqual([
      { hackathon: HACKATHON, participant: ALICE_P, team: TEAM, day: 1, sha: sha(1), pushedAt: day1 },
    ]);
  });

  it("ATTACK: a push of commits written as a teammate gives the teammate nothing, and is flagged", async () => {
    details[sha(1)] = d(20);
    details[sha(2)] = d(20);
    const r = await run(push({ by: "alice", commits: [commit(1, "bob"), commit(2, "bob")] }));
    expect(r.status === "processed" && r.fire.outcome).toBe("no_own_commit");
    expect(ch.calls).toHaveLength(0);
    const mismatch = env.db.flags.filter((f) => f.kind === "AUTHOR_MISMATCH");
    expect(mismatch).toHaveLength(2);
    expect(mismatch[0].participantId).toBe(BOB_P);
    // the commits are not counted as bob's work either
    expect(env.db.commits.every((c) => c.participantId === null)).toBe(true);
  });

  it("ATTACK: a pusher outside the team gets nothing", async () => {
    details[sha(1)] = d(20);
    const r = await run(push({ by: "mallory", commits: [commit(1, "mallory")] }));
    expect(r.status === "processed" && r.fire.outcome).toBe("pusher_not_in_team");
  });

  it("ATTACK: empty/tiny commits and merge commits do not earn a fire", async () => {
    details[sha(1)] = d(1);
    details[sha(2)] = d(200, { parents: 2 });
    const r = await run(push({ commits: [commit(1, "alice"), commit(2, "alice")] }));
    expect(r.status === "processed" && r.fire.outcome).toBe("no_eligible_commit");
    expect(r.status === "processed" && r.skipped.map((s) => s.reason)).toEqual(["too_small", "merge_commit"]);
  });

  it("picks the first eligible own commit", async () => {
    details[sha(1)] = d(1);
    details[sha(2)] = d(10);
    await run(push({ commits: [commit(1, "alice"), commit(2, "alice")] }));
    expect(ch.calls[0].sha).toBe(sha(2));
  });

  it("requires verified commits when configured", async () => {
    deps.config = { ...config, REQUIRE_VERIFIED_COMMITS: true };
    details[sha(1)] = d(10, { verified: false });
    const r = await run(push({ commits: [commit(1, "alice")] }));
    expect(r.status === "processed" && r.skipped[0].reason).toBe("unverified");
  });

  it("one fire per participant per day", async () => {
    details[sha(1)] = d(10);
    details[sha(2)] = d(10);
    await run(push({ commits: [commit(1, "alice")] }));
    const r = await run(push({ commits: [commit(2, "alice")] }));
    expect(r.status === "processed" && r.fire.outcome).toBe("fire_already_today");
    expect(ch.calls).toHaveLength(1);
  });

  it("a late delivery (within 3h) is credited to the push day, not the delivery day", async () => {
    details[sha(1)] = d(10);
    const pushedAt = new Date(START.getTime() + DAY_MS - 60_000); // last minute of day 0
    const r = await run(push({ at: pushedAt, commits: [commit(1, "alice", pushedAt)] }), new Date(pushedAt.getTime() + 2 * 3_600_000));
    expect(r.status === "processed" && r.fire.day).toBe(0);
  });

  it("ATTACK: a push older than the grace period is not credited", async () => {
    details[sha(1)] = d(10);
    const r = await run(push({ commits: [commit(1, "alice")] }), new Date(day1.getTime() + 4 * 3_600_000));
    expect(r.status === "processed" && r.fire.outcome).toBe("push_too_old");
  });

  it("no fires outside the hackathon", async () => {
    details[sha(1)] = d(10);
    const after = new Date(END.getTime() + 1000);
    const r = await run(push({ at: after, commits: [commit(1, "alice", after)] }), after);
    expect(r.status === "processed" && r.fire.outcome).toBe("outside_hackathon");
  });

  it("retries the transaction and releases the day slot if it keeps failing", async () => {
    details[sha(1)] = d(10);
    ch.failNextFires(2);
    const ok = await run(push({ commits: [commit(1, "alice")] }));
    expect(ok.status === "processed" && ok.fire.outcome).toBe("fire_recorded");

    details[sha(2)] = d(10);
    ch.failNextFires(3);
    const failed = await run(push({ by: "bob", commits: [commit(2, "bob")] }));
    expect(failed.status === "processed" && failed.fire.outcome).toBe("fire_failed");
    expect(env.db.fires.filter((f) => f.participantId === BOB_P)).toHaveLength(0);
  });

  it("if the GitHub API is down the fire is still granted (details unknown)", async () => {
    const r = await run(push({ commits: [commit(1, "alice")] }));
    expect(r.status === "processed" && r.fire.outcome).toBe("fire_recorded");
  });

  it("ATTACK: flags every huge commit, not only the first", async () => {
    details[sha(1)] = d(10);
    details[sha(2)] = d(2500);
    await run(push({ commits: [commit(1, "alice"), commit(2, "alice")] }));
    const huge = env.db.flags.filter((f) => f.kind === "HUGE_COMMIT");
    expect(huge.map((f) => f.details.sha)).toEqual([sha(2)]);
  });

  it("ATTACK: flags old code poured in as many small commits (bulk push)", async () => {
    const commits = Array.from({ length: 6 }, (_, i) => {
      details[sha(i + 1)] = d(1900);
      return commit(i + 1, "alice");
    });
    await run(push({ commits }));
    expect(env.db.flags.filter((f) => f.kind === "BULK_PUSH")).toHaveLength(1);
    expect(env.db.flags.filter((f) => f.kind === "HUGE_COMMIT")).toHaveLength(0);
  });

  it("flags a forced push that rewrites history, once", async () => {
    const p = push({ forced: true, commits: [] });
    await run(p);
    await run(p);
    expect(env.db.flags.map((f) => f.kind)).toEqual(["FORCE_PUSH"]);
  });

  it("flags a backdated commit but still counts the fire (time comes from GitHub, not git)", async () => {
    details[sha(1)] = d(10);
    const backdated = new Date(day1.getTime() - 20 * 3_600_000);
    const r = await run(push({ commits: [commit(1, "alice", backdated)] }));
    expect(env.db.flags.map((f) => f.kind)).toEqual(["COMMIT_DATE_SKEW"]);
    expect(r.status === "processed" && r.fire.day).toBe(1);
  });

  it("ignores unregistered repositories", async () => {
    const r = await run(push({ repository: { id: 1, full_name: "x/y" }, commits: [commit(1, "alice")] }));
    expect(r).toEqual({ status: "ignored", reason: "repo_not_registered" });
  });
});
