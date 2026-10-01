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
    "PROOF OF BUILD — ПОДТВЕРЖДЕНИЕ УЧАСТИЯ",
    "",
    `Настоящим подтверждается, что участник GitHub @${p.githubLogin}`,
    `принимал участие в хакатоне «${p.hackathonTitle}» в составе команды «${p.teamName}»`,
    `в период с ${fmt(p.start)} по ${fmt(p.end)}.`,
    "",
    `Дней с коммитами (огоньков): ${p.fires} из ${p.requiredFires} необходимых.`,
    `Кошелёк Solana: ${p.wallet}`,
    `Дата выдачи: ${p.issuedAt.toISOString()}`,
    `Код документа: ${nonce}`,
  ].join("\n");
}

export const letterHash = (body: string): string => sha256Hex(body);

/** siteUrl is the frontend (FRONTEND_URL): the link opens its /verify page, not the raw API. */
export function letterEmail(body: string, hash: string, siteUrl: string): string {
  return [
    body,
    "",
    "---",
    "SHA-256 этого текста (без строк ниже разделителя) записан в блокчейн Solana.",
    `Проверить подлинность: ${siteUrl}/verify/${hash}`,
  ].join("\n");
}
