import { Link } from "react-router-dom";

/** Wireframe cube mark. */
export function LogoMark({ className = "size-7", light }: { className?: string; light?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke={light ? "#ffffff" : "#0a0a0a"}
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 3 28 10v12L16 29 4 22V10z" />
      <path d="M16 3v26M4 10l24 12M28 10 4 22" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">Proof of Build</span>
    </Link>
  );
}
