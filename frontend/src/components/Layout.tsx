import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { FileBadge2, Github, Home, LayoutDashboard, LogOut, Menu, Trophy, X } from "lucide-react";
import { WalletButton } from "./WalletButton";
import { useAuth } from "../lib/auth";
import { errMessage } from "../lib/format";
import { useToast } from "./Toast";
import { Logo, LogoMark } from "./Logo";
import { BrandDefs } from "./ui";
import { InstallApp } from "./InstallApp";

const navLink = ({ isActive }: { isActive: boolean }) =>
  `text-[13px] transition ${isActive ? "text-ink font-medium" : "text-muted hover:text-ink"}`;

function UserChip() {
  const { me, loading, loginWithGithub, logout } = useAuth();
  const toast = useToast();
  if (loading) return null;
  if (!me) {
    return (
      <button
        onClick={() => loginWithGithub().catch((e) => toast.error("Sign-in is unavailable", errMessage(e)))}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-white px-4 text-[13px] font-semibold transition hover:border-ink/40"
      >
        <Github className="size-4" /> Sign in
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Link to="/account" title={`@${me.githubLogin}`} className="rounded-full ring-2 ring-white transition hover:ring-zinc-200">
        <img src={`https://github.com/${me.githubLogin}.png?size=64`} alt={me.githubLogin} className="size-9 rounded-full" />
      </Link>
      <button onClick={logout} className="grid size-9 place-items-center rounded-full text-muted hover:bg-black/5 hover:text-ink" aria-label="Sign out">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { me } = useAuth();
  const links = (
    <>
      <NavLink to="/hackathons" className={navLink} onClick={() => setOpen(false)}>
        Hackathons
      </NavLink>
      {me && (
        <NavLink to="/dashboard" className={navLink} onClick={() => setOpen(false)}>
          Dashboard
        </NavLink>
      )}
      <NavLink to="/create" className={navLink} onClick={() => setOpen(false)}>
        Organize
      </NavLink>
      <NavLink to="/verify" className={navLink} onClick={() => setOpen(false)}>
        Verify
      </NavLink>
      <a href="/#about" className="text-[13px] text-muted transition hover:text-ink" onClick={() => setOpen(false)}>
        About
      </a>
    </>
  );
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">{links}</nav>
        <div className="hidden items-center gap-2 md:flex">
          <WalletButton />
          <UserChip />
        </div>
        <button className="md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-4 border-t border-line bg-white px-4 py-5 md:hidden">
          {links}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <WalletButton />
            <UserChip />
          </div>
          <InstallApp className="self-start" />
        </div>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-10 sm:px-6 md:flex-row">
        <div className="flex items-center gap-3">
          <LogoMark className="size-8" />
          <span className="text-base font-semibold">Proof of Build</span>
        </div>
        <p className="text-sm font-medium">Build it. Prove it. Earn it.</p>
        <p className="text-xs text-muted">Transparent hackathons · GitHub · Solana</p>
      </div>
    </footer>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <BrandDefs />
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

const shellLink = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition ${
    isActive ? "bg-zinc-100 font-medium text-ink" : "text-muted hover:bg-zinc-50 hover:text-ink"
  }`;

/** Global app navigation in a left column (list, create, account, verify pages). */
export function AppShell({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[210px_1fr]">
      <aside className="hidden min-w-0 lg:block">
        <nav className="sticky top-24 flex flex-col gap-1">
          <NavLink to="/" end className={shellLink}>
            <Home className="size-4" /> Home
          </NavLink>
          <NavLink to="/hackathons" className={shellLink}>
            <Trophy className="size-4" /> Hackathons
          </NavLink>
          {me && (
            <NavLink to="/dashboard" className={shellLink}>
              <LayoutDashboard className="size-4" /> Dashboard
            </NavLink>
          )}
          <NavLink to="/verify" className={shellLink}>
            <FileBadge2 className="size-4" /> Certificates
          </NavLink>
          <div className="mt-10 flex items-center gap-2.5 rounded-xl px-3 text-xs text-muted">
            <SolanaMark />
            <span>
              Build the future
              <br />
              with Solana
            </span>
          </div>
        </nav>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}

export function SolanaMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M5 16.5h13l-2.5 2.5H2.5z M5 5h13l-2.5 2.5H2.5z" fill="url(#pob-grad)" />
      <path d="M2.5 10.75h13l2.5 2.5H5z" fill="url(#pob-grad)" opacity="0.7" />
    </svg>
  );
}
