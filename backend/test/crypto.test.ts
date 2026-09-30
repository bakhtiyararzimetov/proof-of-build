import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { buildLinkMessage, verifyWalletSignature } from "../src/services/wallet/verify.js";
import { verifyWebhookSignature } from "../src/services/github/signature.js";
import { buildLetter, letterHash, letterEmail } from "../src/services/mail/letter.js";

describe("wallet signature", () => {
  const kp = Keypair.generate();
  const wallet = kp.publicKey.toBase58();
  const message = buildLinkMessage({ wallet, githubLogin: "alice", nonce: "n1", issuedAt: new Date(0) });
  const sig = nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey);

  it("accepts a valid signature in base58 and base64", () => {
    expect(verifyWalletSignature(message, bs58.encode(sig), wallet)).toBe(true);
    expect(verifyWalletSignature(message, Buffer.from(sig).toString("base64"), wallet)).toBe(true);
  });

  it("rejects another wallet, a changed message and garbage", () => {
    expect(verifyWalletSignature(message, bs58.encode(sig), Keypair.generate().publicKey.toBase58())).toBe(false);
    expect(verifyWalletSignature(message.replace("alice", "mallory"), bs58.encode(sig), wallet)).toBe(false);
    expect(verifyWalletSignature(message, "xyz", wallet)).toBe(false);
    expect(verifyWalletSignature(message, bs58.encode(sig), "not-a-key")).toBe(false);
  });
});

describe("webhook signature", () => {
  const body = Buffer.from('{"zen":"hi"}');
  const good = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");

  it("accepts the right HMAC", () => {
    expect(verifyWebhookSignature("secret", body, good)).toBe(true);
  });

  it("rejects a wrong secret, a changed body, a missing header", () => {
    expect(verifyWebhookSignature("other", body, good)).toBe(false);
    expect(verifyWebhookSignature("secret", Buffer.from('{"zen":"ho"}'), good)).toBe(false);
    expect(verifyWebhookSignature("secret", body, undefined)).toBe(false);
    expect(verifyWebhookSignature("secret", body, "sha1=abc")).toBe(false);
  });
});

describe("letter", () => {
  const input = {
    githubLogin: "alice",
    hackathonTitle: "Solana Autumn",
    teamName: "alpha",
    start: new Date("2026-10-01T00:00:00Z"),
    end: new Date("2026-10-04T00:00:00Z"),
    fires: 3,
    requiredFires: 2,
    wallet: "W",
    issuedAt: new Date("2026-10-05T00:00:00Z"),
  };

  it("hash is deterministic for the same text and differs with the nonce", () => {
    const a = buildLetter({ ...input, nonce: "n" });
    expect(letterHash(a)).toBe(letterHash(buildLetter({ ...input, nonce: "n" })));
    expect(letterHash(a)).not.toBe(letterHash(buildLetter({ ...input, nonce: "m" })));
    expect(letterHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the email contains the exact hashed text followed by the verify link", () => {
    const text = buildLetter(input);
    const hash = letterHash(text);
    const email = letterEmail(text, hash, "https://api");
    expect(email.startsWith(text + "\n")).toBe(true);
    expect(email).toContain(`https://api/verify/${hash}`);
  });
});
