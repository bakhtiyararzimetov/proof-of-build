import { Fragment, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  ChevronDown,
  Flag,
  Flame,
  LayoutDashboard,
  Plus,
  Trash2,
  Users,
  UserSquare2,
} from "lucide-react";
import { api, type FlagKind, type HackathonDetail, type ParticipantRow, type ParticipantsResponse } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useAsync } from "../../lib/useAsync";
import { MAX_MEMBERS } from "../../lib/config";
import { errMessage, fmtDate, shortAddr, usdc } from "../../lib/format";
import { disqualify, finalizeAll, setWinners, sweep, useProgram } from "../../lib/program";
import { SideLayout, type SideItem } from "../../components/SideLayout";
import { Badge, Button, Card, Empty, ErrorBox, SectionTitle, Spinner, phaseBadge, type BadgeTone } from "../../components/ui";
import { FireRow } from "../../components/FireRow";
import { useToast } from "../../components/Toast";
import { flagLabel } from "../dashboard/sections";

const SEVERE: FlagKind[] = [
  "REPO_CREATED_BEFORE_START",
  "HUGE_COMMIT",
  "BULK_PUSH",
  "COMMIT_DATE_SKEW",
  "FORCE_PUSH",
  "AUTHOR_MISMATCH",
];
type Status = "verified" | "review" | "suspicious";

type TeamRow = {
  id: string;
  name: string;
  repo: string | null;
  members: ParticipantRow[];
  flags: { kind: FlagKind; who: string; createdAt: string; details: Record<string, unknown> }[];
  status: Status;
  fires: number;
  qualified: number;
};

function buildTeams(h: HackathonDetail, data: ParticipantsResponse): TeamRow[] {
  return h.teams.map((t) => {
    const members = data.participants.filter((p) => p.team === t.address);
    const flags = [
      ...members.flatMap((m) => m.flags.map((f) => ({ kind: f.kind, who: m.githubLogin ?? shortAddr(m.wallet), createdAt: f.createdAt, details: f.details }))),
      ...data.teamFlags
        .filter((f) => f.team === t.address)
        .map((f) => ({ kind: f.kind, who: f.repo ?? "repository", createdAt: f.createdAt, details: f.details })),
    ];
    const status: Status = flags.some((f) => SEVERE.includes(f.kind)) || members.some((m) => m.disqualified)
      ? "suspicious"
      : flags.length > 0 || (h.phase === "ended" && members.some((m) => !m.qualified))
        ? "review"
        : "verified";
    return {
      id: t.address,
      name: t.name,
      repo: t.repos[0] ?? null,
      members,
      flags,
      status,
      fires: members.reduce((s, m) => s + m.fires, 0),
      qualified: members.filter((m) => m.qualified).length,
    };
  });
}

const statusTone: Record<Status, BadgeTone> = { verified: "verified", review: "review", suspicious: "suspicious" };

