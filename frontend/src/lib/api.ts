import { API_URL } from "./config";

// ---------- types (mirror the server responses) ----------

export type Phase = "upcoming" | "running" | "ended";
export type FlagKind =
  | "REPO_CREATED_BEFORE_START"
  | "HUGE_COMMIT"
  | "BULK_PUSH"
  | "COMMIT_DATE_SKEW"
  | "FORCE_PUSH"
  | "AUTHOR_MISMATCH"
  | "NEW_GITHUB_ACCOUNT"
  | "INACTIVE_MEMBER";

export type HackathonListItem = {
  id: string;
  title: string;
  description: string;
  organizer: string;
  startTs: string;
  endTs: string;
  requiredFires: number;
  phase: Phase;
  teams: number;
  participants: number;
  prizePool: string | null;
  depositAmount: string | null;
  status: "active" | "finalized" | null;
};

export type HackathonDetail = {
  id: string;
  title: string;
  description: string;
  phase: Phase;
  days: number;
  organizer: string;
  oracle: string;
  mint: string;
  vault: string;
  startTs: number;
  endTs: number;
  registrationEndTs: number;
  /** set_winners / finalize open (end + fire grace) */
  settlementTs: number;
  /** after this, qualified participants share the prize if no winners were set */
  winnersDeadlineTs: number;
  /** the organizer may sweep unclaimed funds */
  sweepTs: number;
  qualifiedCount: number;
  depositAmount: string;
  requiredFires: number;
  prizePool: string;
  teamCount: number;
  participantCount: number;
  settledCount: number;
  status: "active" | "finalized";
  winnersSet: boolean;
  winners: { team: string; bps: number }[];
  teams: { address: string; name: string; captain: string; members: number; repos: string[] }[];
};

export type Flag = { kind: FlagKind; details: Record<string, unknown>; createdAt: string };

export type ParticipantRow = {
  address: string;
  wallet: string;
  team: string;
  teamName: string | null;
  githubLogin: string | null;
  fires: number;
  requiredFires: number;
  qualified: boolean;
  disqualified: boolean;
  disqualifiedReason: string | null;
  depositPaid: boolean;
  refundClaimed: boolean;
  prizeClaimed: boolean;
  commitCount: number;
  days: { day: number; fire: boolean; commit: string | null; tx: string | null }[];
  flags: Flag[];
};

export type ParticipantsResponse = {
  hackathon: string;
  days: number;
  currentDay: number | null;
  requiredFires: number;
  participants: ParticipantRow[];
  teamFlags: (Flag & { team: string | null; repo: string | null })[];
};

export type Participation = {
  participant: string;
  wallet: string;
  hackathon: { id: string; title: string };
  team: { id: string; name: string; isCaptain: boolean; inviteCode: string };
};

export type Me = {
  id: string;
  githubLogin: string;
  hasEmail: boolean;
  wallet: string | null;
  participations: Participation[];
  organized: { id: string; title: string }[];
};

export type TeamDetail = {
  address: string;
  hackathon: string;
  name: string;
  captain: string;
  confirmed: boolean;
  members: string[];
  qualifiedCount: number;
  participants: { address: string; wallet: string; githubLogin: string }[];
  repos: { id: string; fullName: string }[];
};

export type CommitRow = {
  sha: string;
  repo: string;
  author: string | null;
  authoredAt: string;
  pushedAt: string;
  fireDay: number | null;
  fireTx: string | null;
  flags: FlagKind[];
  status: "verified" | "suspicious" | "unlinked";
};

export type AttestationResult = {
  hash: string;
  letter: string;
  tx: string;
  explorer: string;
  verifyUrl: string;
  emailSent: boolean;
};

export type VerifyResult =
  | {
      valid: boolean;
      hash: string;
      hackathon: { id: string; title: string };
      team: string;
      wallet: string;
      recordedAt: string | null;
      tx: string | null;
      explorer: string | null;
    }
  | { valid: false; hash: string; hackathon?: undefined };

// ---------- token ----------

const TOKEN_KEY = "pob_token";
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private mode: session-only */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, `The server at ${API_URL} is not responding. Start it: cd server && npm run dev`);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  githubLoginUrl: () => `${API_URL}/auth/github`,
  health: () => request<{ ok: boolean; oracle: string }>("GET", "/health"),
  me: () => request<Me>("GET", "/me"),
  walletNonce: (wallet: string) =>
    request<{ nonce: string; message: string }>("POST", "/auth/wallet/nonce", { wallet }),
  linkWallet: (wallet: string, nonce: string, signature: string) =>
    request<Me>("POST", "/auth/wallet", { wallet, nonce, signature }),

  hackathons: () => request<HackathonListItem[]>("GET", "/hackathons"),
  hackathon: (id: string) => request<HackathonDetail>("GET", `/hackathons/${enc(id)}`),
  participants: (id: string) => request<ParticipantsResponse>("GET", `/hackathons/${enc(id)}/participants`),
  registerHackathon: (body: { address: string; title: string; description: string }) =>
    request<{ id: string }>("POST", "/hackathons", body),
  registerTx: (id: string, teamName: string) =>
    request<{ transaction: string; team: string; participant: string; inviteCode: string }>(
      "POST",
      `/hackathons/${enc(id)}/register-tx`,
      { teamName },
    ),
  joinTx: (id: string, inviteCode: string) =>
    request<{ transaction: string; team: string; participant: string }>(
      "POST",
      `/hackathons/${enc(id)}/join-tx`,
      { inviteCode },
    ),

  team: (id: string) => request<TeamDetail>("GET", `/teams/${enc(id)}`),
  teamCommits: (id: string, limit = 50) =>
    request<CommitRow[]>("GET", `/teams/${enc(id)}/commits?limit=${limit}`),
  addRepo: (teamId: string, fullName: string) =>
    request<{ id: string; fullName: string; flagged: boolean }>("POST", `/teams/${enc(teamId)}/repos`, {
      fullName,
    }),

  rotateInvite: (teamId: string) => request<{ inviteCode: string }>("POST", `/teams/${enc(teamId)}/invite`),
  saveDisqualification: (participant: string, reason: string) =>
    request<{ ok: true }>("POST", `/participants/${enc(participant)}/disqualification`, { reason }),

  issueAttestation: (participant: string) =>
    request<AttestationResult>("POST", "/attestations", { participant }),
  verify: (hash: string) => request<VerifyResult>("GET", `/verify/${enc(hash)}`),
  faucet: (hackathon: string) =>
    request<{ amount: string; tx: string; explorer: string }>("POST", "/faucet", { hackathon }),
};
