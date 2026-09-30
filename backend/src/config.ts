import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  PUBLIC_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  RPC_URL: z.string().url().default("https://api.devnet.solana.com"),
  ORACLE_SECRET_KEY: z.string().min(1),
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z
    .string()
    .min(1)
    .transform((v) => v.replace(/\\n/g, "\n")),
  GITHUB_WEBHOOK_SECRET: z.string().min(16),
  GITHUB_ID_SALT: z.string().min(16),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("Proof of Build <onboarding@resend.dev>"),
  COMMIT_SKEW_HOURS: z.coerce.number().positive().default(6),
  HUGE_COMMIT_LINES: z.coerce.number().int().positive().default(2000),
  /** A push adding more than this many lines in total is flagged (old code poured in in chunks). */
  BULK_PUSH_LINES: z.coerce.number().int().positive().default(5000),
  /** A commit must change at least this many lines to earn a fire (no empty/whitespace commits). */
  MIN_FIRE_LINES: z.coerce.number().int().nonnegative().default(3),
  /** Only GitHub-verified (signed) commits earn fires. */
  REQUIRE_VERIFIED_COMMITS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** GitHub accounts younger than this are flagged (throwaway accounts). */
  NEW_ACCOUNT_DAYS: z.coerce.number().int().nonnegative().default(30),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${problems.join("\n")}`);
  }
  return parsed.data;
}
