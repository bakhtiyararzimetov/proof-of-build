import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Share, SquarePlus, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

// Chrome fires this once, possibly before React mounts, so it is captured at module load.
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * "Install app" for the PWA. Android/desktop Chrome: the system install prompt.
 * iOS has no install API, so it shows the Share → Add to Home Screen steps. Hidden once installed.
 */
export function InstallApp({ className = "" }: { className?: string }) {
  const [, rerender] = useState(0);
  const [iosHelp, setIosHelp] = useState(false);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  if (isStandalone() || (!deferred && !isIos())) return null;

  const install = async () => {
    if (!deferred) return setIosHelp(true);
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    rerender((n) => n + 1);
  };

  return (
    <>
      <button
        onClick={install}
        className={`inline-flex h-9 items-center gap-2 rounded-full border border-line bg-white px-4 text-[13px] font-semibold text-ink ${className}`}
      >
        <Download className="size-4" /> Install app
      </button>
      {iosHelp &&
        // Portal: an animated (transformed) ancestor would otherwise trap the fixed overlay.
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => setIosHelp(false)}
          >
            <div
              className="card w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-lg font-semibold">Install Proof of Build</p>
                <button
                  onClick={() => setIosHelp(false)}
                  aria-label="Close"
                  className="text-muted"
                >
                  <X className="size-5" />
                </button>
              </div>
              <ol className="mt-4 flex flex-col gap-3 text-sm">
                <li className="flex items-center gap-3">
                  <span className="brand-soft grid size-9 shrink-0 place-items-center rounded-xl">
                    <Share className="icon-grad size-4" />
                  </span>
                  <span>
                    Tap <b>Share</b> in the Safari toolbar
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="brand-soft grid size-9 shrink-0 place-items-center rounded-xl">
                    <SquarePlus className="icon-grad size-4" />
                  </span>
                  <span>
                    Choose <b>Add to Home Screen</b>
                  </span>
                </li>
              </ol>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
