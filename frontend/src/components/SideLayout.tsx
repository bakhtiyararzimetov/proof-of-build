import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type SideItem = { key: string; label: string; icon: LucideIcon; badge?: number };

/** Section navigation for the team dashboard and the admin panel. */
export function SideLayout({
  items,
  active,
  onSelect,
  footer,
  children,
}: {
  items: SideItem[];
  active: string;
  onSelect: (key: string) => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[210px_1fr]">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {items.map((it) => {
            const Icon = it.icon;
            const on = it.key === active;
            return (
              <button
                key={it.key}
                onClick={() => onSelect(it.key)}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  on ? "bg-zinc-100 font-medium text-ink" : "text-muted hover:bg-zinc-50 hover:text-ink"
                }`}
              >
                <Icon className="size-4" />
                <span className="flex-1">{it.label}</span>
                {!!it.badge && (
                  <span className="rounded-full bg-danger/10 px-1.5 text-[10px] font-semibold text-danger">{it.badge}</span>
                )}
              </button>
            );
          })}
          {footer && <div className="hidden border-t border-line pt-2 lg:mt-8 lg:block">{footer}</div>}
        </nav>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
