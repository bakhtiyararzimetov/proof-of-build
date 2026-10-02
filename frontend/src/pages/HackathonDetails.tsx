import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ArrowLeft, CalendarDays, Coins, Flame, Shield, Trophy, Users, UserPlus, Wallet } from "lucide-react";
import { api, type HackathonDetail, type ParticipantsResponse } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAsync } from "../lib/useAsync";
import { errMessage, fmtDate, shortAddr, usdc } from "../lib/format";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { signAndSendServerTx, useProgram } from "../lib/program";
import { MAX_MEMBERS, explorerAddress } from "../lib/config";
import { Avatar, Button, Card, ErrorBox, LinkButton, SectionTitle, Spinner, Stat, phaseBadge } from "../components/ui";
import { CoverArt } from "../components/Art";
import { AccountSetup, useReady } from "../components/AccountSetup";
import { useToast } from "../components/Toast";

function Rules({ h, short }: { h: HackathonDetail; short?: boolean }) {
  const deposit = BigInt(h.depositAmount) > 0n;
  const rules = [
    `Minimum ${h.requiredFires} verified working day${h.requiredFires === 1 ? "" : "s"} (one fire per day with a commit).`,
    "GitHub repository connected through the Proof of Build GitHub App.",
    `Team size: 1–${MAX_MEMBERS} members. Registration closes ${fmtDate(h.registrationEndTs, true)}.`,
    "A fire goes to the person who pushed, for their own commit (merge and near-empty commits do not count).",
    "The prize share of a winning team is split only between members who reached the goal.",
    "If the organizer does not pick winners within 7 days after the end, everyone who reached the goal shares the prize equally.",
    "Project must be built during the hackathon: old repositories, huge first commits, backdated commits and force-pushes are flagged.",
    deposit
      ? `Deposit ${usdc(h.depositAmount)} USDC per member: returned with enough fires, otherwise added to the prize pool.`
      : "No deposit required.",
  ];
  const shown = short ? [rules[0], rules[1], rules[2], rules[6]] : rules;
  return (
    <ol className="flex flex-col gap-2">
      {shown.map((r, i) => (
        <li key={r} className="flex gap-2 text-sm text-muted">
          <span className="w-4 shrink-0 text-ink">{i + 1}.</span>
          <span>{r}</span>
        </li>
      ))}
    </ol>
  );
}

/** Explains the deposit and hands out free devnet test USDC to pay it. */
function DepositCard({ h }: { h: HackathonDetail }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-3 text-xs text-muted">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <Wallet className="size-4 shrink-0" />
        {usdc(h.depositAmount)} USDC deposit
      </p>
      <p>
        Why: it is locked in the contract and returned when you reach {h.requiredFires} fire
        {h.requiredFires === 1 ? "" : "s"}; otherwise it goes to the prize pool. It keeps people from joining and doing
        nothing.
      </p>
      <p>This hackathon runs on devnet with test USDC: it is free and has no real value.</p>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        loading={busy}
        icon={<Coins className="size-4" />}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api.faucet({ hackathon: h.id });
            toast.ok(`Received ${usdc(r.amount)} test USDC`, { tx: r.tx });
          } catch (e) {
            toast.error("Could not get test USDC", errMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Get test USDC
      </Button>
    </div>
  );
}

