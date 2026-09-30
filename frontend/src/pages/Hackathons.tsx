import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Coins, Plus, Search, Trophy, Users } from "lucide-react";
import { api, type HackathonListItem } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { usdc } from "../lib/format";
import { Empty, ErrorBox, LinkButton, Spinner, phaseBadge } from "../components/ui";
import { CoverArt } from "../components/Art";
import { AppShell } from "../components/Layout";

const filters = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "running", label: "Live" },
  { key: "ended", label: "Completed" },
] as const;
type FilterKey = (typeof filters)[number]["key"];

const shortDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** First line of the description is treated as tags: "Solana • DeFi • Web3". */
function tagsOf(h: HackathonListItem) {
  const first = h.description.split("\n")[0] ?? "";
  return first
    .split(/[•·,|]/)
    .map((t) => t.trim())
    .filter((t) => t && t.length <= 20)
    .slice(0, 3);
}

function HackathonCard({ h }: { h: HackathonListItem }) {
  const tags = tagsOf(h);
  return (
    <Link to={`/hackathons/${h.id}`} className="card card-hover group flex gap-5 p-4">
      <div className="size-28 shrink-0 overflow-hidden rounded-xl sm:size-32">
        <CoverArt seed={h.id} className="h-full w-full transition duration-500 group-hover:scale-105" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate font-semibold">{h.title}</h3>
          {phaseBadge(h.phase, h.status === "finalized")}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                {t}
              </span>
            ))}
          </div>
        )}
        <p className="inline-flex items-center gap-1.5 text-xs text-muted">
          <CalendarDays className="size-3.5" /> {shortDate(h.startTs)} – {shortDate(h.endTs)}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" /> {h.teams} teams
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Coins className="size-3.5" /> {usdc(h.prizePool)} USDC
            </span>
          </div>
          <span className="rounded-full bg-ink px-5 py-1.5 text-xs font-semibold text-white transition group-hover:bg-ink-2">
            View
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function Hackathons() {
  const { data, error, loading, reload } = useAsync(() => api.hackathons(), []);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (h) =>
        (filter === "all" || h.phase === filter) &&
        (!q || h.title.toLowerCase().includes(q) || h.description.toLowerCase().includes(q)),
    );
  }, [data, filter, query]);

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Hackathons</h1>
          <p className="mt-1.5 text-sm text-muted">Find and join the best hackathons. Build, prove, earn.</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <input
              className="input rounded-full pl-10"
              placeholder="Search hackathons…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <LinkButton to="/create" variant="outline" size="md" icon={<Plus className="size-4" />}>
            Create
          </LinkButton>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              filter === f.key ? "bg-ink text-white" : "border border-line bg-white text-muted hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : list.length === 0 ? (
          <Empty
            icon={<Trophy className="size-5" />}
            title={query ? "Nothing found" : "No hackathons here yet"}
            body={
              query ? "Try another search." : filter === "all" ? "Be the first organizer: lock a prize pool and invite builders." : "Try another filter."
            }
            action={filter === "all" && !query ? <LinkButton to="/create">Create Hackathon</LinkButton> : undefined}
          />
        ) : (
          list.map((h) => <HackathonCard key={h.id} h={h} />)
        )}
      </div>
    </AppShell>
  );
}