function TeamsTable({ teams, data }: { teams: TeamRow[]; data: ParticipantsResponse }) {
  const [open, setOpen] = useState<string | null>(null);
  if (teams.length === 0) return <p className="py-6 text-center text-sm text-muted">No teams yet.</p>;
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="table-head px-2 py-2">Team</th>
            <th className="table-head px-2 py-2">Members</th>
            <th className="table-head px-2 py-2">Progress</th>
            <th className="table-head px-2 py-2">Status</th>
            <th className="table-head px-2 py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => {
            const max = t.members.length * data.requiredFires;
            return (
              <Fragment key={t.id}>
                <tr className="border-b border-line/60">
                  <td className="px-2 py-2.5 font-medium">{t.name}</td>
                  <td className="px-2 py-2.5 text-muted">{t.members.length}/{MAX_MEMBERS}</td>
                  <td className="px-2 py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      {t.fires}/{max} <Flame className="size-3.5 fill-ink text-ink" />
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button
                      onClick={() => setOpen(open === t.id ? null : t.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink hover:border-ink/40"
                    >
                      Review <ChevronDown className={`size-3 transition ${open === t.id ? "rotate-180" : ""}`} />
                    </button>
                  </td>
                </tr>
                {open === t.id && (
                  <tr className="border-b border-line/60 bg-zinc-50">
                    <td colSpan={5} className="px-3 py-4">
                      <p className="mb-3 text-xs text-muted">
                        Repository:{" "}
                        {t.repo ? (
                          <a href={`https://github.com/${t.repo}`} target="_blank" rel="noreferrer" className="text-ink hover:underline">{t.repo}</a>
                        ) : (
                          "not connected"
                        )}
                      </p>
                      <ul className="flex flex-col gap-2">
                        {t.members.map((m) => (
                          <li key={m.address} className="flex flex-wrap items-center gap-3 text-xs">
                            <span className="w-32 truncate font-medium">{m.githubLogin ?? shortAddr(m.wallet)}</span>
                            <FireRow days={m.days} size="sm" />
                            <span className="text-muted">{m.commitCount} commits</span>
                            {m.depositPaid && <span className="text-muted">deposit</span>}
                          </li>
                        ))}
                      </ul>
                      {t.flags.length > 0 && (
                        <ul className="mt-3 flex flex-col gap-1.5">
                          {t.flags.map((f, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs">
                              <Flag className="size-3.5 text-danger" />
                              <span>{flagLabel[f.kind]}</span>
                              <span className="text-muted">· {f.who} · {fmtDate(f.createdAt, true)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Timeline({ h }: { h: HackathonDetail }) {
  const now = Date.now() / 1000;
  const steps = [
    { at: h.registrationEndTs, label: "Registration closes" },
    { at: h.endTs, label: "Hackathon ends" },
    { at: h.settlementTs, label: "Winners & finalize open (3h grace for late pushes)" },
    { at: h.winnersDeadlineTs, label: "Winners deadline: after it the prize is split among all qualified" },
    { at: h.sweepTs, label: "Claim window closes: unclaimed funds can be swept" },
  ];
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {steps.map((s) => (
        <li key={s.label} className="flex items-center gap-3">
          <span className={`size-2 shrink-0 rounded-full ${now >= s.at ? "bg-ink-2" : "bg-white/20"}`} />
          <span className="w-36 shrink-0 text-xs text-muted">{fmtDate(s.at, true)}</span>
          <span className={now >= s.at ? "" : "text-muted"}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function Payouts({ h, teams, onDone }: { h: HackathonDetail; teams: TeamRow[]; onDone: () => Promise<void> }) {
  const program = useProgram();
  const { publicKey } = useWallet();
  const toast = useToast();
  const [rows, setRows] = useState<{ team: string; pct: string }[]>([{ team: "", pct: "100" }]);
  const [busy, setBusy] = useState<string | null>(null);
  const now = Date.now() / 1000;
  const settlementOpen = now >= h.settlementTs;
  const winnersOpen = settlementOpen && now < h.winnersDeadlineTs && !h.winnersSet;
  const eligible = teams.filter((t) => t.qualified > 0);
  const total = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  const valid =
    rows.length > 0 &&
    rows.every((r) => r.team && Number(r.pct) > 0) &&
    new Set(rows.map((r) => r.team)).size === rows.length &&
    Math.round(total * 100) === 10_000;

  const run = async (key: string, fn: () => Promise<string>, ok: string) => {
    if (!publicKey) return toast.error("Connect the organizer wallet");
    setBusy(key);
    try {
      const tx = await fn();
      toast.ok(ok, { tx });
      await onDone();
    } catch (e) {
      toast.error(`${key} failed`, errMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6">
        <SectionTitle>Timeline</SectionTitle>
        <Timeline h={h} />
      </Card>

      <Card className="p-6">
        <SectionTitle action={h.winnersSet ? <Badge tone="verified">Set</Badge> : undefined}>1. Winners</SectionTitle>
        {h.winnersSet ? (
          <ul className="flex flex-col gap-2 text-sm">
            {h.winners.map((w, i) => (
              <li key={w.team} className="flex items-center justify-between">
                <span>#{i + 1} {teams.find((t) => t.id === w.team)?.name ?? shortAddr(w.team)}</span>
                <span className="text-muted">{w.bps / 100}% · {usdc((BigInt(h.prizePool) * BigInt(w.bps)) / 10_000n)} USDC</span>
              </li>
            ))}
          </ul>
        ) : !winnersOpen ? (
          <p className="text-sm text-muted">
            {now < h.settlementTs
              ? `Opens ${fmtDate(h.settlementTs, true)}.`
              : "The deadline has passed: every qualified participant can claim an equal share of the prize."}
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">
              Up to 3 teams, shares must add up to exactly 100%. Only teams with at least one member who reached the goal can
              win; the share is split between those members. Can be set once, until {fmtDate(h.winnersDeadlineTs, true)}.
            </p>
            <div className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    className="input"
                    value={r.team}
                    onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, team: e.target.value } : x)))}
                  >
                    <option value="">Select team #{i + 1}</option>
                    {eligible.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.qualified} qualified, {t.status})
                      </option>
                    ))}
                  </select>
                  <div className="relative w-28 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      className="input pr-7"
                      value={r.pct}
                      onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))}
                    />
                    <span className="absolute top-2.5 right-3 text-sm text-muted">%</span>
                  </div>
                  <button
                    className="grid size-10 shrink-0 place-items-center rounded-lg border border-line text-muted hover:text-ink"
                    onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                    aria-label="Remove"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={rows.length >= 3}
                onClick={() => setRows((all) => [...all, { team: "", pct: "" }])}
                icon={<Plus className="size-4" />}
              >
                Add place
              </Button>
              <span className={`text-xs ${Math.round(total * 100) === 10_000 ? "text-ok" : "text-ink"}`}>
                Total {total}% (must be 100%)
              </span>
            </div>
            <Button
              className="mt-4 w-full"
              disabled={!valid}
              loading={busy === "set_winners"}
              onClick={() =>
                run(
                  "set_winners",
                  () =>
                    setWinners(program, {
                      organizer: publicKey!,
                      hackathon: new PublicKey(h.id),
                      winners: rows.map((r) => ({ team: new PublicKey(r.team), bps: Math.round(Number(r.pct) * 100) })),
                    }),
                  "Winners recorded on-chain",
                )
              }
            >
              Record winners on-chain
            </Button>
          </>
        )}
      </Card>

      <Card className="p-6">
        <SectionTitle action={h.status === "finalized" ? <Badge tone="verified">Done</Badge> : undefined}>2. Finalize</SectionTitle>
        <p className="text-sm text-muted">
          Settles every participant: deposits of those below {h.requiredFires} fires or disqualified move into the prize pool.
          Anyone can run it. Settled {h.settledCount}/{h.participantCount}.
        </p>
        {h.status !== "finalized" && (
          <Button
            className="mt-4 w-full"
            disabled={!settlementOpen || !!busy}
            loading={busy?.startsWith("finalize")}
            onClick={async () => {
              if (!publicKey) return toast.error("Connect a wallet");
              setBusy("finalize");
              try {
                const sigs = await finalizeAll(program, { cranker: publicKey, hackathon: new PublicKey(h.id) }, (d, t) =>
                  setBusy(`finalize ${d}/${t}`),
                );
                toast.ok("Hackathon finalized", { tx: sigs[sigs.length - 1] });
                await onDone();
              } catch (e) {
                toast.error("finalize failed", errMessage(e));
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy?.startsWith("finalize") ? busy : settlementOpen ? "Finalize" : `Opens ${fmtDate(h.settlementTs, true)}`}
          </Button>
        )}
      </Card>

      <Card className="p-6">
        <SectionTitle>3. Sweep unclaimed funds</SectionTitle>
        <p className="text-sm text-muted">
          After {fmtDate(h.sweepTs, true)} whatever nobody claimed (and rounding dust) returns to your wallet.
        </p>
        <Button
          className="mt-4 w-full"
          variant="outline"
          disabled={h.status !== "finalized" || now < h.sweepTs}
          loading={busy === "sweep"}
          onClick={() =>
            run("sweep", () => sweep(program, { organizer: publicKey!, hackathon: new PublicKey(h.id), mint: new PublicKey(h.mint) }), "Unclaimed funds returned")
          }
        >
          Sweep
        </Button>
      </Card>
    </div>
  );
}

function DisqualifyButton({ h, p, onDone }: { h: HackathonDetail; p: ParticipantRow; onDone: () => Promise<void> }) {
  const program = useProgram();
  const { publicKey } = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const now = Date.now() / 1000;
  if (p.disqualified || h.winnersSet || now < h.startTs || now >= h.winnersDeadlineTs || h.status === "finalized") return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-full border border-danger/30 px-2.5 py-0.5 text-[11px] font-medium text-danger hover:bg-danger/5">
        Disqualify
      </button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2 pt-2">
      <input className="input flex-1" placeholder="Reason (public; its hash goes on-chain)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button
        size="sm"
        loading={busy}
        disabled={reason.trim().length < 3}
        onClick={async () => {
          if (!publicKey) return toast.error("Connect the organizer wallet");
          setBusy(true);
          try {
            const text = reason.trim();
            const tx = await disqualify(program, {
              organizer: publicKey,
              hackathon: new PublicKey(h.id),
              participant: new PublicKey(p.address),
              team: new PublicKey(p.team),
              reason: text,
            });
            await api.saveDisqualification(p.address, text);
            toast.ok("Participant disqualified", { tx, body: "The deposit will go to the prize pool." });
            setOpen(false);
            await onDone();
          } catch (e) {
            toast.error("Could not disqualify", errMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Confirm
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}

const items: SideItem[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "teams", label: "Teams", icon: Users },
  { key: "participants", label: "Participants", icon: UserSquare2 },
  { key: "suspicious", label: "Suspicious", icon: AlertTriangle },
  { key: "payouts", label: "Payouts", icon: Banknote },
];

export default function Admin() {
  const { id = "" } = useParams();
  const { me, loading: authLoading } = useAuth();
  const [tab, setTab] = useState("overview");
  const { data, error, loading, reload } = useAsync(
    async () => ({ h: await api.hackathon(id), participants: await api.participants(id) }),
    [id],
  );
  const teams = useMemo(() => (data ? buildTeams(data.h, data.participants) : []), [data]);

  if (loading || authLoading) return <Spinner />;
  if (error || !data) return <div className="mx-auto max-w-5xl px-4 py-10"><ErrorBox message={error ?? "Failed"} onRetry={reload} /></div>;
  const { h, participants } = data;
  if (!me?.wallet || me.wallet !== h.organizer) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Empty icon={<AlertTriangle className="size-5" />} title="Organizer only" body={`Sign in and link the organizer wallet ${shortAddr(h.organizer, 6)}.`} />
      </div>
    );
  }

  const suspicious = teams.flatMap((t) => t.flags.map((f) => ({ ...f, team: t.name })));
  const verifiedCount = participants.participants.filter((p) => p.qualified).length;
  const stats = [
    { label: "Prize Pool, USDC", value: usdc(h.prizePool), tone: "text-brand" },
    { label: "Total Teams", value: teams.length, tone: "" },
    { label: "Verified", value: verifiedCount, tone: "text-ok" },
    { label: "Review", value: teams.filter((t) => t.status === "review").length, tone: "text-warn" },
    { label: "Suspicious", value: teams.filter((t) => t.status === "suspicious").length, tone: "text-danger" },
  ];

  return (
    <SideLayout
      items={items.map((i) => (i.key === "suspicious" ? { ...i, badge: suspicious.length } : i))}
      active={tab}
      onSelect={setTab}
      footer={
        <Link to={`/hackathons/${h.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Public page
        </Link>
      }
    >
      <div className="mb-5">
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
            <p className="text-sm text-muted">{h.title}</p>
          </div>
          {phaseBadge(h.phase, h.status === "finalized")}
        </div>
      </div>

      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map((s) => (
              <Card key={s.label} className="p-4">
                <p className="text-[11px] tracking-wider text-muted uppercase">{s.label}</p>
                <p className={`mt-1 text-2xl font-semibold tracking-tight ${s.tone}`}>{s.value}</p>
              </Card>
            ))}
          </div>
          <Card className="p-5">
            <SectionTitle>Teams</SectionTitle>
            <TeamsTable teams={teams} data={participants} />
          </Card>
          <Card className="p-5">
            <SectionTitle>Suspicious Activity</SectionTitle>
            <SuspiciousList items={suspicious.slice(0, 6)} onReview={() => setTab("teams")} />
          </Card>
        </div>
      )}
      {tab === "teams" && (
        <Card className="p-5">
          <SectionTitle>Teams</SectionTitle>
          <TeamsTable teams={teams} data={participants} />
        </Card>
      )}
      {tab === "participants" && (
        <Card className="p-5">
          <SectionTitle
            action={
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                need {participants.requiredFires} <Flame className="size-3.5 fill-ink text-ink" />
              </span>
            }
          >
            Participants
          </SectionTitle>
          <ul className="divide-y divide-line">
            {participants.participants.map((p) => (
              <li key={p.address} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="w-36 truncate font-medium">{p.githubLogin ?? shortAddr(p.wallet)}</span>
                <span className="w-28 truncate text-xs text-muted">{p.teamName}</span>
                <FireRow days={p.days} size="sm" />
                <span className="ml-auto flex items-center gap-2">
                  {p.flags.length > 0 && (
                    <span title={p.flags.map((f) => flagLabel[f.kind]).join("\n")}>
                      <Badge tone="review">{p.flags.length} flag{p.flags.length > 1 ? "s" : ""}</Badge>
                    </span>
                  )}
                  {p.disqualified ? (
                    <span title={p.disqualifiedReason ?? ""}>
                      <Badge tone="suspicious">disqualified</Badge>
                    </span>
                  ) : (
                    <Badge tone={p.qualified ? "verified" : "neutral"}>{p.fires}/{participants.requiredFires}</Badge>
                  )}
                  <DisqualifyButton h={h} p={p} onDone={reload} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {tab === "suspicious" && (
        <Card className="p-5">
          <SectionTitle>Suspicious Activity</SectionTitle>
          <SuspiciousList items={suspicious} onReview={() => setTab("teams")} />
        </Card>
      )}
      {tab === "payouts" && <Payouts h={h} teams={teams} onDone={reload} />}
    </SideLayout>
  );
}

function SuspiciousList({
  items,
  onReview,
}: {
  items: { team: string; kind: FlagKind; who: string; createdAt: string }[];
  onReview: () => void;
}) {
  if (items.length === 0) return <p className="py-4 text-sm text-muted">Nothing suspicious so far.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((f, i) => (
        <li key={i} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
          <span className="w-32 truncate font-medium">{f.team}</span>
          <span className="flex-1 text-muted">
            {flagLabel[f.kind]} <span className="text-xs">· {f.who}</span>
          </span>
          <button onClick={onReview} className="rounded-full border border-danger/30 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/5">
            Review
          </button>
        </li>
      ))}
    </ul>
  );
}
