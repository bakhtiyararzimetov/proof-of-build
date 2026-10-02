import { randomBytes } from "node:crypto";
import { sha256Hex } from "../ids.js";

export type LetterInput = {
  githubLogin: string;
  hackathonTitle: string;
  teamName: string;
  start: Date;
  end: Date;
  fires: number;
  requiredFires: number;
  wallet: string;
  issuedAt: Date;
  /** Random value so the hash cannot be guessed from public data */
  nonce?: string;
};

const fmt = (d: Date) => d.toISOString().slice(0, 10);

/** The exact text whose SHA-256 goes on-chain. The verify link is added outside it. */
export function buildLetter(p: LetterInput): string {
  const nonce = p.nonce ?? randomBytes(16).toString("hex");
  return [
    "PROOF OF BUILD — CERTIFICATE OF PARTICIPATION",
    "",
    `This certifies that GitHub user @${p.githubLogin}`,
    `took part in the hackathon "${p.hackathonTitle}" as a member of team "${p.teamName}"`,
    `from ${fmt(p.start)} to ${fmt(p.end)}.`,
    "",
    `Days with commits (fires): ${p.fires} of ${p.requiredFires} required.`,
    `Solana wallet: ${p.wallet}`,
    `Issued at: ${p.issuedAt.toISOString()}`,
    `Document code: ${nonce}`,
  ].join("\n");
}

export const letterHash = (body: string): string => sha256Hex(body);

/** siteUrl is the frontend (FRONTEND_URL): the link opens its /verify page, not the raw API. */
export function letterEmail(body: string, hash: string, siteUrl: string): string {
  return [
    body,
    "",
    "---",
    "The SHA-256 of the text above the separator is recorded on Solana.",
    `Verify it: ${siteUrl}/verify/${hash}`,
  ].join("\n");
}
