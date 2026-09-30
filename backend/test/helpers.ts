import { Prisma } from "@prisma/client";
import { Keypair, PublicKey } from "@solana/web3.js";
import type { Config } from "../src/config.js";

export const config: Config = {
  NODE_ENV: "test",
  PORT: 0,
  HOST: "127.0.0.1",
  PUBLIC_URL: "http://api.test",
  FRONTEND_URL: "http://app.test",
  DATABASE_URL: "postgresql://unused",
  JWT_SECRET: "x".repeat(32),
  RPC_URL: "https://api.devnet.solana.com",
  ORACLE_SECRET_KEY: "unused",
  GITHUB_APP_ID: "1",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
  GITHUB_APP_PRIVATE_KEY: "unused",
  GITHUB_WEBHOOK_SECRET: "webhook-secret-123456",
  GITHUB_ID_SALT: "salt-salt-salt-salt",
  RESEND_API_KEY: undefined,
  MAIL_FROM: "test@example.com",
  COMMIT_SKEW_HOURS: 6,
  HUGE_COMMIT_LINES: 2000,
  BULK_PUSH_LINES: 5000,
  MIN_FIRE_LINES: 3,
  REQUIRE_VERIFIED_COMMITS: false,
  NEW_ACCOUNT_DAYS: 30,
};

export const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });

export const DAY_MS = 86_400_000;
export const START = new Date("2026-10-01T00:00:00Z");
export const END = new Date(START.getTime() + 3 * DAY_MS);
export const HACKATHON = Keypair.generate().publicKey.toBase58();
export const TEAM = Keypair.generate().publicKey.toBase58();
export const ALICE_P = Keypair.generate().publicKey.toBase58();
export const BOB_P = Keypair.generate().publicKey.toBase58();

type Row = Record<string, any>;

/** Just enough of PrismaClient for processPush and the webhook route. */
export function fakePrisma() {
  const db = {
    commits: [] as Row[],
    flags: [] as Row[],
    fires: [] as Row[],
    deliveries: new Set<string>(),
  };
  let seq = 0;
  const repo = {
    id: 42n,
    fullName: "team/app",
    installationId: 7n,
    teamId: TEAM,
    hackathon: { id: HACKATHON, startTs: START, endTs: END },
    team: {
      id: TEAM,
      participants: [
        { id: ALICE_P, user: { githubLogin: "Alice" } },
        { id: BOB_P, user: { githubLogin: "bob" } },
      ],
    },
  };
  const prisma = {
    repo: {
      findUnique: async ({ where }: any) => (where.id === repo.id ? repo : null),
    },
    commit: {
      count: async ({ where }: any) => db.commits.filter((c) => c.repoId === where.repoId).length,
      upsert: async ({ where, create }: any) => {
        const k = where.repoId_sha;
        const found = db.commits.find((c) => c.repoId === k.repoId && c.sha === k.sha);
        if (found) return found;
        db.commits.push(create);
        return create;
      },
    },
    fraudFlag: {
      upsert: async ({ where, create }: any) => {
        const found = db.flags.find((f) => f.dedupeKey === where.dedupeKey);
        if (found) return found;
        db.flags.push(create);
        return create;
      },
    },
    fire: {
      create: async ({ data }: any) => {
        if (db.fires.some((f) => f.participantId === data.participantId && f.dayIndex === data.dayIndex)) {
          throw uniqueViolation();
        }
        const row = { id: `fire${++seq}`, txSignature: null, ...data };
        db.fires.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.fires.find((f) => f.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: any) => {
        db.fires = db.fires.filter((f) => f.id !== where.id);
      },
    },
    webhookDelivery: {
      create: async ({ data }: any) => {
        if (db.deliveries.has(data.id)) throw uniqueViolation();
        db.deliveries.add(data.id);
        return data;
      },
    },
  };
  return { prisma, db, repo };
}

export function fakeChain() {
  const calls: { hackathon: string; participant: string; team: string; day: number; sha: string; pushedAt: Date }[] = [];
  let failures = 0;
  const chain = {
    oraclePublicKey: new PublicKey("11111111111111111111111111111111"),
    recordFire: async (p: {
      hackathon: PublicKey;
      participant: PublicKey;
      team: PublicKey;
      day: number;
      commitSha: string;
      pushedAt: Date;
    }) => {
      if (failures > 0) {
        failures--;
        throw new Error("rpc down");
      }
      calls.push({
        hackathon: p.hackathon.toBase58(),
        participant: p.participant.toBase58(),
        team: p.team.toBase58(),
        day: p.day,
        sha: p.commitSha,
        pushedAt: p.pushedAt,
      });
      return `sig${calls.length}`;
    },
  };
  return { chain, calls, failNextFires: (n: number) => (failures = n) };
}

export const silentLog = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  fatal() {},
  trace() {},
  child() {
    return silentLog;
  },
  level: "silent",
  silent() {},
} as any;
