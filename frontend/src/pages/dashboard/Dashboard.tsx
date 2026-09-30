import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  Award,
  FileBadge2,
  GitCommitHorizontal,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  Trophy,
  Users,
  AlertTriangle,
} from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useAsync } from "../../lib/useAsync";
import { errMessage, fmtDate, usdc } from "../../lib/format";
import { claim, claimable, useProgram } from "../../lib/program";
import { AccountSetup } from "../../components/AccountSetup";
import { SideLayout, type SideItem } from "../../components/SideLayout";
import { Badge, Button, Card, Empty, ErrorBox, LinkButton, SectionTitle, Spinner, phaseBadge } from "../../components/ui";
import { FireRow, ProgressBar } from "../../components/FireRow";
import { useToast } from "../../components/Toast";
import { CertificatesSection, CommitsTable, MembersList, RepoCard, TeamSection, flagLabel } from "./sections";

const items: SideItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "commits", label: "Commits", icon: GitCommitHorizontal },
  { key: "team", label: "Team", icon: Users },
  { key: "certificates", label: "Certificates", icon: FileBadge2 },
  { key: "settings", label: "Settings", icon: Settings },
];

function TeamDashboard({ participant }: { participant: string }) {
  const { me, logout } = useAuth();
  const { publicKey } = useWallet();
  const program = useProgram();
  const toast = useToast();
  const [tab, setTab] = useState("dashboard");
  const [claiming, setClaiming] = useState(false);

  const p = me!.participations.find((x) => x.participant === participant)!;
  const { data, error, loading, reload } = useAsync(async () => {
    const [hackathon, participants, team, commits] = await Promise.all([
      api.hackathon(p.hackathon.id),
      api.participants(p.hackathon.id),
      api.team(p.team.id),
      api.teamCommits(p.team.id),
    ]);
    return { hackathon, participants, team, commits };
  }, [participant]);

  if (loading) return <Spinner />;
  if (error || !data) return <div className="mx-auto max-w-5xl px-4 py-10"><ErrorBox message={error ?? "Failed"} onRetry={reload} /></div>;

  const { hackathon: h, participants, team, commits } = data;
  const mine = participants.participants.find((r) => r.address === participant);
  const teamRows = participants.participants.filter((r) => r.team === p.team.id);
  const isCaptain = !!me?.wallet && team.captain === me.wallet;

  if (!mine) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Empty
          icon={<AlertTriangle className="size-5" />}
          title="Registration not confirmed"
          body="The registration transaction was not found on-chain. It may have been rejected in the wallet. Try again from the hackathon page."
          action={<LinkButton to={`/hackathons/${h.id}`}>Back to {h.title}</LinkButton>}
        />
      </div>
    );
  }

  const { refund, prize: share, prizePending } = claimable(h, mine, team.qualifiedCount);
  const canClaim = refund + share > 0n;
  const everClaimed = mine.refundClaimed || mine.prizeClaimed;
  const myFlags = [...mine.flags.map((f) => f.kind), ...participants.teamFlags.filter((f) => f.team === p.team.id).map((f) => f.kind)];

  const doClaim = async () => {
    if (!publicKey) return toast.error("Connect your wallet");
    setClaiming(true);
    try {
      const tx = await claim(program, {
        wallet: publicKey,
        hackathon: new PublicKey(h.id),
        team: new PublicKey(p.team.id),
        mint: new PublicKey(h.mint),
      });
      toast.ok(`Claimed ${usdc(share + refund)} USDC`, { tx });
      await reload();
    } catch (e) {
      toast.error("Claim failed", errMessage(e));
    } finally {
      setClaiming(false);
    }
  };

  const overview = (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tracking-tight">Team {team.name}</p>
            <Link to={`/hackathons/${h.id}`} className="text-sm text-muted hover:text-ink">{h.title}</Link>
          </div>
          {h.phase === "running" ? <Badge tone="active">Active</Badge> : phaseBadge(h.phase, h.status === "finalized")}
        </div>

        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="text-muted">Overall Progress</span>
          <span className="font-semibold">
            {mine.fires} / {participants.days} days
            <span className={`ml-2 text-xs font-normal ${mine.qualified ? "text-ok" : "text-muted"}`}>
              {mine.qualified ? "✓ goal reached" : `need ${participants.requiredFires}`}
            </span>
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar value={mine.fires} max={participants.days} />
        </div>
        <div className="mt-5">
          <FireRow days={mine.days} currentDay={participants.currentDay} />
        </div>
        {mine.disqualified && (
          <div className="mt-4 rounded-xl border border-danger/25 bg-danger/5 p-3 text-sm">
            <p className="font-semibold text-danger">Disqualified by the organizer</p>
            <p className="mt-1 text-muted">
              {mine.disqualifiedReason ?? "The reason hash is recorded on-chain."} The deposit goes to the prize pool.
            </p>
          </div>
        )}
        {myFlags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {[...new Set(myFlags)].map((k) => (
              <Badge key={k} tone="review">{flagLabel[k] ?? k}</Badge>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <Card className="min-w-0 p-5">
          <RepoCard team={team} isCaptain={isCaptain} onAdded={reload} bare />
          <div className="mt-5">
            <SectionTitle action={<button onClick={() => setTab("commits")} className="text-xs text-muted hover:text-ink">All commits</button>}>
              Recent Commits
            </SectionTitle>
            <CommitsTable commits={commits.slice(0, 5)} compact />
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle>Team Members</SectionTitle>
          <MembersList rows={teamRows} captain={team.captain} />
        </Card>
      </div>

      {h.status === "finalized" && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-ink text-white">
              <Trophy className="size-5" />
            </div>
            <div className="text-sm">
              <p className="font-semibold">
                {!mine.qualified ? "Goal not reached" : canClaim ? "Payout available" : everClaimed ? "Payout claimed" : "Results are final"}
              </p>
              <p className="text-muted">
                {mine.qualified
                  ? `Available now: deposit ${usdc(refund)} · prize ${usdc(share)}`
                  : "No refund or prize: the deposit went to the prize pool."}
              </p>
            </div>
          </div>
          {prizePending && mine.qualified && (
            <span className="max-w-xs text-xs text-muted">
              Prize: waiting for winners. If none are chosen by {fmtDate(h.winnersDeadlineTs, true)}, qualified participants share
              the pool.
            </span>
          )}
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button size="lg" onClick={doClaim} loading={claiming} disabled={!canClaim} icon={<Award className="size-4" />}>
          {canClaim ? `Claim ${usdc(share + refund)}` : h.status !== "finalized" ? "Claim (after finalization)" : everClaimed ? "Claimed" : "Nothing to claim"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={h.phase !== "ended" || mine.disqualified}
          onClick={() => setTab("certificates")}
          icon={<FileBadge2 className="size-4" />}
        >
          Get Certificate
        </Button>
      </div>
    </div>
  );

  return (
    <SideLayout
      items={items}
      active={tab}
      onSelect={setTab}
      footer={
        <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-zinc-50 hover:text-ink">
          <LogOut className="size-4" /> Logout
        </button>
      }
    >
      {tab === "dashboard" && overview}
      {tab === "commits" && (
        <Card className="p-5">
          <SectionTitle>Commits</SectionTitle>
          <CommitsTable commits={commits} />
        </Card>
      )}
      {tab === "team" && (
        <TeamSection
          team={team}
          rows={teamRows}
          data={participants}
          inviteCode={p.team.inviteCode}
          isCaptain={isCaptain}
          registrationOpen={Date.now() / 1000 < h.registrationEndTs}
          onChanged={reload}
        />
      )}
      {tab === "certificates" && <CertificatesSection participant={participant} hackathon={h} />}
      {tab === "settings" && (
        <div className="flex flex-col gap-4">
          <AccountSetup returnTo={`/dashboard?p=${participant}`} />
        </div>
      )}
    </SideLayout>
  );
}

export default function Dashboard() {
  const { me, loading } = useAuth();
  const [params, setParams] = useSearchParams();

  if (loading) return <Spinner />;
  if (!me)
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">Team Dashboard</h1>
        <AccountSetup returnTo="/dashboard" />
      </div>
    );
  if (me.participations.length === 0)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Empty
          icon={<Users className="size-5" />}
          title="You are not in a hackathon yet"
          body="Pick a hackathon, create a team or join one with an invite code."
          action={<LinkButton to="/hackathons">Browse Hackathons</LinkButton>}
        />
      </div>
    );

  const selected = me.participations.find((x) => x.participant === params.get("p")) ?? me.participations[0];
  return (
    <>
      {me.participations.length > 1 && (
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
          <select
            className="input max-w-sm"
            value={selected.participant}
            onChange={(e) => setParams({ p: e.target.value })}
          >
            {me.participations.map((x) => (
              <option key={x.participant} value={x.participant}>
                {x.hackathon.title} — {x.team.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <TeamDashboard key={selected.participant} participant={selected.participant} />
    </>
  );
}
