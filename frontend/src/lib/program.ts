import { useMemo } from "react";
import { AnchorProvider, BN, Program, type Wallet } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Buffer } from "buffer";
import idl from "../idl/proof_of_build.json";
import type { ProofOfBuild } from "../idl/proof_of_build";

export type PobProgram = Program<ProofOfBuild>;
export const PROGRAM_ID = new PublicKey(idl.address);
const FINALIZE_BATCH = 20;

const enc = (s: string) => new TextEncoder().encode(s);
const pda = (seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];

export const pdas = {
  hackathon: (organizer: PublicKey, id: BN) =>
    pda([enc("hackathon"), organizer.toBytes(), id.toArrayLike(Buffer, "le", 8)]),
  vault: (hackathon: PublicKey) => pda([enc("vault"), hackathon.toBytes()]),
  participant: (hackathon: PublicKey, wallet: PublicKey) =>
    pda([enc("participant"), hackathon.toBytes(), wallet.toBytes()]),
};

/** Read-only wallet so account fetches work before a wallet is connected. */
const readOnlyWallet: Wallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: () => Promise.reject(new Error("Connect a wallet first")),
  signAllTransactions: () => Promise.reject(new Error("Connect a wallet first")),
} as unknown as Wallet;

export function useProgram(): PobProgram {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  return useMemo(() => {
    const provider = new AnchorProvider(connection, (wallet as Wallet | undefined) ?? readOnlyWallet, {
      commitment: "confirmed",
    });
    return new Program<ProofOfBuild>(idl as ProofOfBuild, provider);
  }, [connection, wallet]);
}

// ---------- organizer ----------

export async function createHackathon(
  program: PobProgram,
  p: {
    organizer: PublicKey;
    oracle: PublicKey;
    mint: PublicKey;
    startTs: number;
    endTs: number;
    registrationEndTs: number;
    depositAmount: bigint;
    requiredFires: number;
    prizeAmount: bigint;
  },
) {
  const id = new BN(Date.now());
  const hackathon = pdas.hackathon(p.organizer, id);
  const tx = await program.methods
    .createHackathon(
      id,
      p.oracle,
      new BN(p.startTs),
      new BN(p.endTs),
      new BN(p.registrationEndTs),
      new BN(p.depositAmount.toString()),
      p.requiredFires,
      new BN(p.prizeAmount.toString()),
    )
    .accountsPartial({
      organizer: p.organizer,
      hackathon,
      mint: p.mint,
      vault: pdas.vault(hackathon),
      organizerToken: getAssociatedTokenAddressSync(p.mint, p.organizer),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  return { hackathon, tx };
}

export async function setWinners(
  program: PobProgram,
  p: { organizer: PublicKey; hackathon: PublicKey; winners: { team: PublicKey; bps: number }[] },
) {
  return program.methods
    .setWinners(p.winners)
    .accountsPartial({ organizer: p.organizer, hackathon: p.hackathon })
    .remainingAccounts(p.winners.map((w) => ({ pubkey: w.team, isSigner: false, isWritable: false })))
    .rpc();
}

export async function sha256Bytes(text: string): Promise<number[]> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))];
}

/** Organizer excludes a cheater; only SHA-256(reason) goes on-chain. */
export async function disqualify(
  program: PobProgram,
  p: { organizer: PublicKey; hackathon: PublicKey; participant: PublicKey; team: PublicKey; reason: string },
) {
  return program.methods
    .disqualify(await sha256Bytes(p.reason))
    .accountsPartial({ organizer: p.organizer, hackathon: p.hackathon, participant: p.participant, team: p.team })
    .rpc();
}

