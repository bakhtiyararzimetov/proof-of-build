import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { BaseWalletMultiButton } from "@solana/wallet-adapter-react-ui";

const labels = {
  "change-wallet": "Change wallet",
  connecting: "Connecting…",
  "copy-address": "Copy address",
  copied: "Copied",
  disconnect: "Disconnect",
  "has-wallet": "Connect",
  "no-wallet": "Connect Wallet",
} as const;

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Reopens the current page inside the wallet app's built-in browser, where the wallet is injected. */
const phantomBrowse = () =>
  `https://phantom.app/ul/browse/${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`;
const solflareBrowse = () =>
  `https://solflare.com/ul/v1/browse/${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`;

/**
 * The wallet-adapter button with the product's wording ("Connect Wallet").
 * A mobile browser (Safari, Chrome) has no wallet extensions, so there it offers to open the site in Phantom / Solflare.
 */
export function WalletButton() {
  const { wallets, connected } = useWallet();
  const injected = wallets.some((w) => w.readyState === WalletReadyState.Installed);
  if (connected || injected || !isMobile()) return <BaseWalletMultiButton labels={labels} />;
  return (
    <div className="flex items-center gap-2">
      <a
        href={phantomBrowse()}
        className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-semibold whitespace-nowrap text-white"
      >
        Open in Phantom
      </a>
      <a href={solflareBrowse()} className="text-xs whitespace-nowrap text-muted underline-offset-2 hover:underline">
        Solflare
      </a>
    </div>
  );
}
