import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, ExternalLink, XCircle, X } from "lucide-react";
import { explorerTx } from "../lib/config";

type Toast = { id: number; kind: "ok" | "error"; title: string; body?: string; tx?: string };
type ToastApi = {
  ok: (title: string, opts?: { body?: string; tx?: string }) => void;
  error: (title: string, body?: string) => void;
};

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.kind === "error" ? 9000 : 6000);
  }, []);
  const api: ToastApi = {
    ok: (title, opts) => push({ kind: "ok", title, ...opts }),
    error: (title, body) => push({ kind: "error", title, body }),
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rise pointer-events-auto flex w-full max-w-sm gap-3 rounded-2xl border bg-white p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)] ${
              t.kind === "ok" ? "border-ok/30" : "border-danger/30"
            }`}
          >
            {t.kind === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.body && <p className="mt-1 text-xs break-words text-muted">{t.body}</p>}
              {t.tx && (
                <a
                  href={explorerTx(t.tx)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink hover:underline"
                >
                  View transaction <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
              className="text-muted hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
