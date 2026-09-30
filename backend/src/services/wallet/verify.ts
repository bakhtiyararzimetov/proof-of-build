import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";

export const NONCE_TTL_MS = 10 * 60 * 1000;

export function buildLinkMessage(p: {
  wallet: string;
  githubLogin: string;
  nonce: string;
  issuedAt: Date;
}): string {
  return [
    "Proof of Build: link this wallet to a GitHub account.",
    `Wallet: ${p.wallet}`,
    `GitHub: ${p.githubLogin}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt.toISOString()}`,
  ].join("\n");
}

function decodeSignature(signature: string): Uint8Array | null {
  for (const decode of [
    (s: string) => bs58.decode(s),
    (s: string) => new Uint8Array(Buffer.from(s, "base64")),
  ]) {
    try {
      const bytes = decode(signature);
      if (bytes.length === nacl.sign.signatureLength) return bytes;
    } catch {
      // try the next encoding
    }
  }
  return null;
}

/** Signature is what `wallet.signMessage(new TextEncoder().encode(message))` returns, as base58 or base64. */
export function verifyWalletSignature(message: string, signature: string, wallet: string): boolean {
  let publicKey: Uint8Array;
  try {
    publicKey = new PublicKey(wallet).toBytes();
  } catch {
    return false;
  }
  const sig = decodeSignature(signature);
  if (!sig) return false;
  return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, publicKey);
}
