import { describe, it, expect } from "vitest";
import {
  commitDateSkewHours,
  inactiveMembers,
  isCommitDateSkewed,
  isHistoryRewrite,
  isHugeCommit,
  repoCreatedBeforeStart,
} from "../src/services/fraud/rules.js";
import { commitHashBytes, dayIndex, githubIdHash, numberOfDays } from "../src/services/ids.js";

const start = new Date("2026-10-01T00:00:00Z");

describe("fraud rules", () => {
  it("repo created before the start", () => {
    expect(repoCreatedBeforeStart(new Date("2026-09-30T23:59:59Z"), start)).toBe(true);
    expect(repoCreatedBeforeStart(new Date("2026-10-01T00:00:00Z"), start)).toBe(false);
  });

  it("huge commit counts additions + deletions strictly above the threshold", () => {
    expect(isHugeCommit({ additions: 1500, deletions: 501 }, 2000)).toBe(true);
    expect(isHugeCommit({ additions: 1500, deletions: 500 }, 2000)).toBe(false);
  });

  it("commit date skew works in both directions", () => {
    const pushed = new Date("2026-10-02T12:00:00Z");
    expect(commitDateSkewHours(new Date("2026-10-02T02:00:00Z"), pushed)).toBe(10);
    expect(isCommitDateSkewed(new Date("2026-10-02T02:00:00Z"), pushed, 6)).toBe(true);
    expect(isCommitDateSkewed(new Date("2026-10-02T20:00:00Z"), pushed, 6)).toBe(true);
    expect(isCommitDateSkewed(new Date("2026-10-02T09:00:00Z"), pushed, 6)).toBe(false);
  });

  it("only a forced push to an existing branch is a history rewrite", () => {
    expect(isHistoryRewrite({ forced: true, created: false, deleted: false })).toBe(true);
    expect(isHistoryRewrite({ forced: true, created: true, deleted: false })).toBe(false);
    expect(isHistoryRewrite({ forced: false, created: false, deleted: false })).toBe(false);
  });

  it("inactive members are flagged only when a teammate has commits", () => {
    const team = [
      { id: "a", commitCount: 3 },
      { id: "b", commitCount: 0 },
    ];
    expect(inactiveMembers(team).map((m) => m.id)).toEqual(["b"]);
    expect(inactiveMembers([{ id: "a", commitCount: 0 }, { id: "b", commitCount: 0 }])).toEqual([]);
  });
});

describe("ids", () => {
  it("day index matches the program formula floor((now - start) / 86400)", () => {
    expect(dayIndex(new Date("2026-10-01T23:59:59Z"), start)).toBe(0);
    expect(dayIndex(new Date("2026-10-02T00:00:00Z"), start)).toBe(1);
    expect(numberOfDays(start, new Date("2026-10-03T12:00:00Z"))).toBe(3);
  });

  it("github id hash is salted and 32 bytes", () => {
    const a = githubIdHash("salt-one-xxxxxxxx", 123);
    expect(a).toHaveLength(32);
    expect(a.equals(githubIdHash("salt-one-xxxxxxxx", 123))).toBe(true);
    expect(a.equals(githubIdHash("salt-two-xxxxxxxx", 123))).toBe(false);
  });

  it("commit hash is 20 bytes; SHA-256 shas are truncated; garbage is rejected", () => {
    const sha1 = "a".repeat(40);
    expect(commitHashBytes(sha1)).toHaveLength(20);
    expect(commitHashBytes("b".repeat(64))).toHaveLength(20);
    expect(() => commitHashBytes("not-a-sha")).toThrow();
  });
});

import { fireEligibility, isNewAccount } from "../src/services/fraud/rules.js";
import { selectRedeliveries, FIRE_GRACE_MS } from "../src/services/github/redelivery.js";

describe("fire eligibility", () => {
  const base = { additions: 5, deletions: 0, parents: 1, verified: false };
  const opts = { minLines: 3, requireVerified: false };
  it("accepts a normal commit and unknown details", () => {
    expect(fireEligibility(base, opts)).toEqual({ ok: true });
    expect(fireEligibility(null, opts)).toEqual({ ok: true });
  });
  it("rejects merges, tiny commits and unsigned commits when required", () => {
    expect(fireEligibility({ ...base, parents: 2 }, opts)).toEqual({ ok: false, reason: "merge_commit" });
    expect(fireEligibility({ ...base, additions: 1, deletions: 1 }, opts)).toEqual({ ok: false, reason: "too_small" });
    expect(fireEligibility(base, { ...opts, requireVerified: true })).toEqual({ ok: false, reason: "unverified" });
  });
});

describe("new GitHub accounts", () => {
  const ref = new Date("2026-10-01T00:00:00Z");
  it("flags accounts younger than N days before the hackathon", () => {
    expect(isNewAccount(new Date("2026-09-20T00:00:00Z"), ref, 30)).toBe(true);
    expect(isNewAccount(new Date("2025-01-01T00:00:00Z"), ref, 30)).toBe(false);
    expect(isNewAccount(null, ref, 30)).toBe(false);
  });
});

describe("webhook redelivery selection", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000);
  const dl = (id: number, guid: string, statusCode: number, minAgo: number, event = "push") => ({
    id, guid, statusCode, deliveredAt: at(minAgo), event,
  });

  it("picks failed pushes inside the grace period that never reached us", () => {
    const picked = selectRedeliveries(
      [
        dl(1, "a", 0, 10), // server was down -> redeliver
        dl(2, "b", 502, 20), // proxy error -> redeliver
        dl(3, "c", 202, 5), // fine
        dl(4, "d", 0, FIRE_GRACE_MS / 60_000 + 5), // too old to earn a fire
        dl(5, "e", 0, 30, "ping"), // not a push
        dl(6, "f", 0, 40), // failed, but a later attempt succeeded
        dl(7, "f", 202, 35),
        dl(8, "g", 0, 15), // failed at GitHub, but we have it
        dl(9, "a", 0, 12), // same guid twice -> once
      ],
      new Set(["g"]),
      now,
    );
    expect(picked.map((p) => p.id)).toEqual([1, 2]);
  });
});
