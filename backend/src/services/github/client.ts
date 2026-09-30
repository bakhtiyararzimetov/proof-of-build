import { createSign } from "node:crypto";
import type { CommitDetails } from "../fraud/rules.js";

export type GithubUser = { id: number; login: string; email: string | null; createdAt: Date | null };
export type HookDelivery = {
  id: number;
  guid: string;
  deliveredAt: Date;
  statusCode: number;
  event: string;
};
export type GithubRepo = { id: number; fullName: string; createdAt: Date; installationId: number };

/** Everything the server needs from GitHub. Mocked in tests. */
export interface GithubService {
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<string>;
  getUser(userToken: string): Promise<GithubUser>;
  /** Fails when the GitHub App is not installed on the repository. */
  getRepo(fullName: string): Promise<GithubRepo>;
  getCommit(installationId: number, fullName: string, sha: string): Promise<CommitDetails>;
  /** Recent webhook deliveries of the App (newest first). */
  listDeliveries(): Promise<HookDelivery[]>;
  redeliver(deliveryId: number): Promise<void>;
}

const API = "https://api.github.com";

export class GithubApi implements GithubService {
  private tokens = new Map<number, { token: string; expiresAt: number }>();

  constructor(
    private readonly appId: string,
    private readonly privateKey: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  authorizeUrl(state: string, redirectUri: string): string {
    const u = new URL("https://github.com/login/oauth/authorize");
    u.searchParams.set("client_id", this.clientId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("scope", "read:user user:email");
    return u.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<string> {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const body = (await res.json()) as { access_token?: string; error_description?: string };
    if (!body.access_token) throw new Error(`GitHub OAuth: ${body.error_description ?? res.status}`);
    return body.access_token;
  }

  async getUser(userToken: string): Promise<GithubUser> {
    const user = await this.request<{ id: number; login: string; email: string | null; created_at?: string }>(
      "/user",
      userToken,
    );
    let email = user.email;
    if (!email) {
      const emails = await this.request<{ email: string; primary: boolean; verified: boolean }[]>(
        "/user/emails",
        userToken,
      ).catch(() => []);
      email = emails.find((e) => e.primary && e.verified)?.email ?? null;
    }
    return {
      id: user.id,
      login: user.login,
      email,
      createdAt: user.created_at ? new Date(user.created_at) : null,
    };
  }

  async getRepo(fullName: string): Promise<GithubRepo> {
    const installation = await this.request<{ id: number }>(
      `/repos/${fullName}/installation`,
      this.appJwt(),
    );
    const token = await this.installationToken(installation.id);
    const repo = await this.request<{ id: number; full_name: string; created_at: string }>(
      `/repos/${fullName}`,
      token,
    );
    return {
      id: repo.id,
      fullName: repo.full_name,
      createdAt: new Date(repo.created_at),
      installationId: installation.id,
    };
  }

  async getCommit(installationId: number, fullName: string, sha: string): Promise<CommitDetails> {
    const token = await this.installationToken(installationId);
    const commit = await this.request<{
      stats?: { additions: number; deletions: number };
      parents?: unknown[];
      commit?: { verification?: { verified?: boolean } };
    }>(`/repos/${fullName}/commits/${sha}`, token);
    return {
      additions: commit.stats?.additions ?? 0,
      deletions: commit.stats?.deletions ?? 0,
      parents: commit.parents?.length ?? 1,
      verified: commit.commit?.verification?.verified ?? false,
    };
  }

  async listDeliveries(): Promise<HookDelivery[]> {
    const rows = await this.request<
      { id: number; guid: string; delivered_at: string; status_code: number; event: string }[]
    >("/app/hook/deliveries?per_page=100", this.appJwt());
    return rows.map((r) => ({
      id: r.id,
      guid: r.guid,
      deliveredAt: new Date(r.delivered_at),
      statusCode: r.status_code,
      event: r.event,
    }));
  }

  async redeliver(deliveryId: number): Promise<void> {
    await this.request(`/app/hook/deliveries/${deliveryId}/attempts`, this.appJwt(), { method: "POST" });
  }

  private async request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "proof-of-build",
        ...init.headers,
      },
    });
    if (!res.ok) {
      const err = new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status}`) as Error & {
        status: number;
      };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  }

  /** RS256 JWT for authenticating as the GitHub App (valid 9 minutes). */
  private appJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iat: now - 60, exp: now + 540, iss: this.appId })}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(this.privateKey, "base64url");
    return `${unsigned}.${signature}`;
  }

  private async installationToken(installationId: number): Promise<string> {
    const cached = this.tokens.get(installationId);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const res = await this.request<{ token: string; expires_at: string }>(
      `/app/installations/${installationId}/access_tokens`,
      this.appJwt(),
      { method: "POST" },
    );
    this.tokens.set(installationId, { token: res.token, expiresAt: Date.parse(res.expires_at) });
    return res.token;
  }
}
