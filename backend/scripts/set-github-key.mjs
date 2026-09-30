// Usage: npm run set-github-key -- ~/Downloads/your-app.2026-09-29.private-key.pem
import { readFileSync, writeFileSync } from "node:fs";

const pemPath = process.argv[2];
if (!pemPath) {
  console.error("Usage: npm run set-github-key -- path/to/private-key.pem");
  process.exit(1);
}
const pem = readFileSync(pemPath, "utf8").trim();
if (!pem.includes("PRIVATE KEY")) throw new Error("This does not look like a PEM private key");
const oneLine = pem.replace(/\r?\n/g, "\\n");
const env = readFileSync(".env", "utf8");
const next = /^GITHUB_APP_PRIVATE_KEY=.*$/m.test(env)
  ? env.replace(/^GITHUB_APP_PRIVATE_KEY=.*$/m, () => `GITHUB_APP_PRIVATE_KEY="${oneLine}"`)
  : `${env.trimEnd()}\nGITHUB_APP_PRIVATE_KEY="${oneLine}"\n`;
writeFileSync(".env", next, { mode: 0o600 });
console.log("GITHUB_APP_PRIVATE_KEY written to .env");
