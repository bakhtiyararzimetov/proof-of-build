import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { config, fakeChain, fakePrisma } from "./helpers.js";

const sign = (body: string) =>
  "sha256=" + createHmac("sha256", config.GITHUB_WEBHOOK_SECRET).update(body).digest("hex");

describe("HTTP", () => {
  let app: FastifyInstance;
  let env: ReturnType<typeof fakePrisma>;

  beforeEach(async () => {
    env = fakePrisma();
    const prisma: any = {
      ...env.prisma,
      attestation: { findUnique: async () => null },
      user: { findUnique: async () => null },
    };
    app = await buildApp({
      config,
      prisma,
      chain: fakeChain().chain as any,
      github: { getCommit: async () => ({ additions: 10, deletions: 0, parents: 1, verified: true }) } as any,
      mailer: { send: async () => null },
    });
  });
  afterEach(() => app.close());

  const webhook = (body: string, headers: Record<string, string>) =>
    app.inject({
      method: "POST",
      url: "/webhooks/github",
      payload: body,
      headers: { "content-type": "application/json", ...headers },
    });

  it("ATTACK: rejects a webhook with a bad or missing signature", async () => {
    const body = JSON.stringify({ zen: "x" });
    expect((await webhook(body, { "x-github-event": "ping", "x-github-delivery": "d1" })).statusCode).toBe(401);
    expect(
      (await webhook(body, { "x-github-event": "ping", "x-github-delivery": "d1", "x-hub-signature-256": sign("{}") }))
        .statusCode,
    ).toBe(401);
  });

  it("answers ping and ignores a redelivery", async () => {
    const body = JSON.stringify({ zen: "x" });
    const headers = { "x-github-event": "ping", "x-github-delivery": "d2", "x-hub-signature-256": sign(body) };
    const first = await webhook(body, headers);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ pong: true });
    const again = await webhook(body, headers);
    expect(again.json()).toEqual({ duplicate: true });
  });

  it("accepts a signed push with 202", async () => {
    const body = JSON.stringify({
      ref: "refs/heads/main", before: "0", after: "1", forced: false, created: false, deleted: false,
      repository: { id: 1, full_name: "x/y" }, commits: [],
    });
    const res = await webhook(body, { "x-github-event": "push", "x-github-delivery": "d3", "x-hub-signature-256": sign(body) });
    expect(res.statusCode).toBe(202);
  });

  it("protected routes require a JWT", async () => {
    expect((await app.inject({ method: "GET", url: "/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/attestations", payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/faucet", payload: {} })).statusCode).toBe(401);
  });

  it("verify validates the hash format and reports unknown hashes", async () => {
    expect((await app.inject({ method: "GET", url: "/verify/zzz" })).statusCode).toBe(400);
    const res = await app.inject({ method: "GET", url: `/verify/${"a".repeat(64)}` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ valid: false, hash: "a".repeat(64) });
  });

  it("wallet nonce requires a known user", async () => {
    const token = app.jwt.sign({ sub: "ghost" });
    const res = await app.inject({
      method: "POST",
      url: "/auth/wallet/nonce",
      headers: { authorization: `Bearer ${token}` },
      payload: { wallet: "11111111111111111111111111111111" },
    });
    expect(res.statusCode).toBe(401);
  });
});
