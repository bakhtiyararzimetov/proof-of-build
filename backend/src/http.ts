import { PublicKey } from "@solana/web3.js";
import type { ZodType, ZodTypeDef } from "zod";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HttpError(400, r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  return r.data;
}

export function toPubkey(value: string, what = "address"): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new HttpError(400, `Invalid ${what}`);
  }
}

export function explorerTx(rpcUrl: string, signature: string): string {
  const cluster = rpcUrl.includes("devnet") ? "?cluster=devnet" : rpcUrl.includes("testnet") ? "?cluster=testnet" : "";
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}
