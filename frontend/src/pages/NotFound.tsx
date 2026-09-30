import { LinkButton } from "../components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-display text-7xl font-semibold tracking-tight text-ink">404</p>
      <p className="text-muted">This page was never built.</p>
      <LinkButton to="/">Home</LinkButton>
    </div>
  );
}
