import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileBadge2, Flame, Github, Plus, ShieldCheck } from "lucide-react";
import {
  api,
  type AttestationResult,
  type CommitRow,
  type HackathonDetail,
  type ParticipantRow,
  type ParticipantsResponse,
  type TeamDetail,
} from "../../lib/api";
import { MAX_MEMBERS, explorerTx } from "../../lib/config";
import { errMessage, fmtDate, shortAddr, shortSha } from "../../lib/format";
import { Avatar, Badge, Button, Card, CopyButton, SectionTitle } from "../../components/ui";
import { FireRow } from "../../components/FireRow";
import { useToast } from "../../components/Toast";

export const flagLabel: Record<string, string> = {
  REPO_CREATED_BEFORE_START: "Repository created before the start",
  HUGE_COMMIT: "Huge commit",
  BULK_PUSH: "Huge amount of code in one push",
  COMMIT_DATE_SKEW: "Commit date far from push time",
  FORCE_PUSH: "Force-push rewrote history",
  AUTHOR_MISMATCH: "Commit written as this member but pushed by someone else",
  NEW_GITHUB_ACCOUNT: "GitHub account created recently",
  INACTIVE_MEMBER: "No commits while the team is active",
};

export function CommitsTable({ commits, compact }: { commits: CommitRow[]; compact?: boolean }) {
  if (commits.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No commits yet. Push to the registered repository to light a fire.</p>;
  }
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="table-head px-2 py-2">Hash</th>
            <th className="table-head px-2 py-2">Author</th>
            <th className="table-head px-2 py-2">Pushed</th>
            {!compact && <th className="table-head px-2 py-2">Fire</th>}
            <th className="table-head px-2 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {commits.map((c) => (
            <tr key={c.sha}>
              <td className="px-2 py-2.5">
                <a
                  href={`https://github.com/${c.repo}/commit/${c.sha}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-ink/80 hover:text-ink"
                >
                  {shortSha(c.sha)}
                </a>
              </td>
              <td className="px-2 py-2.5 text-muted">{c.author ?? "unknown"}</td>
              <td className="px-2 py-2.5 whitespace-nowrap text-muted">{fmtDate(c.pushedAt, true)}</td>
              {!compact && (
                <td className="px-2 py-2.5">
                  {c.fireDay !== null ? (
                    c.fireTx ? (
                      <a href={explorerTx(c.fireTx)} target="_blank" rel="noreferrer" className="text-xs text-ink hover:underline">
                        <span className="inline-flex items-center gap-1">
                          <Flame className="size-3.5 fill-ink" /> Day {c.fireDay + 1}
                        </span>
                      </a>
                    ) : (
                      <span className="text-xs text-muted">pending…</span>
                    )
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
              )}
              <td className="px-2 py-2.5 text-right">
                <span title={c.flags.map((f) => flagLabel[f]).join(", ")}>
                  <Badge tone={c.status === "verified" ? "verified" : c.status === "suspicious" ? "suspicious" : "neutral"}>
                    {c.status}
                  </Badge>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RepoCard({
  team,
  isCaptain,
  onAdded,
  bare,
}: {
  team: TeamDetail;
  isCaptain: boolean;
  onAdded: () => void;
  /** Render without its own card (inside another card). */
  bare?: boolean;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const repo = team.repos[0];
  const box = bare ? "rounded-xl border border-line" : "card";

  if (repo) {
    return (
      <div className={`${box} flex items-center gap-3 p-4`}>
        <Github className="size-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">GitHub Repository</p>
          <a href={`https://github.com/${repo.fullName}`} target="_blank" rel="noreferrer" className="truncate text-xs text-ink hover:underline">
            github.com/{repo.fullName}
          </a>
        </div>
        <ExternalLink className="size-4 text-muted" />
      </div>
    );
  }
  return (
    <div className={`${box} p-4`}>
      <div className="flex items-center gap-2">
        <Github className="size-5" />
        <p className="text-sm font-semibold">Connect the repository</p>
      </div>
      {isCaptain ? (
        <>
          <p className="mt-2 text-xs text-muted">
            1. Install the Proof of Build GitHub App on the repository. 2. Enter it here as <span className="font-mono">owner/repo</span>.
          </p>
          <div className="mt-3 flex gap-2">
            <input className="input" placeholder="team-alpha/project" value={name} onChange={(e) => setName(e.target.value)} />
            <Button
              loading={busy}
              disabled={!/^[\w.-]+\/[\w.-]+$/.test(name.trim())}
              icon={<Plus className="size-4" />}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api.addRepo(team.address, name.trim());
                  toast.ok("Repository connected", r.flagged ? { body: "Flagged: it was created before the hackathon started." } : undefined);
                  onAdded();
                } catch (e) {
                  toast.error("Could not connect the repository", errMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted">Waiting for the captain to connect the team repository.</p>
      )}
    </div>
  );
}

