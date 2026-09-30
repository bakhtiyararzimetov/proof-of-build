// Same-origin by default: Vite (dev) and Vercel (prod, vercel.json) proxy /api to the backend.
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";
export const RPC_URL =
  (import.meta.env.VITE_RPC_URL as string | undefined) ?? "https://api.devnet.solana.com";
export const DEFAULT_MINT =
  (import.meta.env.VITE_DEFAULT_MINT as string | undefined) ??
  // Test USDC on devnet created by `npm run devnet:setup` (6 decimals).
  "HncFPHpTBYv4ipiG78HhLZGmGVkZYPxQdsEi17rbVt44";

const cluster = RPC_URL.includes("devnet") ? "devnet" : RPC_URL.includes("testnet") ? "testnet" : null;
const suffix = cluster ? `?cluster=${cluster}` : "";

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${suffix}`;
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}${suffix}`;
export const MAX_MEMBERS = 5;
export const USDC_DECIMALS = 6;
