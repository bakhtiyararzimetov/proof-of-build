import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { AppShell } from "../components/Layout";
import { useAuth } from "../lib/auth";
import { AccountSetup } from "../components/AccountSetup";
import { Card, SectionTitle } from "../components/ui";

export default function Account() {
  const { me } = useAuth();
  return (
    <AppShell>
      <div className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
      <p className="mt-2 text-sm text-muted">Connect GitHub and a Solana wallet to take part.</p>
      <div className="mt-8">
        <AccountSetup returnTo="/account" />
      </div>
      {me && (
        <Card className="mt-6 p-6">
          <SectionTitle>Your hackathons</SectionTitle>
          {me.participations.length === 0 && me.organized.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing yet. <Link to="/hackathons" className="text-ink hover:underline">Find a hackathon</Link>.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {me.participations.map((p) => (
                <li key={p.participant} className="flex items-center justify-between py-2.5">
                  <span>{p.hackathon.title} · <span className="text-muted">{p.team.name}</span></span>
                  <Link to={`/dashboard?p=${p.participant}`} className="text-xs text-ink hover:underline">Dashboard</Link>
                </li>
              ))}
              {me.organized.map((h) => (
                <li key={h.id} className="flex items-center justify-between py-2.5">
                  <span>{h.title} · <span className="text-muted">organizer</span></span>
                  <Link to={`/hackathons/${h.id}/admin`} className="text-xs text-ink hover:underline">Admin</Link>
                </li>
              ))}
            </ul>
          )}
          {!me.hasEmail && (
            <p className="mt-4 flex items-center gap-2 text-xs text-warn">
              <Mail className="size-4" /> Your GitHub account has no public or verified email: certificates will not be emailed.
            </p>
          )}
        </Card>
      )}
    </div>
    </AppShell>
  );
}