/** Compact member list with roles and daily flames (dashboard side column). */
export function MembersList({ rows, captain }: { rows: ParticipantRow[]; captain: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.address} className="flex items-center gap-3">
          <Avatar login={r.githubLogin} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{r.githubLogin ?? shortAddr(r.wallet)}</p>
            <p className="text-xs text-muted">{r.wallet === captain ? "Leader" : "Developer"}</p>
          </div>
          <FireRow days={r.days} size="sm" />
          <span
            className={`size-2 rounded-full ${r.disqualified ? "bg-danger" : r.qualified ? "bg-ok" : "bg-zinc-300"}`}
            title={r.disqualified ? "Disqualified" : r.qualified ? "Goal reached" : "In progress"}
          />
        </li>
      ))}
    </ul>
  );
}

export function TeamSection({
  team,
  rows,
  data,
  inviteCode: initialInvite,
  isCaptain,
  registrationOpen,
  onChanged,
}: {
  team: TeamDetail;
  rows: ParticipantRow[];
  data: ParticipantsResponse;
  inviteCode: string;
  isCaptain: boolean;
  registrationOpen: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [inviteCode, setInviteCode] = useState(initialInvite);
  const [rotating, setRotating] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <SectionTitle action={<span className="text-xs text-muted">{rows.length}/{MAX_MEMBERS}</span>}>Members</SectionTitle>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.address} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar login={r.githubLogin} className="size-8 border border-line" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {r.githubLogin ?? "unknown"}
                  {r.wallet === team.captain && <span className="ml-2 text-[10px] tracking-wider text-ink uppercase">captain</span>}
                </p>
                <p className="font-mono text-xs text-muted">{shortAddr(r.wallet, 5)}</p>
              </div>
              <FireRow days={r.days} size="sm" />
              <Badge tone={r.disqualified ? "suspicious" : r.qualified ? "verified" : "neutral"}>
                {r.disqualified ? "disqualified" : `${r.fires}/${data.requiredFires}`}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>
      {rows.length < MAX_MEMBERS && registrationOpen && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-semibold">Invite teammates</p>
            <p className="text-xs text-muted">They open the hackathon page → “Join with invite” → this code.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-line bg-zinc-50 px-3 py-1.5 font-mono text-sm">{inviteCode}</code>
            <CopyButton value={inviteCode} />
            {isCaptain && (
              <Button
                size="sm"
                variant="ghost"
                loading={rotating}
                onClick={async () => {
                  setRotating(true);
                  try {
                    setInviteCode((await api.rotateInvite(team.address)).inviteCode);
                    toast.ok("New invite code", { body: "The old code no longer works." });
                  } catch (e) {
                    toast.error("Could not change the code", errMessage(e));
                  } finally {
                    setRotating(false);
                  }
                }}
              >
                New code
              </Button>
            )}
          </div>
        </Card>
      )}
      <RepoCard team={team} isCaptain={isCaptain} onAdded={onChanged} />
    </div>
  );
}

export function CertificatesSection({ participant, hackathon }: { participant: string; hackathon: HackathonDetail }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AttestationResult | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <FileBadge2 className="size-10 shrink-0 text-ink" />
          <div className="flex-1">
            <p className="font-display text-lg font-bold">Proof of participation</p>
            <p className="mt-1 text-sm text-muted">
              We generate a letter confirming your participation in {hackathon.title}, email it to you and record its SHA-256 on Solana.
              Personal data never goes on-chain: anyone can check the letter against the hash.
            </p>
            <Button
              className="mt-4"
              loading={busy}
              disabled={hackathon.phase !== "ended"}
              icon={<ShieldCheck className="size-4" />}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api.issueAttestation(participant);
                  setResult(r);
                  toast.ok(r.emailSent ? "Certificate issued and emailed" : "Certificate issued", { tx: r.tx });
                } catch (e) {
                  toast.error("Could not issue the certificate", errMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Get Certificate
            </Button>
            {hackathon.phase !== "ended" && (
              <p className="mt-2 text-xs text-muted">Available after the hackathon ends.</p>
            )}
          </div>
        </div>
      </Card>
      {result && (
        <Card className="rise p-6">
          <SectionTitle action={<CopyButton value={result.letter} label="Copy text" />}>Your letter</SectionTitle>
          <pre className="rounded-lg border border-line bg-zinc-50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink/80">
            {result.letter}
          </pre>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-mono break-all text-muted">SHA-256 {result.hash}</span>
            <Link to={`/verify/${result.hash}`} className="text-ink hover:underline">Verify page</Link>
            <a href={result.explorer} target="_blank" rel="noreferrer" className="text-ink hover:underline">Transaction ↗</a>
          </div>
        </Card>
      )}
    </div>
  );
}
