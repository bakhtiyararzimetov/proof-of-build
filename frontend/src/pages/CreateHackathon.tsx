import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Lock, Rocket, ShieldCheck, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { DEFAULT_MINT } from "../lib/config";
import { errMessage, toBaseUnits } from "../lib/format";
import { createHackathon, useProgram } from "../lib/program";
import { Button, Card } from "../components/ui";
import { AccountSetup, useReady } from "../components/AccountSetup";
import { useToast } from "../components/Toast";
import { AppShell } from "../components/Layout";
import { WalletButton } from "../components/WalletButton";

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateHackathon() {
  const { me } = useAuth();
  const ready = useReady();
  const { publicKey } = useWallet();
  const program = useProgram();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState({
    title: "",
    description: "",
    start: localInput(new Date(Date.now() + 5 * 60_000)),
    days: "5",
    regHours: "24",
    requiredFires: "3",
    deposit: "0",
    prize: "1000",
    mint: DEFAULT_MINT,
    // Demo mode: starts now and lasts N minutes, to show join → commit → fire → certificate
    // in one sitting. The contract counts it as 1 day.
    demo: false,
    minutes: "30",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const days = Number(f.days);
  const fires = f.demo ? 1 : Number(f.requiredFires);
  const regHours = Number(f.regHours);
  const minutes = Number(f.minutes);
  const invalid =
    !f.title.trim() ||
    (f.demo
      ? !(minutes >= 10 && minutes <= 24 * 60)
      : !(days >= 1 && days <= 64) || !(fires >= 1 && fires <= days) || !(regHours >= 0 && regHours <= days * 24)) ||
    !(Number(f.prize) > 0) ||
    !(Number(f.deposit) >= 0);

  const submit = async () => {
    if (!publicKey) return;
    try {
      setBusy("Preparing…");
      const { oracle } = await api.health();
      const now = Math.floor(Date.now() / 1000);
      const startTs = f.demo ? now : Math.floor(new Date(f.start).getTime() / 1000);
      const endTs = f.demo ? now + minutes * 60 : startTs + days * 86_400;
      // Registration must still be open when the transaction lands; in demo mode it stays open to the end.
      const registrationEndTs = f.demo ? endTs : Math.max(startTs + regHours * 3_600, now + 600);
      setBusy("Confirm in your wallet…");
      const { hackathon, tx } = await createHackathon(program, {
        organizer: publicKey,
        oracle: new PublicKey(oracle),
        mint: new PublicKey(f.mint.trim()),
        startTs,
        endTs,
        registrationEndTs: Math.min(registrationEndTs, endTs),
        depositAmount: toBaseUnits(f.deposit),
        requiredFires: fires,
        prizeAmount: toBaseUnits(f.prize),
      });
      setBusy("Publishing…");
      await api.registerHackathon({ address: hackathon.toBase58(), title: f.title.trim(), description: f.description.trim() });
      toast.ok("Hackathon created, prize locked in the vault", { tx });
      navigate(`/hackathons/${hackathon.toBase58()}`);
    } catch (e) {
      toast.error("Could not create the hackathon", errMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell>
      <h1 className="text-3xl font-semibold tracking-tight">Create Hackathon</h1>
      <p className="mt-1.5 text-sm text-muted">Set up a new hackathon and lock prizes in a smart contract.</p>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_280px]">
      <div className="min-w-0">

      {!me || !ready ? (
        <AccountSetup returnTo="/create" />
      ) : (
        <Card className="flex flex-col gap-5 p-6">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" className="input" value={f.title} onChange={set("title")} placeholder="Crypto World's Fair" maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="desc">About</label>
            <textarea id="desc" className="input min-h-28" value={f.description} onChange={set("description")} placeholder="Track, goals, judging…" />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--color-brand)]"
              checked={f.demo}
              onChange={(e) => setF((v) => ({ ...v, demo: e.target.checked }))}
            />
            <span className="text-sm">
              <span className="font-semibold">Demo mode</span>
              <span className="block text-xs text-muted">
                Starts now and ends in a few minutes, 1 fire required, registration open until the end. Shows the full
                flow (join → commit → fire → certificate) in one go.
              </span>
            </span>
          </label>
          {f.demo ? (
          <div>
            <label className="label" htmlFor="minutes">Duration, minutes</label>
            <input id="minutes" type="number" min={10} max={1440} className="input" value={f.minutes} onChange={set("minutes")} />
            <p className="mt-1.5 text-xs text-muted">
              Certificates open right after the end. Payouts (finalize, claim) open 3 hours after the end.
            </p>
          </div>
          ) : (
          <>
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="start">Start</label>
              <input id="start" type="datetime-local" className="input" value={f.start} onChange={set("start")} />
            </div>
            <div>
              <label className="label" htmlFor="days">Duration, days</label>
              <input id="days" type="number" min={1} max={64} className="input" value={f.days} onChange={set("days")} />
            </div>
            <div>
              <label className="label" htmlFor="fires">Required fires</label>
              <input id="fires" type="number" min={1} max={days || 1} className="input" value={f.requiredFires} onChange={set("requiredFires")} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="reg">Registration closes, hours after start</label>
            <input id="reg" type="number" min={0} max={days * 24} className="input" value={f.regHours} onChange={set("regHours")} />
            <p className="mt-1.5 text-xs text-muted">
              Nobody can join after that, so nobody can slip into a winning team at the last moment.
            </p>
          </div>
          </>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="prize">Prize, USDC</label>
              <input id="prize" type="number" min={0} className="input" value={f.prize} onChange={set("prize")} />
            </div>
            <div>
              <label className="label" htmlFor="deposit">Deposit per member, USDC</label>
              <input id="deposit" type="number" min={0} className="input" value={f.deposit} onChange={set("deposit")} />
              <p className="mt-1.5 text-xs text-muted">0 = no deposit.</p>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="mint">Token mint</label>
            <input id="mint" className="input font-mono text-xs" value={f.mint} onChange={set("mint")} />
            <p className="mt-1.5 text-xs text-muted">Test USDC on devnet by default. Your wallet must hold at least the prize amount.</p>
          </div>
          <Button size="lg" disabled={invalid} loading={!!busy} onClick={submit} icon={<Rocket className="size-4" />}>
            {busy ?? "Create Hackathon"}
          </Button>
        </Card>
      )}
      </div>
      <aside className="flex flex-col gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="brand-soft grid size-9 place-items-center rounded-xl">
              <Wallet className="icon-grad size-4" />
            </span>
            <p className="text-sm font-semibold">Wallet Connection</p>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Your hackathon will be created on Solana. Confirm the transaction in your wallet.
          </p>
          <div className="mt-4 [&_.wallet-adapter-button]:w-full [&_.wallet-adapter-button]:justify-center [&_.wallet-adapter-dropdown]:w-full">
            <WalletButton />
          </div>
        </Card>
        <ul className="flex flex-col gap-3 px-1 text-xs text-muted">
          <li className="flex gap-2.5">
            <Lock className="mt-0.5 size-4 shrink-0 text-ink" />
            The prize is locked in a smart contract and cannot be taken back by hand.
          </li>
          <li className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink" />
            Winners must be chosen within 7 days after the end, otherwise everyone who reached the goal shares the prize.
          </li>
        </ul>
      </aside>
      </div>
    </AppShell>
  );
}
