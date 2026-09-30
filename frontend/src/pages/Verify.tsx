import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, ExternalLink, Search, ShieldAlert } from "lucide-react";
import { AppShell } from "../components/Layout";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { fmtDate, shortAddr } from "../lib/format";
import { Button, Card, ErrorBox, Spinner } from "../components/ui";

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function Result({ hash }: { hash: string }) {
  const { data, error, loading } = useAsync(() => api.verify(hash).catch((e) => {
    if ((e as { status?: number }).status === 404) return { valid: false as const, hash };
    throw e;
  }), [hash]);
  if (loading) return <Spinner label="Checking the chain…" />;
  if (error) return <ErrorBox message={error} />;
  if (!data?.valid || !data.hackathon) {
    return (
      <Card className="flex items-start gap-4 border-line p-6">
        <ShieldAlert className="size-8 shrink-0 text-danger" />
        <div>
          <p className="font-display text-lg font-bold">Not verified</p>
          <p className="mt-1 text-sm text-muted">No on-chain record matches this hash. The letter may have been altered.</p>
          <p className="mt-3 font-mono text-xs break-all text-muted">{hash}</p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="flex items-start gap-4 border-ok/40 p-6">
      <BadgeCheck className="size-8 shrink-0 text-ok" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-bold">Verified participation</p>
        <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Hackathon</dt>
          <dd>{data.hackathon.title}</dd>
          <dt className="text-muted">Team</dt>
          <dd>{data.team}</dd>
          <dt className="text-muted">Wallet</dt>
          <dd className="font-mono">{shortAddr(data.wallet, 6)}</dd>
          <dt className="text-muted">Recorded</dt>
          <dd>{data.recordedAt ? fmtDate(data.recordedAt, true) : "—"}</dd>
        </dl>
        <p className="mt-3 font-mono text-xs break-all text-muted">{data.hash}</p>
        {data.explorer && (
          <a href={data.explorer} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-ink hover:underline">
            Solana transaction <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </Card>
  );
}

export default function Verify() {
  const { hash } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"hash" | "text">("hash");

  const check = async () => {
    const value = input.trim();
    const h = mode === "hash" ? value.toLowerCase() : await sha256Hex(value);
    navigate(`/verify/${h}`);
  };

  return (
    <AppShell>
      <div className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Verify certificate</h1>
      <p className="mt-2 text-sm text-muted">Paste the hash from a Proof of Build letter, or the letter text itself (above the “---” line).</p>
      <Card className="mt-6 flex flex-col gap-3 p-5">
        <div className="flex gap-2">
          {(["hash", "text"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1 text-xs font-semibold ${mode === m ? "bg-ink" : "border border-line text-muted"}`}>
              {m === "hash" ? "Hash" : "Letter text"}
            </button>
          ))}
        </div>
        {mode === "hash" ? (
          <input className="input font-mono text-xs" placeholder="64 hex characters" value={input} onChange={(e) => setInput(e.target.value)} />
        ) : (
          <textarea className="input min-h-40 font-mono text-xs" value={input} onChange={(e) => setInput(e.target.value)} />
        )}
        <Button onClick={check} disabled={mode === "hash" ? !/^[0-9a-fA-F]{64}$/.test(input.trim()) : !input.trim()} icon={<Search className="size-4" />}>
          Verify
        </Button>
      </Card>
      {hash && (
        <div className="mt-6">
          <Result hash={hash} />
        </div>
      )}
    </div>
    </AppShell>
  );
}
