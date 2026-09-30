import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { tokenStore } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ErrorBox, Spinner } from "../components/ui";

export default function AuthCallback() {
  const { refresh, consumeReturnTo } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) {
      setError("GitHub sign-in did not return a token. Try again.");
      return;
    }
    tokenStore.set(token);
    window.history.replaceState(null, "", window.location.pathname);
    void refresh().then(() => navigate(consumeReturnTo() ?? "/account", { replace: true }));
  }, [refresh, navigate, consumeReturnTo]);

  return <div className="mx-auto max-w-md px-4 py-20">{error ? <ErrorBox message={error} /> : <Spinner label="Signing you in…" />}</div>;
}
