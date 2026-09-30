import { USDC_DECIMALS } from "./config";

/** Base units (string/bigint) → "$5,000" / "$12.5" */
export function usdc(base: string | bigint | null | undefined, opts: { symbol?: boolean } = {}) {
  if (base === null || base === undefined) return "—";
  const n = Number(BigInt(base)) / 10 ** USDC_DECIMALS;
  const s = n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });
  return opts.symbol === false ? s : `$${s}`;
}

export const toBaseUnits = (amount: string | number) =>
  BigInt(Math.round(Number(amount) * 10 ** USDC_DECIMALS));

export const shortAddr = (a: string | null | undefined, n = 4) =>
  a ? `${a.slice(0, n)}…${a.slice(-n)}` : "—";

export const shortSha = (sha: string) => sha.slice(0, 7);

export function fmtDate(d: string | number | Date, withTime = false) {
  const date = typeof d === "number" ? new Date(d * 1000) : new Date(d);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : { year: "numeric" }),
  });
}

export function durationDays(startSec: number, endSec: number) {
  return Math.ceil((endSec - startSec) / 86_400);
}

export function relative(d: string | Date) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function errMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const anyE = e as { error?: { errorMessage?: string }; message?: string; logs?: string[] };
    if (anyE.error?.errorMessage) return anyE.error.errorMessage;
    const log = anyE.logs?.find((l) => l.includes("Error Message:"));
    if (log) return log.split("Error Message:")[1].trim();
    if (anyE.message) {
      if (anyE.message.includes("User rejected")) return "Request rejected in the wallet";
      return anyE.message;
    }
  }
  return String(e);
}