export async function sweep(program: PobProgram, p: { organizer: PublicKey; hackathon: PublicKey; mint: PublicKey }) {
  return program.methods
    .sweep()
    .accountsPartial({
      organizer: p.organizer,
      hackathon: p.hackathon,
      mint: p.mint,
      vault: pdas.vault(p.hackathon),
      organizerToken: getAssociatedTokenAddressSync(p.mint, p.organizer),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/** What a participant can claim right now; mirrors the program's `claim`. */
export function claimable(
  h: {
    status: string;
    winnersSet: boolean;
    winners: { team: string; bps: number }[];
    prizePool: string;
    depositAmount: string;
    qualifiedCount: number;
    winnersDeadlineTs: number;
  },
  p: { qualified: boolean; depositPaid: boolean; refundClaimed: boolean; prizeClaimed: boolean; team: string },
  teamQualifiedCount: number,
  nowSec = Date.now() / 1000,
) {
  if (h.status !== "finalized" || !p.qualified) return { refund: 0n, prize: 0n, prizePending: false };
  const refund = p.depositPaid && !p.refundClaimed ? BigInt(h.depositAmount) : 0n;
  let prize = 0n;
  let prizePending = false;
  if (!p.prizeClaimed) {
    if (h.winnersSet) {
      const w = h.winners.find((x) => x.team === p.team);
      if (w && teamQualifiedCount > 0) prize = (BigInt(h.prizePool) * BigInt(w.bps)) / 10_000n / BigInt(teamQualifiedCount);
    } else if (nowSec >= h.winnersDeadlineTs && h.qualifiedCount > 0) {
      prize = BigInt(h.prizePool) / BigInt(h.qualifiedCount);
    } else {
      prizePending = true;
    }
  }
  return { refund, prize, prizePending };
}

/** Settles every unsettled participant in batches; the last batch flips the status to Finalized. */
export async function finalizeAll(
  program: PobProgram,
  p: { cranker: PublicKey; hackathon: PublicKey },
  onProgress?: (done: number, total: number) => void,
) {
  const all = await program.account.participant.all([
    { memcmp: { offset: 8, bytes: p.hackathon.toBase58() } },
  ]);
  const pending = all.filter((a) => !a.account.settled).map((a) => a.publicKey);
  const signatures: string[] = [];
  const batches = Math.max(1, Math.ceil(pending.length / FINALIZE_BATCH));
  for (let i = 0; i < batches; i++) {
    const batch = pending.slice(i * FINALIZE_BATCH, (i + 1) * FINALIZE_BATCH);
    signatures.push(
      await program.methods
        .finalize()
        .accountsPartial({ cranker: p.cranker, hackathon: p.hackathon })
        .remainingAccounts(batch.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })))
        .rpc(),
    );
    onProgress?.(Math.min((i + 1) * FINALIZE_BATCH, pending.length), pending.length);
  }
  return signatures;
}

// ---------- participant ----------

export async function claim(
  program: PobProgram,
  p: { wallet: PublicKey; hackathon: PublicKey; team: PublicKey; mint: PublicKey },
) {
  const walletToken = getAssociatedTokenAddressSync(p.mint, p.wallet);
  return program.methods
    .claim()
    .accountsPartial({
      wallet: p.wallet,
      hackathon: p.hackathon,
      team: p.team,
      participant: pdas.participant(p.hackathon, p.wallet),
      mint: p.mint,
      vault: pdas.vault(p.hackathon),
      walletToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([
      createAssociatedTokenAccountIdempotentInstruction(p.wallet, walletToken, p.wallet, p.mint),
    ])
    .rpc();
}

/** Signs a transaction the server already partially signed (oracle) and sends it unchanged. */
export async function signAndSendServerTx(
  connection: Connection,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  base64: string,
) {
  const tx = Transaction.from(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
  const signed = await signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  const latest = await connection.getLatestBlockhash("confirmed");
  const res = await connection.confirmTransaction(
    {
      signature,
      blockhash: tx.recentBlockhash ?? latest.blockhash,
      lastValidBlockHeight: tx.lastValidBlockHeight ?? latest.lastValidBlockHeight,
    },
    "confirmed",
  );
  if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
  return signature;
}
