/** Decorative monochrome "chrome & glass" artwork, drawn in SVG (no image assets). */

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Chrome abstract cover; the variant and composition are deterministic per id. */
export function CoverArt({ seed, className = "", dark }: { seed: string; className?: string; dark?: boolean }) {
  const r = rng(seed);
  const variant = Math.floor(r() * 3);
  const id = `c${seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`;
  const rot = Math.round(r() * 60 - 30);
  const bgDark = dark ?? r() > 0.35;
  const bg = bgDark ? ["#1c1c1e", "#050505"] : ["#f2f2f3", "#cfcfd4"];

  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bg[0]} />
          <stop offset="100%" stopColor={bg[1]} />
        </linearGradient>
        <linearGradient id={`${id}-chrome`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="28%" stopColor="#8e8e93" />
          <stop offset="46%" stopColor="#f5f5f7" />
          <stop offset="70%" stopColor="#3a3a3c" />
          <stop offset="100%" stopColor="#d1d1d6" />
        </linearGradient>
        <radialGradient id={`${id}-sphere`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#c7c7cc" />
          <stop offset="75%" stopColor="#48484a" />
          <stop offset="100%" stopColor="#1c1c1e" />
        </radialGradient>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-bg)`} />
      {variant === 0 && (
        <g transform={`rotate(${rot} 160 100)`}>
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M -40 ${150 - i * 26} C 70 ${40 - i * 20}, 190 ${220 - i * 18}, 380 ${70 - i * 22}`}
              fill="none"
              stroke={`url(#${id}-chrome)`}
              strokeWidth={34 - i * 8}
              strokeLinecap="round"
              opacity={1 - i * 0.2}
            />
          ))}
        </g>
      )}
      {variant === 1 && (
        <>
          <ellipse cx="170" cy="178" rx="70" ry="10" fill="#000" opacity={bgDark ? 0.5 : 0.18} filter={`url(#${id}-soft)`} />
          <circle cx="165" cy="98" r={62 + r() * 10} fill={`url(#${id}-sphere)`} />
          <ellipse cx="140" cy="70" rx="18" ry="10" fill="#fff" opacity="0.7" filter={`url(#${id}-soft)`} />
        </>
      )}
      {variant === 2 && (
        <g transform={`rotate(${rot} 160 100)`}>
          <path
            d="M 60 170 C 20 60, 160 10, 220 60 S 300 190, 190 170 S 110 90, 170 80"
            fill="none"
            stroke={`url(#${id}-chrome)`}
            strokeWidth="22"
            strokeLinecap="round"
          />
          <path
            d="M 60 170 C 20 60, 160 10, 220 60 S 300 190, 190 170"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            opacity="0.6"
            filter={`url(#${id}-soft)`}
          />
        </g>
      )}
    </svg>
  );
}

/** Hero: a tall frosted-glass cube with chrome edges. */
/** Hero: a real 3D glass/chrome cube (CSS 3D) that slowly spins. Styles in index.css (.cube3d-*). */
export function GlassCube({ className = "" }: { className?: string }) {
  const faces = ["front light", "right dark", "back light", "left dark", "top", "bottom"];
  return (
    <div className={`cube3d-scene ${className}`} aria-hidden>
      <div className="cube3d-float">
        <div className="cube3d">
          {faces.map((f) => (
            <div key={f} className={`cube3d-face ${f}`} />
          ))}
        </div>
      </div>
      <div className="cube3d-shadow" />
    </div>
  );
}
