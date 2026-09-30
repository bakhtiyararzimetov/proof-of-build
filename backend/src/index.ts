import { PrismaClient } from "@prisma/client";
import { Connection } from "@solana/web3.js";
import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { SolanaChain, parseSecretKey } from "./services/solana/chain.js";
import { GithubApi } from "./services/github/client.js";
import { ResendMailer } from "./services/mail/mailer.js";
import { redeliverMissedPushes } from "./services/github/redelivery.js";

// Read backend/.env when present (Node >= 20.12); real environment variables take precedence.
try {
  process.loadEnvFile();
} catch {
  /* no .env file: rely on the environment */
}
const config = loadConfig();
const prisma = new PrismaClient();
const chain = new SolanaChain(
  new Connection(config.RPC_URL, "confirmed"),
  parseSecretKey(config.ORACLE_SECRET_KEY),
);
const github = new GithubApi(
  config.GITHUB_APP_ID,
  config.GITHUB_APP_PRIVATE_KEY,
  config.GITHUB_CLIENT_ID,
  config.GITHUB_CLIENT_SECRET,
);
const mailer = new ResendMailer(config.RESEND_API_KEY, config.MAIL_FROM);

const app = await buildApp(
  { config, prisma, chain, github, mailer },
  { logger: { level: config.NODE_ENV === "production" ? "info" : "debug" } },
);

// Pushes that happened while the server was down are resent by GitHub on request;
// the program accepts them for FIRE_GRACE after the push.
const redelivery = async () => {
  try {
    const n = await redeliverMissedPushes({ github, prisma }, app.log);
    if (n) app.log.info(`requested ${n} webhook redeliveries`);
  } catch (err) {
    app.log.warn({ err }, "webhook redelivery check failed");
  }
};
const redeliveryTimer = setInterval(redelivery, 15 * 60_000);

const shutdown = async () => {
  clearInterval(redeliveryTimer);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
void redelivery();
app.log.info(`oracle: ${chain.oraclePublicKey.toBase58()}`);
if (!config.RESEND_API_KEY) app.log.warn("RESEND_API_KEY is not set: letters are hashed and recorded, but not emailed");
