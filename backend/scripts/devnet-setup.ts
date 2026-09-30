// Creates a demo hackathon on devnet with a test "USDC" mint (6 decimals) that the organizer controls.
//
//   npm run devnet:setup -- --days 3 --fires 2 --deposit 10 --prize 1000   (reads ORACLE_SECRET_KEY from .env)
//   npm run devnet:setup -- --mint <mint> --fund <wallet1,wallet2> --amount 5000 --no-hackathon
//
// --registration-hours: how long teams can register after the start (default 24, capped at the end).
// --fund: comma-separated wallets that receive test tokens (only works for a mint the organizer controls).
// --no-hackathon: only create/fund the mint.
//
// Organizer = ORGANIZER_KEYPAIR (default ~/.config/solana/id.json). Needs ~0.1 devnet SOL.
// Pass --mint <address> to reuse an existing mint (for example devnet USDC) instead of creating one.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { AnchorProvider, BN, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import idl from "../src/idl/proof_of_build.json" with { type: "json" };
import { parseSecretKey } from "../src/services/solana/chain.js";

const { values } = parseArgs({
  options: {
    days: { type: "string", default: "3" },
    fires: { type: "string", default: "2" },
    deposit: { type: "string", default: "10" },
    prize: { type: "string", default: "1000" },
    "start-in-minutes": { type: "string", default: "0" },
    "registration-hours": { type: "string", default: "24" },
    mint: { type: "string" },
    fund: { type: "string" },
    amount: { type: "string", default: "10000" },
    "no-hackathon": { type: "boolean", default: false },
  },
});

try {
  process.loadEnvFile();
} catch {
  /* no .env: use the environment */
}
const rpc = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const organizer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      readFileSync(process.env.ORGANIZER_KEYPAIR ?? `${homedir()}/.config/solana/id.json`, "utf8"),
    ) as number[],
  ),
);
if (!process.env.ORACLE_SECRET_KEY) throw new Error("ORACLE_SECRET_KEY is required");
const oracle = parseSecretKey(process.env.ORACLE_SECRET_KEY).publicKey;

const connection = new Connection(rpc, "confirmed");
const provider = new AnchorProvider(connection, new Wallet(organizer), { commitment: "confirmed" });
const program = new Program(idl as Idl, provider);
const units = (n: string) => new BN(Math.round(Number(n) * 1_000_000));

let mint: PublicKey;
if (values.mint) {
  mint = new PublicKey(values.mint);
} else {
  mint = await createMint(connection, organizer, organizer.publicKey, null, 6);
  console.log("created test mint:", mint.toBase58());
}
const organizerToken = await getOrCreateAssociatedTokenAccount(connection, organizer, mint, organizer.publicKey);
if (!values.mint) {
  await mintTo(connection, organizer, mint, organizerToken.address, organizer, 1_000_000n * 1_000_000n);
}
for (const w of (values.fund ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
  const ata = await getOrCreateAssociatedTokenAccount(connection, organizer, mint, new PublicKey(w));
  await mintTo(connection, organizer, mint, ata.address, organizer, BigInt(units(values.amount!).toString()));
  console.log(`funded ${w} with ${values.amount} test tokens`);
}
if (values["no-hackathon"]) {
  console.log(JSON.stringify({ mint: mint.toBase58() }, null, 2));
  process.exit(0);
}

const hackathonId = new BN(Date.now());
const [hackathon] = PublicKey.findProgramAddressSync(
  [Buffer.from("hackathon"), organizer.publicKey.toBuffer(), hackathonId.toArrayLike(Buffer, "le", 8)],
  program.programId,
);
const [vault] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), hackathon.toBuffer()],
  program.programId,
);
const start = Math.floor(Date.now() / 1000) + Number(values["start-in-minutes"]) * 60;
const end = start + Number(values.days) * 86_400;
const registrationEnd = Math.min(end, start + Number(values["registration-hours"]) * 3_600);

const tx = await program.methods
  .createHackathon(
    hackathonId,
    oracle,
    new BN(start),
    new BN(end),
    new BN(registrationEnd),
    units(values.deposit!),
    Number(values.fires),
    units(values.prize!),
  )
  .accountsPartial({
    organizer: organizer.publicKey,
    hackathon,
    mint,
    vault,
    organizerToken: organizerToken.address,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log(
  JSON.stringify(
    {
      hackathon: hackathon.toBase58(),
      organizer: organizer.publicKey.toBase58(),
      oracle: oracle.toBase58(),
      mint: mint.toBase58(),
      start: new Date(start * 1000).toISOString(),
      registrationEnd: new Date(registrationEnd * 1000).toISOString(),
      end: new Date(end * 1000).toISOString(),
      tx,
      next: "POST /hackathons { address, title } with the organizer's linked wallet",
    },
    null,
    2,
  ),
);
