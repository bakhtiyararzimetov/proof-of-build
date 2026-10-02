import anchor from "@coral-xyz/anchor";
import type { BN as AnchorBN, Idl, Program as AnchorProgram } from "@coral-xyz/anchor";

// Anchor ships CommonJS only, and Node 22's ESM loader can't see its named exports
// ("Named export 'BN' not found"), so the values come from the default export.
const { AnchorProvider, BN, Program } = anchor;
type BN = AnchorBN;
type Program<T extends Idl> = AnchorProgram<T>;
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import bs58 from "bs58";
import idl from "../../idl/proof_of_build.json" with { type: "json" };
import { commitHashBytes } from "../ids.js";

export type HackathonAccount = {
  organizer: PublicKey;
  oracle: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  hackathonId: BN;
  startTs: BN;
  endTs: BN;
  registrationEndTs: BN;
  depositAmount: BN;
  requiredFires: number;
  prizePool: BN;
  teamCount: number;
  participantCount: number;
  settledCount: number;
  qualifiedCount: number;
  status: { active?: object; finalized?: object };
  winnersSet: boolean;
  winnerCount: number;
  winners: { team: PublicKey; bps: number }[];
};

export type TeamAccount = {
  hackathon: PublicKey;
  name: string;
  captain: PublicKey;
  members: PublicKey[];
  qualifiedCount: number;
};

export type ParticipantAccount = {
  hackathon: PublicKey;
  team: PublicKey;
  wallet: PublicKey;
  githubIdHash: number[];
  fires: number;
  daysBitmap: BN;
  depositPaid: boolean;
  disqualified: boolean;
  disqualifyReason: number[];
  settled: boolean;
  refundClaimed: boolean;
  prizeClaimed: boolean;
};

export type AttestationAccount = {
  participant: PublicKey;
  letterHash: number[];
  createdAt: BN;
};

/** Everything the HTTP layer needs from the chain. Mocked in tests. */
export interface Chain {
  readonly oraclePublicKey: PublicKey;
  teamAddress(hackathon: PublicKey, name: string): PublicKey;
  participantAddress(hackathon: PublicKey, wallet: PublicKey): PublicKey;
  attestationAddress(participant: PublicKey, letterHash: Buffer): PublicKey;
  fetchHackathon(address: PublicKey): Promise<HackathonAccount | null>;
  fetchTeam(address: PublicKey): Promise<TeamAccount | null>;
  fetchParticipant(address: PublicKey): Promise<ParticipantAccount | null>;
  fetchAttestation(address: PublicKey): Promise<AttestationAccount | null>;
  listParticipants(hackathon: PublicKey): Promise<{ address: PublicKey; account: ParticipantAccount }[]>;
  recordFire(p: {
    hackathon: PublicKey;
    participant: PublicKey;
    team: PublicKey;
    day: number;
    commitSha: string;
    pushedAt: Date;
  }): Promise<string>;
  recordAttestation(hackathon: PublicKey, participant: PublicKey, letterHash: Buffer): Promise<string>;
  buildRegisterTeamTx(p: {
    hackathon: PublicKey;
    wallet: PublicKey;
    teamName: string;
    githubIdHash: Buffer;
  }): Promise<string>;
  buildJoinTeamTx(p: {
    hackathon: PublicKey;
    team: PublicKey;
    wallet: PublicKey;
    githubIdHash: Buffer;
  }): Promise<string>;
  /** Test-token faucet: only works for a mint whose mint authority is the oracle. */
  canMint(mint: PublicKey): Promise<boolean>;
  tokenBalance(mint: PublicKey, wallet: PublicKey): Promise<bigint>;
  mintTestTokens(mint: PublicKey, wallet: PublicKey, amount: bigint): Promise<string>;
}

export function parseSecretKey(value: string): Keypair {
  const trimmed = value.trim();
  const bytes = trimmed.startsWith("[")
    ? Uint8Array.from(JSON.parse(trimmed) as number[])
    : bs58.decode(trimmed);
  return Keypair.fromSecretKey(bytes);
}

const enc = (s: string) => Buffer.from(s, "utf8");

export class SolanaChain implements Chain {
  readonly program: Program<Idl>;
  readonly oraclePublicKey: PublicKey;

