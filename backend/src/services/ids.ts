import { createHash, createHmac } from "node:crypto";

export const SECONDS_PER_DAY = 86_400;

/** Salted so that small, enumerable GitHub ids cannot be recovered from the on-chain hash. */
export function githubIdHash(salt: string, githubId: bigint | number): Buffer {
  return createHmac("sha256", salt).update(String(githubId)).digest();
}

export function dayIndex(now: Date, start: Date): number {
  return Math.floor((now.getTime() - start.getTime()) / 1000 / SECONDS_PER_DAY);
}

export function numberOfDays(start: Date, end: Date): number {
  return Math.ceil((end.getTime() - start.getTime()) / 1000 / SECONDS_PER_DAY);
}

/** The program stores 20 bytes. SHA-1 repos fit exactly; SHA-256 repos are truncated. */
export function commitHashBytes(sha: string): number[] {
  if (!/^[0-9a-f]{40,64}$/i.test(sha)) throw new Error(`Invalid commit sha: ${sha}`);
  return [...Buffer.from(sha.slice(0, 40), "hex")];
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