function JoinPanel({ h, onJoined }: { h: HackathonDetail; onJoined: () => Promise<void> }) {
  const { me, refresh } = useAuth();
  const ready = useReady();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [teamName, setTeamName] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);

  const program = useProgram();
  const mine = me?.participations.find((p) => p.hackathon.id === h.id);
  // The server stores the participant when it builds the transaction; only the chain says it was sent.
  const confirmed = useAsync(
    async () => (mine ? !!(await program.account.participant.fetchNullable(new PublicKey(mine.participant))) : false),
    [mine?.participant, program],
  );

  const registrationClosed = Date.now() / 1000 >= h.registrationEndTs;
  if (registrationClosed && !(mine && confirmed.data)) {
    return <p className="text-sm text-muted">Registration closed {fmtDate(h.registrationEndTs, true)}.</p>;
  }
  if (me?.wallet && me.wallet === h.organizer) {
    return <p className="text-sm text-muted">You are the organizer: organizers cannot take part in their own hackathon.</p>;
  }
  if (!me || !ready) return <AccountSetup returnTo={`/hackathons/${h.id}`} />;
  if (mine && confirmed.loading) return <Spinner label="Checking registration…" />;
  if (mine && confirmed.data) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          You are in team <span className="font-semibold text-ink">{mine.team.name}</span>.
        </p>
        <LinkButton to={`/dashboard?p=${mine.participant}`} size="lg" icon={<Flame className="size-4" />}>
          Open Team Dashboard
        </LinkButton>
      </div>
    );
  }

  const submit = async () => {
    if (!signTransaction) return toast.error("This wallet cannot sign transactions");
    setBusy(true);
    try {
      // Without funds the wallet only says "could not simulate", so explain it before signing.
      if (publicKey) {
        const sol = await connection.getBalance(publicKey);
        if (sol < 0.01 * LAMPORTS_PER_SOL) {
          throw new Error("Not enough devnet SOL for fees. Switch the wallet to Devnet and get free SOL at faucet.solana.com.");
        }
        if (BigInt(h.depositAmount) > 0n) {
          const ata = getAssociatedTokenAddressSync(new PublicKey(h.mint), publicKey);
          const bal = await connection
            .getTokenAccountBalance(ata)
            .then((r) => BigInt(r.value.amount))
            .catch(() => 0n);
          if (bal < BigInt(h.depositAmount)) {
            throw new Error(`The deposit needs ${usdc(h.depositAmount)} test USDC, the wallet has ${usdc(bal)}. Press "Get test USDC" above.`);
          }
        }
      }
      const res = mode === "create" ? await api.registerTx(h.id, teamName.trim()) : await api.joinTx(h.id, invite.trim());
      const sig = await signAndSendServerTx(connection, signTransaction, res.transaction);
      toast.ok(mode === "create" ? "Team registered" : "You joined the team", { tx: sig });
      await refresh();
      await onJoined();
      navigate(`/dashboard?p=${res.participant}`);
    } catch (e) {
      toast.error("Registration failed", errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const deposit = BigInt(h.depositAmount) > 0n;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-zinc-100 p-1">
        {(["create", "join"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full py-2 text-sm font-medium transition ${mode === m ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {m === "create" ? "Create a team" : "Join with invite"}
          </button>
        ))}
      </div>
      {mode === "create" ? (
        <div>
          <label className="label" htmlFor="team-name">
            Team name
          </label>
          <input
            id="team-name"
            className="input"
            maxLength={32}
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team Alpha"
          />
          <p className="mt-1.5 text-xs text-muted">Unique within the hackathon. You become the captain.</p>
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="invite">
            Invite code
          </label>
          <input
            id="invite"
            className="input font-mono"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="from your captain"
          />
        </div>
      )}
      {deposit && <DepositCard h={h} />}
      <Button
        size="lg"
        loading={busy}
        disabled={mode === "create" ? !teamName.trim() : !invite.trim()}
        onClick={submit}
        icon={<UserPlus className="size-4" />}
      >
        Join Hackathon
      </Button>
    </div>
  );
}

const tabs = ["About", "Rules", "Teams", "Leaderboard"] as const;
type Tab = (typeof tabs)[number];

function tagsOf(description: string) {
  return (description.split("\n")[0] ?? "")
    .split(/[•·,|]/)
    .map((t) => t.trim())
    .filter((t) => t && t.length <= 20)
    .slice(0, 3);
}

function Leaderboard({ data }: { data: ParticipantsResponse | null }) {
  if (!data) return <Spinner />;
  const teams = new Map<string, { name: string; fires: number; qualified: number; members: number }>();
  for (const p of data.participants) {
    const t = teams.get(p.team) ?? { name: p.teamName ?? shortAddr(p.team), fires: 0, qualified: 0, members: 0 };
    t.fires += p.fires;
    t.members += 1;
    if (p.qualified) t.qualified += 1;
    teams.set(p.team, t);
  }
  const rows = [...teams.values()].sort((a, b) => b.fires - a.fires || b.qualified - a.qualified);
  if (rows.length === 0) return <p className="text-sm text-muted">No teams yet.</p>;
  return (
    <ol className="divide-y divide-line">
      {rows.map((t, i) => (
        <li key={t.name} className="flex items-center gap-4 py-3 text-sm">
          <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${i < 3 ? "bg-ink text-white" : "bg-zinc-100 text-muted"}`}>
            {i + 1}
          </span>
          <span className="flex-1 font-medium">{t.name}</span>
          <span className="text-xs text-muted">
            {t.qualified}/{t.members} reached the goal
          </span>
          <span className="inline-flex w-14 items-center justify-end gap-1 font-semibold">
            {t.fires} <Flame className="size-3.5 fill-ink" />
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function HackathonDetails() {
  const { id = "" } = useParams();
  const { me } = useAuth();
  const { data: h, error, loading, reload } = useAsync(() => api.hackathon(id), [id]);
  const people = useAsync(() => api.participants(id), [id]);
  const [tab, setTab] = useState<Tab>("About");

  if (loading) return <Spinner />;
  if (error || !h)
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <ErrorBox message={error ?? "Not found"} onRetry={reload} />
      </div>
    );

  const isOrganizer = !!me?.wallet && me.wallet === h.organizer;
  const tags = tagsOf(h.description);
  const logins = (people.data?.participants ?? []).map((p) => p.githubLogin).filter(Boolean) as string[];
  const timeline = [
    { label: "Start", at: h.startTs },
    { label: "Registration closes", at: h.registrationEndTs },
    { label: "End", at: h.endTs },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link to="/hackathons" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Back to Hackathons
      </Link>

      <div className="studio relative mt-4 overflow-hidden rounded-3xl border border-line">
        <CoverArt seed={h.id} dark={false} className="absolute top-0 right-0 h-full w-2/3 opacity-90 [mask-image:linear-gradient(to_left,black_40%,transparent)]" />
        <div className="relative flex min-h-48 flex-col justify-end p-6 sm:p-8">
          <div className="absolute top-5 right-5">{phaseBadge(h.phase, h.status === "finalized")}</div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{h.title}</h1>
          {tags.length > 0 && <p className="mt-2 text-sm text-muted">{tags.join("  ·  ")}</p>}
        </div>
      </div>

      <Card className="mt-4 grid grid-cols-1 gap-5 p-5 sm:grid-cols-3">
        <Stat icon={<Trophy className="size-5" />} value={`${usdc(h.prizePool)} USDC`} label="Prize Pool" />
        <Stat
          icon={<CalendarDays className="size-5" />}
          value={`${fmtShort(h.startTs)} – ${fmtShort(h.endTs)}`}
          label={`${h.days} days`}
        />
        <Stat icon={<Users className="size-5" />} value={h.participantCount} label="Participants" />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex gap-6 border-b border-line">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 pb-3 text-sm transition ${tab === t ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <Card className="p-6">
            {tab === "About" && (
              <>
                <SectionTitle>About</SectionTitle>
                <p className="text-sm leading-relaxed whitespace-pre-line text-muted">
                  {h.description || "The organizer has not added a description yet."}
                </p>
                <div className="mt-6">
                  <SectionTitle>Rules</SectionTitle>
                  <Rules h={h} short />
                </div>
              </>
            )}
            {tab === "Rules" && (
              <>
                <SectionTitle>Rules</SectionTitle>
                <Rules h={h} />
              </>
            )}
            {tab === "Teams" &&
              (h.teams.length === 0 ? (
                <p className="text-sm text-muted">No teams yet. Be the first.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {h.teams.map((t) => (
                    <li key={t.address} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-muted">
                        {t.members}/{MAX_MEMBERS} members · {t.repos[0] ?? "no repo yet"}
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
            {tab === "Leaderboard" && <Leaderboard data={people.data} />}
          </Card>

          <Card className="p-6">
            <SectionTitle>Join</SectionTitle>
            <JoinPanel h={h} onJoined={reload} />
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <p className="text-sm font-semibold">Organizer</p>
            <a href={explorerAddress(h.organizer)} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl brand-grad text-white">
                <Shield className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm">{shortAddr(h.organizer, 6)}</span>
                <span className="block text-xs text-muted">prize locked on-chain ↗</span>
              </span>
            </a>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold">Participants</p>
            {logins.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No participants yet.</p>
            ) : (
              <div className="mt-3 flex items-center">
                {logins.slice(0, 5).map((l) => (
                  <Avatar key={l} login={l} className="-mr-2 size-9 border-2 border-white" />
                ))}
                {logins.length > 5 && (
                  <span className="ml-4 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-muted">+{logins.length - 5}</span>
                )}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold">Timeline</p>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm">
              {timeline.map((t) => (
                <li key={t.label} className="flex items-center gap-3">
                  <CalendarDays className="size-4 text-muted" />
                  <span className="flex-1 text-muted">{t.label}</span>
                  <span>{fmtDate(t.at, true)}</span>
                </li>
              ))}
            </ul>
          </Card>

          {isOrganizer && (
            <LinkButton to={`/hackathons/${h.id}/admin`} variant="outline" icon={<Shield className="size-4" />}>
              Admin panel
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  );
}

const fmtShort = (sec: number) => new Date(sec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
