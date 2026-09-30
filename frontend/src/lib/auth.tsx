import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { ApiError, api, tokenStore, type Me } from "./api";

const RETURN_KEY = "pob_return_to";

type AuthState = {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
  /** Rejects with a readable message when the API is down, so the button can show it. */
  loginWithGithub: (returnTo?: string) => Promise<void>;
  consumeReturnTo: () => string | null;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api.me());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) tokenStore.clear();
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      me,
      loading,
      refresh,
      logout: () => {
        tokenStore.clear();
        setMe(null);
      },
      loginWithGithub: async (returnTo) => {
        // Without this check the browser lands on a "connection refused" page with no hint.
        await api.health();
        try {
          sessionStorage.setItem(RETURN_KEY, returnTo ?? window.location.pathname);
        } catch {
          /* ignore */
        }
        window.location.href = api.githubLoginUrl();
      },
      consumeReturnTo: () => {
        try {
          const v = sessionStorage.getItem(RETURN_KEY);
          sessionStorage.removeItem(RETURN_KEY);
          return v;
        } catch {
          return null;
        }
      },
    }),
    [me, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** Links the connected wallet to the GitHub account by signing a one-time message. */
export function useLinkWallet() {
  const { publicKey, signMessage } = useWallet();
  const { refresh } = useAuth();
  return useCallback(async () => {
    if (!publicKey) throw new Error("Connect a wallet first");
    if (!signMessage) throw new Error("This wallet cannot sign messages");
    const wallet = publicKey.toBase58();
    const { nonce, message } = await api.walletNonce(wallet);
    const signature = await signMessage(new TextEncoder().encode(message));
    await api.linkWallet(wallet, nonce, bs58.encode(signature));
    await refresh();
  }, [publicKey, signMessage, refresh]);
}
