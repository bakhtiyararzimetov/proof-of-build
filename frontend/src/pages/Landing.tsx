import { Link } from "react-router-dom";
import { ArrowRight, Award, Coins, Flame, GraduationCap, Github, ShieldCheck } from "lucide-react";
import { LinkButton } from "../components/ui";
import { GlassCube } from "../components/Art";
import { SolanaMark } from "../components/Layout";
import { LogoMark } from "../components/Logo";
import { InstallApp } from "../components/InstallApp";

const features = [
  { icon: Flame, title: "Track Progress", body: "Daily commits confirm your work.", to: "/hackathons" },
  { icon: ShieldCheck, title: "Protect Prizes", body: "Smart contracts keep funds safe and fair.", to: "/create" },
  { icon: GraduationCap, title: "Get Certificates", body: "Official proof of participation.", to: "/verify" },
];

const steps = [
  { icon: Coins, title: "Organizer locks the prize", body: "USDC goes into a program-owned vault before the hackathon starts." },
  { icon: Github, title: "Teams join and connect GitHub", body: "Optional deposit. The GitHub App watches the team repository." },
  { icon: Flame, title: "Commit every day", body: "Each day with your own verified push becomes a fire on Solana. Tricks get flagged." },
  { icon: Award, title: "Claim", body: "Reach the goal: your deposit comes back. Winners split the prize among those who did the work." },
];

export default function Landing() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      <section className="studio relative overflow-hidden rounded-3xl border border-line">
        <div className="grid items-center gap-6 px-6 pt-12 pb-8 sm:px-12 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div className="rise">
            <h1 className="text-6xl leading-[0.95] font-semibold tracking-tight sm:text-7xl lg:text-[88px]">
              Proof
              <br />
              of Build
            </h1>
            <p className="mt-7 text-xl font-medium sm:text-2xl">Real work. Verified. Onchain.</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
              Transparent hackathons powered by Solana. Build, prove, earn.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to="/hackathons" size="lg">
                Join Hackathon <ArrowRight className="size-4" />
              </LinkButton>
              <LinkButton to="/create" size="lg" variant="outline">
                Create Hackathon
              </LinkButton>
            </div>
            <InstallApp className="mt-4 md:hidden" />
          </div>
          <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
            <GlassCube className="float w-full drop-shadow-[0_40px_60px_rgba(0,0,0,0.25)]" />
          </div>
        </div>

        <div id="about" className="grid gap-4 px-6 pb-6 sm:px-12 md:grid-cols-3">
          {features.map(({ icon: Icon, title, body, to }, i) => (
            <Link
              key={title}
              to={to}
              className="card card-hover rise group flex flex-col p-6"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="brand-soft grid size-11 place-items-center rounded-xl">
                <Icon className="icon-grad size-6" />
              </div>
              <p className="mt-6 font-semibold">{title}</p>
              <div className="mt-1.5 flex items-end justify-between gap-4">
                <p className="text-sm text-muted">{body}</p>
                <ArrowRight className="size-4 shrink-0 transition group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-black/5 px-6 py-4 text-xs text-muted sm:px-12">
          <span className="flex items-center gap-2">
            <SolanaMark className="size-4" /> Powered by Solana
          </span>
          <span className="flex items-center gap-2">
            Build <ArrowRight className="size-3" /> Prove <ArrowRight className="size-3" /> Earn
          </span>
        </div>
      </section>

      <section className="mt-20">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-4">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="card relative p-6">
              <span className="absolute top-5 right-6 text-3xl font-semibold text-zinc-200">0{i + 1}</span>
              <div className="brand-grad grid size-10 place-items-center rounded-full text-white">
                <Icon className="size-5" />
              </div>
              <p className="mt-5 font-semibold">{title}</p>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative mt-16 overflow-hidden rounded-3xl bg-[#07070a] px-8 py-14 text-white sm:px-14">
        <div className="pointer-events-none absolute -right-24 -bottom-32 size-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(255,45,139,0.55),rgba(123,61,255,0.35)_55%,transparent)] blur-2xl" />
        <div className="pointer-events-none absolute top-1/2 -right-10 h-40 w-[640px] -translate-y-1/2 rotate-[-18deg] rounded-full bg-[linear-gradient(90deg,transparent,rgba(123,61,255,0.7),rgba(255,45,139,0.8),transparent)] blur-xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div>
            <LogoMark light className="size-12" />
            <p className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Proof of Build</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-white/70">
              Build <ArrowRight className="size-3" /> Prove <ArrowRight className="size-3" /> Earn
            </p>
          </div>
          <LinkButton to="/hackathons" size="lg" variant="outline">
            Start Building <ArrowRight className="size-4" />
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
