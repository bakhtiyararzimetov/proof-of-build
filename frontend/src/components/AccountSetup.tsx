import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { CheckCircle2, Github, KeyRound, Wallet } from "lucide-react";
import { WalletButton } from "./WalletButton";
import { useAuth, useLinkWallet } from "../lib/auth";
import { errMessage, shortAddr } from "../lib/format";
import { Button } from "./ui";
import { useToast } from "./Toast";

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className={`flex gap-4 rounded-xl border p-4 ${done ? "border-ok/30 bg-ok/[0.03]" : "border-line"}`}>
      <div
        className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
          done ? "bg-ok/15 text-ok" : "bg-ink text-white"
        }`}
      >
        {done ? <CheckCircle2 className="size-4" /> : n}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <div className="mt-2 text-sm text-muted">{children}</div>
      </div>
    </div>
  );
}

/** GitHub sign-in + wallet link. Renders nothing extra once both are done (unless `always`). */
export function AccountSetup({ returnTo }: { returnTo?: string }) {
  const { me, loginWithGithub } = useAuth();
  const { publicKey } = useWallet();
  const link = useLinkWallet();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const connected = publicKey?.toBase58();
  const linked = me?.wallet ?? null;
  const mismatch = !!(linked && connected && linked !== connected);

  return (
    <div className="flex flex-col gap-3">
      <Step n={1} done={!!me} title="Sign in with GitHub">
        {me ? (
          <span>
            Signed in as <span className="text-ink">@{me.githubLogin}</span>. Commits by this account light your fires.
          </span>
        ) : (
          <>
            <p>We match commit authors to your GitHub account. Only a salted hash of your id goes on-chain.</p>
            <Button className="mt-3" icon={<Github className="size-4" />} onClick={() => loginWithGithub(returnTo).catch((e) => toast.error("Sign-in is unavailable", errMessage(e)))}>
              Continue with GitHub
            </Button>
          </>
        )}
      </Step>

      <Step n={2} done={!!linked && connected === linked} title="Link your Solana wallet">
        {linked && !connected ? (
          <>
            <p>
              Linked wallet <span className="font-mono text-ink">{shortAddr(linked, 6)}</span>. Connect it to continue.
            </p>
            <div className="mt-3">
              <WalletButton />
            </div>
          </>
        ) : linked && !mismatch ? (
          <span>
            Linked wallet <span className="font-mono text-ink">{shortAddr(linked, 6)}</span>
          </span>
        ) : (
          <>
            <p>
              Sign a one-time message (no transaction, no fee) to prove you own the wallet.
              {mismatch && (
                <span className="mt-1 block text-warn">
                  Connected {shortAddr(connected, 4)} differs from linked {shortAddr(linked, 4)}. Switch wallets or link
                  the connected one.
                </span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!connected ? (
                <WalletButton />
              ) : (
                <Button
                  disabled={!me}
                  loading={busy}
                  icon={<KeyRound className="size-4" />}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await link();
                      toast.ok("Wallet linked");
                    } catch (e) {
                      toast.error("Could not link the wallet", errMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Sign & link {shortAddr(connected, 4)}
                </Button>
              )}
              {!me && (
                <span className="inline-flex items-center gap-1 text-xs">
                  <Wallet className="size-3.5" /> sign in with GitHub first
                </span>
              )}
            </div>
          </>
        )}
      </Step>
    </div>
  );
}

/** True when the user can send transactions the server builds for their linked wallet. */
export function useReady() {
  const { me } = useAuth();
  const { publicKey } = useWallet();
  return !!me?.wallet && publicKey?.toBase58() === me.wallet;
}
