import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  AccountLayout,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { startAnchor, ProgramTestContext, Clock } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { expect } from "chai";
import { createHash } from "crypto";
import { ProofOfBuild } from "../target/types/proof_of_build";
import IDL from "../target/idl/proof_of_build.json";

const DAY = 86_400;
const HOUR = 3_600;
const FIRE_GRACE = 3 * HOUR;
const WINNERS_DEADLINE = 7 * DAY;
const CLAIM_WINDOW = 30 * DAY;
const USDC = 1_000_000n;
const DEPOSIT = 10n * USDC;
const PRIZE = 1_000n * USDC;
const REQUIRED_FIRES = 2;

const enc = (s: string) => Buffer.from(s);
const sha256 = (s: string) => [...createHash("sha256").update(s).digest()];
const commit = (s: string) => [...createHash("sha1").update(s).digest()];

describe("proof_of_build", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<ProofOfBuild>;
  const programId = new PublicKey(IDL.address);

  const organizer = Keypair.generate();
  const oracle = Keypair.generate();
  const mallory = Keypair.generate();
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  let organizerAta: PublicKey;

  // The "current" hackathon; helpers read these at call time.
  let hackathon: PublicKey;
  let vault: PublicKey;
  let startTs: number;
  let endTs: number;
  let regEndTs: number;

  type User = { kp: Keypair; ata: PublicKey; gh: number[] };
  const users: Record<string, User> = {};

  // ---------- helpers ----------

  const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, programId)[0];
  const hackathonPda = (id: BN) =>
    pda([enc("hackathon"), organizer.publicKey.toBuffer(), id.toArrayLike(Buffer, "le", 8)]);
  const participantPda = (wallet: PublicKey) => pda([enc("participant"), hackathon.toBuffer(), wallet.toBuffer()]);
  const participantOf = (name: string) => participantPda(users[name].kp.publicKey);
  const teamPda = (name: string) => pda([enc("team"), hackathon.toBuffer(), enc(name)]);
  const githubPda = (gh: number[]) => pda([enc("github"), hackathon.toBuffer(), Buffer.from(gh)]);
  const firePda = (participant: PublicKey, day: number) => {
    const d = Buffer.alloc(2);
    d.writeUInt16LE(day);
    return pda([enc("fire"), participant.toBuffer(), d]);
  };

  async function send(ixs: anchor.web3.TransactionInstruction[], signers: Keypair[]) {
    await provider.sendAndConfirm(new Transaction().add(...ixs), signers);
  }

  function fund(pubkey: PublicKey) {
    context.setAccount(pubkey, {
      lamports: 100 * LAMPORTS_PER_SOL,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });
  }

  async function tokenBalance(address: PublicKey): Promise<bigint> {
    const acc = await context.banksClient.getAccount(address);
    return AccountLayout.decode(acc!.data).amount;
  }

  async function newUser(name: string, usdc = 100n * USDC): Promise<User> {
    const kp = Keypair.generate();
    fund(kp.publicKey);
    const ata = getAssociatedTokenAddressSync(mint, kp.publicKey);
    await send(
      [
        createAssociatedTokenAccountIdempotentInstruction(provider.wallet.publicKey, ata, kp.publicKey, mint),
        createMintToInstruction(mint, ata, provider.wallet.publicKey, usdc),
      ],
      [],
    );
    users[name] = { kp, ata, gh: sha256(`github:${name}`) };
    return users[name];
  }

  async function now(): Promise<number> {
    return Number((await context.banksClient.getClock()).unixTimestamp);
  }

  async function warpTo(ts: number) {
    const c = await context.banksClient.getClock();
    context.setClock(new Clock(c.slot, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, BigInt(ts)));
  }

  async function expectFail(p: Promise<unknown>, errorName?: string) {
    try {
      await p;
    } catch (e: any) {
      if (!errorName) return;
      const text = `${e?.message ?? ""} ${String(e)} ${JSON.stringify(e?.logs ?? [])}`;
      const code = IDL.errors.find((x) => x.name === errorName)?.code;
      const hex = code !== undefined ? `0x${code.toString(16)}` : "__none__";
      if (text.includes(errorName) || text.includes(hex)) return;
      throw new Error(`expected ${errorName}, got: ${text}`);
    }
    throw new Error(`expected failure${errorName ? ` (${errorName})` : ""}, but it succeeded`);
  }

  const joinAccounts = (u: User, team: PublicKey, oracleKp: Keypair, gh: number[]) => ({
    wallet: u.kp.publicKey,
    oracle: oracleKp.publicKey,
    hackathon,
    team,
    participant: participantPda(u.kp.publicKey),
    githubLink: githubPda(gh),
    mint,
    vault,
    walletToken: u.ata,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  });

  const registerTeam = (u: User, name: string, oracleKp: Keypair = oracle) =>
    program.methods
      .registerTeam(name, u.gh)
      .accountsPartial(joinAccounts(u, teamPda(name), oracleKp, u.gh))
      .signers([u.kp, oracleKp])
      .rpc();

  const joinTeam = (u: User, name: string, gh = u.gh) =>
    program.methods
      .joinTeam(gh)
      .accountsPartial(joinAccounts(u, teamPda(name), oracle, gh))
      .signers([u.kp, oracle])
      .rpc();

  const recordFire = (
    name: string,
    day: number,
    pushedAt: number,
    opts: { signer?: Keypair; team?: string; tag?: string } = {},
  ) => {
    const signer = opts.signer ?? oracle;
    const participant = participantOf(name);
    return program.methods
      .recordFire(day, commit(`${name}-${day}-${opts.tag ?? ""}`), new BN(pushedAt))
      .accountsPartial({
        oracle: signer.publicKey,
        hackathon,
        participant,
        team: opts.team ? teamPda(opts.team) : teamOf[name] ? teamPda(teamOf[name]) : PublicKey.default,
        fireRecord: firePda(participant, day),
        systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc();
  };
  const teamOf: Record<string, string> = {};

  const disqualify = (name: string, reason: string, signer = organizer) =>
    program.methods
      .disqualify(sha256(reason))
      .accountsPartial({
        organizer: signer.publicKey,
        hackathon,
        participant: participantOf(name),
        team: teamPda(teamOf[name]),
      })
      .signers([signer])
      .rpc();

  const setWinners = (winners: { team: string; bps: number }[], signer = organizer) =>
    program.methods
      .setWinners(winners.map((w) => ({ team: teamPda(w.team), bps: w.bps })))
      .accountsPartial({ organizer: signer.publicKey, hackathon })
      .remainingAccounts(winners.map((w) => ({ pubkey: teamPda(w.team), isSigner: false, isWritable: false })))
      .signers([signer])
      .rpc();

  const finalize = (names: string[]) =>
    program.methods
      .finalize()
      .accountsPartial({ cranker: mallory.publicKey, hackathon })
      .remainingAccounts(names.map((n) => ({ pubkey: participantOf(n), isSigner: false, isWritable: true })))
      .signers([mallory])
      .rpc();

  const claim = (name: string, team: string, signer: Keypair = users[name].kp) =>
    program.methods
      .claim()
      .accountsPartial({
        wallet: signer.publicKey,
        hackathon,
        team: teamPda(team),
        participant: participantOf(name),
        mint,
        vault,
        walletToken: getAssociatedTokenAddressSync(mint, signer.publicKey),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();

  const claimed = async (name: string, team: string) => {
    const before = await tokenBalance(users[name].ata);
    await claim(name, team);
    return (await tokenBalance(users[name].ata)) - before;
  };

  const sweep = (signer = organizer) =>
    program.methods
      .sweep()
      .accountsPartial({
        organizer: signer.publicKey,
        hackathon,
        mint,
        vault,
        organizerToken: organizerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();

  const createHackathon = (
    id: BN,
    p: { start: number; end: number; regEnd: number; fires?: number; deposit?: bigint },
  ) => {
    const h = hackathonPda(id);
    return program.methods
      .createHackathon(
        id,
        oracle.publicKey,
        new BN(p.start),
        new BN(p.end),
        new BN(p.regEnd),
        new BN((p.deposit ?? DEPOSIT).toString()),
        p.fires ?? REQUIRED_FIRES,
        new BN(PRIZE.toString()),
      )
      .accountsPartial({
        organizer: organizer.publicKey,
        hackathon: h,
        mint,
        vault: pda([enc("vault"), h.toBuffer()]),
        organizerToken: organizerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([organizer])
      .rpc();
  };

  function useHackathon(id: BN, start: number, end: number, regEnd: number) {
    hackathon = hackathonPda(id);
    vault = pda([enc("vault"), hackathon.toBuffer()]);
    startTs = start;
    endTs = end;
    regEndTs = regEnd;
  }

  // ---------- setup ----------

  before(async () => {
    context = await startAnchor(".", [], []);
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    program = new Program<ProofOfBuild>(IDL as ProofOfBuild, provider);

    for (const kp of [organizer, oracle, mallory]) fund(kp.publicKey);

    const rent = await context.banksClient.getRent();
    await send(
      [
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: mint,
          lamports: Number(rent.minimumBalance(BigInt(MINT_SIZE))),
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(mint, 6, provider.wallet.publicKey, null),
      ],
      [mintKp],
    );
    organizerAta = getAssociatedTokenAddressSync(mint, organizer.publicKey);
    await send(
      [
        createAssociatedTokenAccountIdempotentInstruction(provider.wallet.publicKey, organizerAta, organizer.publicKey, mint),
        createMintToInstruction(mint, organizerAta, provider.wallet.publicKey, 10n * PRIZE),
      ],
      [],
    );

    const t0 = await now();
    const start = t0 + 1_000;
    useHackathon(new BN(1), start, start + 3 * DAY, start + DAY);

    for (const n of ["alice", "bob", "dave", "carol", "gina", "hank", "f1", "f2", "f3", "f4", "f5", "f6", "late", "mallory_user"]) {
      await newUser(n);
    }
  });

  // =====================================================================
  // Hackathon 1: the full happy path plus attacks
  // =====================================================================

  describe("create_hackathon", () => {
    it("rejects end_ts <= start_ts", async () => {
      await expectFail(createHackathon(new BN(90), { start: startTs, end: startTs, regEnd: startTs }), "InvalidTimeRange");
    });

    it("rejects a duration longer than 64 days", async () => {
      await expectFail(
        createHackathon(new BN(91), { start: startTs, end: startTs + 65 * DAY, regEnd: startTs }),
        "InvalidTimeRange",
      );
    });

    it("rejects a registration end after the hackathon end", async () => {
      await expectFail(
        createHackathon(new BN(92), { start: startTs, end: endTs, regEnd: endTs + 1 }),
        "InvalidTimeRange",
      );
    });

    it("rejects required_fires greater than the number of days", async () => {
      await expectFail(
        createHackathon(new BN(93), { start: startTs, end: startTs + 2 * DAY, regEnd: startTs, fires: 3 }),
        "InvalidRequiredFires",
      );
    });

    it("creates the hackathon and moves the prize into the vault", async () => {
      await createHackathon(new BN(1), { start: startTs, end: endTs, regEnd: regEndTs });
      const h = await program.account.hackathon.fetch(hackathon);
      expect(h.registrationEndTs.toNumber()).to.eq(regEndTs);
      expect(h.prizePool.toString()).to.eq(PRIZE.toString());
      expect(await tokenBalance(vault)).to.eq(PRIZE);
    });
  });

  describe("register_team / join_team", () => {
    it("ATTACK: rejects registration without the real oracle co-signature", async () => {
      await expectFail(registerTeam(users.alice, "alpha", mallory), "UnauthorizedOracle");
    });

    it("ATTACK: the organizer cannot take part in their own hackathon", async () => {
      const org: User = { kp: organizer, ata: organizerAta, gh: sha256("github:organizer") };
      await expectFail(registerTeam(org, "org-team"), "OrganizerCannotParticipate");
    });

    it("registers teams and takes deposits", async () => {
      const before = await tokenBalance(users.alice.ata);
      await registerTeam(users.alice, "alpha");
      expect(before - (await tokenBalance(users.alice.ata))).to.eq(DEPOSIT);
      await joinTeam(users.bob, "alpha");
      await joinTeam(users.dave, "alpha");
      await registerTeam(users.carol, "beta");
      await registerTeam(users.gina, "gamma");
      await joinTeam(users.hank, "gamma");
      Object.assign(teamOf, { alice: "alpha", bob: "alpha", dave: "alpha", carol: "beta", gina: "gamma", hank: "gamma" });

      const p = await program.account.participant.fetch(participantOf("alice"));
      expect(p.depositPaid).to.eq(true);
    });

    it("ATTACK: rejects reusing the same GitHub account in another wallet", async () => {
      await expectFail(joinTeam(users.late, "alpha", users.bob.gh));
    });

    it("ATTACK: rejects the 6th member of a team", async () => {
      await registerTeam(users.f1, "full");
      for (const n of ["f2", "f3", "f4", "f5"]) await joinTeam(users[n], "full");
      for (const n of ["f1", "f2", "f3", "f4", "f5"]) teamOf[n] = "full";
      await expectFail(joinTeam(users.f6, "full"), "TeamFull");
      const h = await program.account.hackathon.fetch(hackathon);
      expect(h.participantCount).to.eq(11);
    });
  });

  describe("record_fire", () => {
    it("rejects a push before the start", async () => {
      await expectFail(recordFire("alice", 0, startTs - 10), "HackathonNotStarted");
    });

    it("records a fire on day 0 with GitHub's push time", async () => {
      await warpTo(startTs + 100);
      await recordFire("alice", 0, startTs + 50);
      const p = await program.account.participant.fetch(participantOf("alice"));
      expect(p.fires).to.eq(1);
      const fire = await program.account.fireRecord.fetch(firePda(participantOf("alice"), 0));
      expect(fire.pushedAt.toNumber()).to.eq(startTs + 50);
      expect(fire.recordedAt.toNumber()).to.eq(startTs + 100);
    });

    it("ATTACK: rejects the same day twice", async () => {
      await expectFail(recordFire("alice", 0, startTs + 60, { tag: "again" }));
    });

    it("ATTACK: rejects a day_index that does not match the push day", async () => {
      await expectFail(recordFire("alice", 1, startTs + 60), "WrongDayIndex");
    });

    it("ATTACK: rejects a push time in the future", async () => {
      await expectFail(recordFire("bob", 0, startTs + 500), "InvalidPushTime");
    });

    it("ATTACK: rejects a signer who is not the oracle", async () => {
      await expectFail(recordFire("bob", 0, startTs + 60, { signer: mallory }), "UnauthorizedOracle");
    });

    it("ATTACK: rejects a team account that is not the participant's team", async () => {
      await expectFail(recordFire("bob", 0, startTs + 60, { team: "beta" }), "NotTeamMember");
    });

    it("ATTACK: registration closes at registration_end_ts", async () => {
      await warpTo(regEndTs);
      await expectFail(joinTeam(users.late, "alpha"), "RegistrationClosed");
    });

    it("a late webhook (within the grace period) still lands on the push day", async () => {
      await warpTo(startTs + DAY + HOUR);
      await recordFire("bob", 0, startTs + DAY - 600); // pushed on day 0, delivered on day 1
      const bob = await program.account.participant.fetch(participantOf("bob"));
      expect(bob.daysBitmap.toNumber()).to.eq(1);
    });

    it("ATTACK: rejects a push older than the grace period", async () => {
      await warpTo(startTs + DAY + FIRE_GRACE + 200);
      await expectFail(recordFire("carol", 1, startTs + DAY + 100), "FireTooLate");
    });

    it("counts qualified members when they reach the goal", async () => {
      const t = startTs + DAY + FIRE_GRACE + 300;
      await warpTo(t);
      await recordFire("alice", 1, t - 10);
      await recordFire("bob", 1, t - 10);
      await recordFire("carol", 1, t - 10);
      await recordFire("gina", 1, t - 10);
      await recordFire("hank", 1, t - 10);
      await warpTo(startTs + 2 * DAY + HOUR);
      await recordFire("gina", 2, startTs + 2 * DAY + 100);
      await recordFire("hank", 2, startTs + 2 * DAY + 100);

      expect((await program.account.team.fetch(teamPda("alpha"))).qualifiedCount).to.eq(2);
      expect((await program.account.team.fetch(teamPda("gamma"))).qualifiedCount).to.eq(2);
      expect((await program.account.hackathon.fetch(hackathon)).qualifiedCount).to.eq(4);
    });
  });

  describe("disqualify", () => {
    it("ATTACK: only the organizer can disqualify", async () => {
      await expectFail(disqualify("hank", "copied code", mallory), "UnauthorizedOrganizer");
    });

    it("removes a qualified member from the counts and records the reason hash", async () => {
      await disqualify("hank", "copied code from another repo");
      const p = await program.account.participant.fetch(participantOf("hank"));
      expect(p.disqualified).to.eq(true);
      expect(p.disqualifyReason).to.deep.eq(sha256("copied code from another repo"));
      expect((await program.account.team.fetch(teamPda("gamma"))).qualifiedCount).to.eq(1);
      expect((await program.account.hackathon.fetch(hackathon)).qualifiedCount).to.eq(3);
    });

    it("rejects disqualifying twice", async () => {
      await expectFail(disqualify("hank", "again"), "AlreadyDisqualified");
    });

    it("a disqualified participant gets no more fires", async () => {
      await disqualify("dave", "commits made by a teammate");
      await expectFail(recordFire("dave", 2, startTs + 2 * DAY + 200), "Disqualified");
    });
  });

  describe("after end_ts", () => {
    it("the last push of the hackathon still counts during the grace period", async () => {
      await warpTo(endTs + 60);
      await recordFire("carol", 2, endTs - 30);
      expect((await program.account.participant.fetch(participantOf("carol"))).fires).to.eq(2);
    });

    it("ATTACK: rejects a push after end_ts", async () => {
      await expectFail(recordFire("alice", 3, endTs + 5), "HackathonEnded");
    });

    it("settlement waits for the grace period", async () => {
      await expectFail(setWinners([{ team: "alpha", bps: 10_000 }]), "HackathonNotEnded");
      await expectFail(finalize([]), "HackathonNotEnded");
    });
  });

  describe("set_winners", () => {
    before(async () => {
      await warpTo(endTs + FIRE_GRACE + 10);
    });

    it("ATTACK: rejects a signer who is not the organizer", async () => {
      await expectFail(setWinners([{ team: "alpha", bps: 10_000 }], mallory), "UnauthorizedOrganizer");
    });

    it("ATTACK: the whole pool must be distributed (sum of bps == 10000)", async () => {
      await expectFail(
        setWinners([
          { team: "alpha", bps: 6000 },
          { team: "gamma", bps: 3000 },
        ]),
        "InvalidWinners",
      );
    });

    it("rejects duplicate teams", async () => {
      await expectFail(
        setWinners([
          { team: "alpha", bps: 5000 },
          { team: "alpha", bps: 5000 },
        ]),
        "InvalidWinners",
      );
    });

    it("ATTACK: a team with nobody qualified cannot win", async () => {
      await expectFail(setWinners([{ team: "full", bps: 10_000 }]), "TeamNotQualified");
    });

    it("sets the winners", async () => {
      await setWinners([
        { team: "alpha", bps: 6000 },
        { team: "gamma", bps: 4000 },
      ]);
      expect((await program.account.hackathon.fetch(hackathon)).winnersSet).to.eq(true);
    });

    it("rejects a second call", async () => {
      await expectFail(setWinners([{ team: "beta", bps: 10_000 }]), "WinnersAlreadySet");
    });

    it("ATTACK: no disqualification after winners are known", async () => {
      await expectFail(disqualify("alice", "late grudge"), "WinnersAlreadySet");
    });
  });

  describe("finalize", () => {
    it("claim before finalize fails", async () => {
      await expectFail(claim("alice", "alpha"), "NotFinalized");
    });

    it("moves deposits of unqualified and disqualified participants into the pool", async () => {
      await finalize(["alice", "bob", "dave", "carol"]);
      await finalize(["alice", "gina", "hank", "f1", "f2", "f3", "f4", "f5"]);
      const h = await program.account.hackathon.fetch(hackathon);
      expect(h.status).to.deep.eq({ finalized: {} });
      expect(h.settledCount).to.eq(11);
      // dave + hank (disqualified) + f1..f5 (0 fires)
      expect(h.prizePool.toString()).to.eq((PRIZE + 7n * DEPOSIT).toString());
    });

    it("rejects a repeated finalize", async () => {
      await expectFail(finalize([]), "AlreadyFinalized");
    });
  });

  describe("claim", () => {
    const pool = PRIZE + 7n * DEPOSIT;

    it("qualified winners split their team's share only among qualified members", async () => {
      expect(await claimed("alice", "alpha")).to.eq(DEPOSIT + (pool * 6000n) / 10000n / 2n);
      // bob never claims: see the sweep tests
      // hank is disqualified, so gina takes the whole gamma share
      expect(await claimed("gina", "gamma")).to.eq(DEPOSIT + (pool * 4000n) / 10000n / 1n);
    });

    it("a qualified non-winner gets the deposit back", async () => {
      expect(await claimed("carol", "beta")).to.eq(DEPOSIT);
    });

    it("unqualified and disqualified members get nothing, even in a winning team", async () => {
      await expectFail(claim("dave", "alpha"), "NothingToClaim");
      await expectFail(claim("hank", "gamma"), "NothingToClaim");
      await expectFail(claim("f1", "full"), "NothingToClaim");
    });

    it("ATTACK: rejects a second claim", async () => {
      await expectFail(claim("alice", "alpha"), "NothingToClaim");
    });

    it("ATTACK: rejects claiming someone else's participant", async () => {
      await expectFail(claim("bob", "alpha", users.mallory_user.kp));
    });

    it("ATTACK: rejects a claim with another team", async () => {
      await expectFail(claim("carol", "alpha"), "NotTeamMember");
    });
  });

  describe("sweep", () => {
    it("is closed during the claim window", async () => {
      await expectFail(sweep(), "ClaimWindowOpen");
    });

    it("ATTACK: only the organizer can sweep", async () => {
      await warpTo(endTs + FIRE_GRACE + CLAIM_WINDOW);
      await expectFail(sweep(mallory), "UnauthorizedOrganizer");
    });

    it("returns what nobody claimed (bob's payout) to the organizer", async () => {
      const pool = PRIZE + 7n * DEPOSIT;
      const unclaimed = DEPOSIT + (pool * 6000n) / 10000n / 2n;
      expect(await tokenBalance(vault)).to.eq(unclaimed);
      const before = await tokenBalance(organizerAta);
      await sweep();
      expect((await tokenBalance(organizerAta)) - before).to.eq(unclaimed);
      expect(await tokenBalance(vault)).to.eq(0n);
    });

    it("a claim after the window fails: the vault is empty", async () => {
      await expectFail(claim("bob", "alpha"));
    });

    it("nothing left to sweep twice", async () => {
      await expectFail(sweep(), "NothingToClaim");
    });
  });

  // =====================================================================
  // Hackathon 2: the organizer disappears and never picks winners
  // =====================================================================

  describe("fallback when the organizer never picks winners", () => {
    const id = new BN(2);

    before(async () => {
      const t = await now();
      useHackathon(id, t + 100, t + 100 + DAY, t + 100 + DAY);
      await createHackathon(id, { start: startTs, end: endTs, regEnd: regEndTs, fires: 1 });
      await registerTeam(users.alice, "solo-a");
      await registerTeam(users.bob, "solo-b");
      await registerTeam(users.carol, "solo-c");
      Object.assign(teamOf, { alice: "solo-a", bob: "solo-b", carol: "solo-c" });
      await warpTo(startTs + 60);
      await recordFire("alice", 0, startTs + 30);
      await recordFire("bob", 0, startTs + 30);
      await warpTo(endTs + FIRE_GRACE);
      await finalize(["alice", "bob", "carol"]);
    });

    it("a deposit is refundable right after finalize, without winners", async () => {
      expect(await claimed("alice", "solo-a")).to.eq(DEPOSIT);
    });

    it("the prize is not available before the winners deadline", async () => {
      await expectFail(claim("alice", "solo-a"), "NothingToClaim");
    });

    it("ATTACK: set_winners is closed after the deadline", async () => {
      await warpTo(endTs + FIRE_GRACE + WINNERS_DEADLINE);
      await expectFail(setWinners([{ team: "solo-a", bps: 10_000 }]), "WinnersDeadlinePassed");
    });

    it("after the deadline every qualified participant gets an equal share", async () => {
      const pool = PRIZE + DEPOSIT; // carol forfeited
      expect(await claimed("alice", "solo-a")).to.eq(pool / 2n);
      expect(await claimed("bob", "solo-b")).to.eq(DEPOSIT + pool / 2n);
      await expectFail(claim("carol", "solo-c"), "NothingToClaim");
    });
  });
});
