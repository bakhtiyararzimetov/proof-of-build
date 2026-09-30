import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Copy, Loader2 } from "lucide-react";

type Variant = "primary" | "outline" | "ghost";
const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-white hover:bg-ink-2 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.45)] disabled:bg-ink/30 disabled:shadow-none",
  outline: "border border-line bg-white text-ink hover:border-ink/40 disabled:opacity-40",
  ghost: "text-muted hover:text-ink hover:bg-black/5 disabled:opacity-40",
};
const sizes = { sm: "h-8 px-3.5 text-xs", md: "h-10 px-5 text-sm", lg: "h-12 px-6 text-sm" };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: keyof typeof sizes;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({
  to,
  variant = "primary",
  size = "md",
  className = "",
  children,
  icon,
}: {
  to: string;
  variant?: Variant;
  size?: keyof typeof sizes;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {icon}
      {children}
    </Link>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`card ${className}`}>{children}</div>;
}

const badgeStyles = {
  live: "brand-grad text-white shadow-[0_6px_16px_-6px_rgba(123,61,255,0.6)]",
  upcoming: "bg-zinc-100 text-zinc-600",
  ended: "bg-zinc-100 text-zinc-500",
  active: "bg-ok/10 text-ok",
  verified: "bg-ok/10 text-ok",
  review: "bg-warn/10 text-warn",
  suspicious: "bg-danger/10 text-danger",
  neutral: "bg-zinc-100 text-zinc-600",
} as const;
export type BadgeTone = keyof typeof badgeStyles;
const STATUS_TONES: BadgeTone[] = ["verified", "review", "suspicious", "neutral"];

export function Badge({ tone, children, className = "" }: { tone: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold ${
        STATUS_TONES.includes(tone) ? "text-[10px] tracking-wider uppercase" : "text-[11px]"
      } ${badgeStyles[tone]} ${className}`}
    >
      {tone === "live" && <span className="size-1.5 animate-pulse rounded-full bg-white" />}
      {children}
    </span>
  );
}

export function phaseBadge(phase: "upcoming" | "running" | "ended", finalized?: boolean) {
  if (finalized) return <Badge tone="ended">Finalized</Badge>;
  if (phase === "running") return <Badge tone="live">Live</Badge>;
  if (phase === "upcoming") return <Badge tone="upcoming">Upcoming</Badge>;
  return <Badge tone="ended">Completed</Badge>;
}

export function Stat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="brand-soft grid size-10 shrink-0 place-items-center rounded-full text-brand">{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-base font-semibold">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Loader2 className="size-5 animate-spin text-brand" />
      {label ?? "Loading…"}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="flex-1 break-words">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-semibold text-ink underline-offset-2 hover:underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-zinc-100 text-ink">{icon}</div>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-xs text-muted transition hover:border-ink/40 hover:text-ink"
    >
      {done ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
      {label ?? (done ? "Copied" : "Copy")}
    </button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold">{children}</h3>
      {action}
    </div>
  );
}

/** Shared SVG gradient referenced by `.icon-grad` / `.icon-grad-fill`. Rendered once in the layout. */
export function BrandDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        {/* userSpaceOnUse in the 24×24 icon box: bounding-box gradients vanish on straight lines (e.g. a "+"). */}
        <linearGradient id="pob-grad" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22">
          <stop offset="0%" stopColor="#7b3dff" />
          <stop offset="100%" stopColor="#ff2d8b" />
        </linearGradient>
      </defs>
    </svg>
  );
}