  constructor(
    readonly connection: Connection,
    private readonly oracle: Keypair,
  ) {
    this.oraclePublicKey = oracle.publicKey;
    const wallet = {
      publicKey: oracle.publicKey,
      payer: oracle,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        if (tx instanceof VersionedTransaction) tx.sign([oracle]);
        else tx.partialSign(oracle);
        return tx;
      },
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
        for (const tx of txs) {
          if (tx instanceof VersionedTransaction) tx.sign([oracle]);
          else tx.partialSign(oracle);
        }
        return txs;
      },
    };
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    this.program = new Program(idl as Idl, provider);
  }

  private get accounts() {
    // Account namespaces are typed by the generated IDL types; this server uses the JSON IDL only.
    return this.program.account as unknown as Record<
      "hackathon" | "team" | "participant" | "attestation",
      {
        fetchNullable(a: PublicKey): Promise<unknown>;
        all(filters?: unknown[]): Promise<{ publicKey: PublicKey; account: unknown }[]>;
      }
    >;
  }

  private pda(seeds: (Buffer | Uint8Array)[]): PublicKey {
    return PublicKey.findProgramAddressSync(seeds, this.program.programId)[0];
  }

  vaultAddress(hackathon: PublicKey) {
    return this.pda([enc("vault"), hackathon.toBuffer()]);
  }
  teamAddress(hackathon: PublicKey, name: string) {
    return this.pda([enc("team"), hackathon.toBuffer(), enc(name)]);
  }
  participantAddress(hackathon: PublicKey, wallet: PublicKey) {
    return this.pda([enc("participant"), hackathon.toBuffer(), wallet.toBuffer()]);
  }
  githubLinkAddress(hackathon: PublicKey, githubIdHash: Buffer) {
    return this.pda([enc("github"), hackathon.toBuffer(), githubIdHash]);
  }
  fireAddress(participant: PublicKey, day: number) {
    const d = Buffer.alloc(2);
    d.writeUInt16LE(day);
    return this.pda([enc("fire"), participant.toBuffer(), d]);
  }
  attestationAddress(participant: PublicKey, letterHash: Buffer) {
    return this.pda([enc("att"), participant.toBuffer(), letterHash]);
  }

  async fetchHackathon(address: PublicKey) {
    return (await this.accounts.hackathon.fetchNullable(address)) as HackathonAccount | null;
  }
  async fetchTeam(address: PublicKey) {
    return (await this.accounts.team.fetchNullable(address)) as TeamAccount | null;
  }
  async fetchParticipant(address: PublicKey) {
    return (await this.accounts.participant.fetchNullable(address)) as ParticipantAccount | null;
  }
  async fetchAttestation(address: PublicKey) {
    return (await this.accounts.attestation.fetchNullable(address)) as AttestationAccount | null;
  }

  async listParticipants(hackathon: PublicKey) {
    // Participant.hackathon is the first field, right after the 8-byte discriminator.
    const rows = await this.accounts.participant.all([
      { memcmp: { offset: 8, bytes: hackathon.toBase58() } },
    ]);
    return rows.map((r) => ({ address: r.publicKey, account: r.account as ParticipantAccount }));
  }

  async recordFire(p: {
    hackathon: PublicKey;
    participant: PublicKey;
    team: PublicKey;
    day: number;
    commitSha: string;
    pushedAt: Date;
  }) {
    return this.program.methods
      .recordFire(p.day, commitHashBytes(p.commitSha), new BN(Math.floor(p.pushedAt.getTime() / 1000)))
      .accountsPartial({
        oracle: this.oracle.publicKey,
        hackathon: p.hackathon,
        participant: p.participant,
        team: p.team,
        fireRecord: this.fireAddress(p.participant, p.day),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async recordAttestation(hackathon: PublicKey, participant: PublicKey, letterHash: Buffer) {
    return this.program.methods
      .recordAttestation([...letterHash])
      .accountsPartial({
        oracle: this.oracle.publicKey,
        hackathon,
        participant,
        attestation: this.attestationAddress(participant, letterHash),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  private async commonJoinAccounts(hackathon: PublicKey, wallet: PublicKey, githubIdHash: Buffer) {
    const h = await this.fetchHackathon(hackathon);
    if (!h) throw new Error("Hackathon not found on-chain");
    return {
      wallet,
      oracle: this.oracle.publicKey,
      hackathon,
      participant: this.participantAddress(hackathon, wallet),
      githubLink: this.githubLinkAddress(hackathon, githubIdHash),
      mint: h.mint,
      vault: this.vaultAddress(hackathon),
      // null = the optional account is omitted (deposit_amount == 0)
      walletToken: (h.depositAmount.isZero()
        ? null
        : getAssociatedTokenAddressSync(h.mint, wallet)) as PublicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };
  }

  /** The wallet pays fees; the oracle signs to vouch for github_id_hash. Returns base64. */
  private async partiallySigned(feePayer: PublicKey, ix: Transaction["instructions"][number]) {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer, blockhash, lastValidBlockHeight }).add(ix);
    tx.partialSign(this.oracle);
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  }

  async buildRegisterTeamTx(p: {
    hackathon: PublicKey;
    wallet: PublicKey;
    teamName: string;
    githubIdHash: Buffer;
  }) {
    const accounts = await this.commonJoinAccounts(p.hackathon, p.wallet, p.githubIdHash);
    const ix = await this.program.methods
      .registerTeam(p.teamName, [...p.githubIdHash])
      .accountsPartial({ ...accounts, team: this.teamAddress(p.hackathon, p.teamName) })
      .instruction();
    return this.partiallySigned(p.wallet, ix);
  }

  async buildJoinTeamTx(p: {
    hackathon: PublicKey;
    team: PublicKey;
    wallet: PublicKey;
    githubIdHash: Buffer;
  }) {
    const accounts = await this.commonJoinAccounts(p.hackathon, p.wallet, p.githubIdHash);
    const ix = await this.program.methods
      .joinTeam([...p.githubIdHash])
      .accountsPartial({ ...accounts, team: p.team })
      .instruction();
    return this.partiallySigned(p.wallet, ix);
  }

  async canMint(mint: PublicKey) {
    const info = await getMint(this.connection, mint).catch(() => null);
    return !!info?.mintAuthority?.equals(this.oracle.publicKey);
  }

  async tokenBalance(mint: PublicKey, wallet: PublicKey) {
    return this.connection
      .getTokenAccountBalance(getAssociatedTokenAddressSync(mint, wallet))
      .then((r) => BigInt(r.value.amount))
      .catch(() => 0n);
  }

  async mintTestTokens(mint: PublicKey, wallet: PublicKey, amount: bigint) {
    const ata = getAssociatedTokenAddressSync(mint, wallet);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(this.oracle.publicKey, ata, wallet, mint),
      createMintToInstruction(mint, ata, this.oracle.publicKey, amount),
    );
    return sendAndConfirmTransaction(this.connection, tx, [this.oracle], { commitment: "confirmed" });
  }
}
