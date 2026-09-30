import { Flame, Plus } from "lucide-react";

type Day = { day: number; fire: boolean; commit?: string | null };

/** Daily progress: a gradient flame = a verified commit day on-chain. */
export function FireRow({
  days,
  currentDay,
  size = "lg",
}: {
  days: Day[];
  currentDay?: number | null;
  size?: "sm" | "lg";
}) {
  if (size === "sm") {
    return (
      <div className="flex flex-wrap items-center gap-0.5">
        {days.map((d) => (
          <Flame
            key={d.day}
            className={`size-3.5 ${d.fire ? "icon-grad-fill" : "text-zinc-300"}`}
            aria-label={`Day ${d.day + 1}: ${d.fire ? "fire" : "no fire"}`}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap justify-between gap-y-4">
      {days.map((d) => {
        const isToday = currentDay === d.day;
        return (
          <div
            key={d.day}
            title={d.commit ? `Commit ${d.commit.slice(0, 7)}` : undefined}
            className="flex min-w-14 flex-1 flex-col items-center gap-2"
          >
            <div
              className={`grid size-11 place-items-center rounded-full transition ${
                d.fire
                  ? "brand-soft shadow-[0_6px_16px_-8px_rgba(123,61,255,0.55)]"
                  : isToday
                    ? "border-2 border-dashed border-zinc-300 bg-white text-zinc-400"
                    : "bg-zinc-100 text-zinc-400"
              }`}
            >
              {d.fire ? <Flame className="icon-grad-fill size-6" /> : <Plus className="size-4" />}
            </div>
            <span className={`text-xs ${d.fire ? "text-ink" : "text-muted"}`}>Day {d.day + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
      <div className="brand-grad h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}
