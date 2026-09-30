// Pure anti-fraud rules. Results are stored as FraudFlag rows in the DB, never on-chain,
// and they do not block fires: the organizer decides what to do with a flagged team.

export const FraudKind = {
  REPO_CREATED_BEFORE_START: "REPO_CREATED_BEFORE_START",
  HUGE_COMMIT: "HUGE_COMMIT",
  BULK_PUSH: "BULK_PUSH",
  COMMIT_DATE_SKEW: "COMMIT_DATE_SKEW",
  FORCE_PUSH: "FORCE_PUSH",
  AUTHOR_MISMATCH: "AUTHOR_MISMATCH",
  NEW_GITHUB_ACCOUNT: "NEW_GITHUB_ACCOUNT",
  INACTIVE_MEMBER: "INACTIVE_MEMBER",
} as const;
export type FraudKind = (typeof FraudKind)[keyof typeof FraudKind];

export function repoCreatedBeforeStart(repoCreatedAt: Date, hackathonStart: Date): boolean {
  return repoCreatedAt.getTime() < hackathonStart.getTime();
}

export function isHugeCommit(
  stats: { additions: number; deletions: number },
  thresholdLines: number,
): boolean {
  return stats.additions + stats.deletions > thresholdLines;
}

export function commitDateSkewHours(authoredAt: Date, pushedAt: Date): number {
  return Math.abs(pushedAt.getTime() - authoredAt.getTime()) / 3_600_000;
}

export function isCommitDateSkewed(authoredAt: Date, pushedAt: Date, thresholdHours: number): boolean {
  return commitDateSkewHours(authoredAt, pushedAt) > thresholdHours;
}

/** A forced push to an existing branch rewrites history. Branch creation and deletion are not rewrites. */
export function isHistoryRewrite(push: { forced: boolean; created: boolean; deleted: boolean }): boolean {
  return push.forced && !push.created && !push.deleted;
}

/** Members with no commits while at least one teammate has commits. */
export function inactiveMembers<T extends { commitCount: number }>(members: T[]): T[] {
  if (!members.some((m) => m.commitCount > 0)) return [];
  return members.filter((m) => m.commitCount === 0);
}

export type CommitDetails = {
  additions: number;
  deletions: number;
  parents: number;
  verified: boolean;
};

/**
 * Whether a commit may earn a fire. Details are null when the GitHub API was unreachable:
 * the fire is then allowed rather than lost, the other checks still apply.
 */
export function fireEligibility(
  details: CommitDetails | null,
  opts: { minLines: number; requireVerified: boolean },
): { ok: true } | { ok: false; reason: "merge_commit" | "too_small" | "unverified" } {
  if (!details) return { ok: true };
  if (details.parents > 1) return { ok: false, reason: "merge_commit" };
  if (details.additions + details.deletions < opts.minLines) return { ok: false, reason: "too_small" };
  if (opts.requireVerified && !details.verified) return { ok: false, reason: "unverified" };
  return { ok: true };
}

export function isNewAccount(createdAt: Date | null, reference: Date, days: number): boolean {
  if (!createdAt) return false;
  return reference.getTime() - createdAt.getTime() < days * 86_400_000;
}
