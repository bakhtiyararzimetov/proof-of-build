// Points the GitHub App webhook at a new URL (e.g. a fresh tunnel) and makes sure the secret matches .env.
// Usage: node scripts/set-webhook-url.mjs https://<host>/api/webhooks/github
import { createSign } from "node:crypto";

const url = process.argv[2];
if (!url?.startsWith("https://")) {
  console.error("Usage: node scripts/set-webhook-url.mjs https://<host>/api/webhooks/github");
  process.exit(1);
}
process.loadEnvFile();
const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET } = process.env;
if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required in .env");

const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iat: now - 60, exp: now + 540, iss: GITHUB_APP_ID })}`;
const signature = createSign("RSA-SHA256").update(unsigned).sign(GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"), "base64url");

const res = await fetch("https://api.github.com/app/hook/config", {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${unsigned}.${signature}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ url, content_type: "json", secret: GITHUB_WEBHOOK_SECRET, insecure_ssl: "0" }),
});
if (!res.ok) {
  console.error(`GitHub answered ${res.status}: ${await res.text()}`);
  process.exit(1);
}
console.log(`GitHub App webhook -> ${(await res.json()).url}`);
