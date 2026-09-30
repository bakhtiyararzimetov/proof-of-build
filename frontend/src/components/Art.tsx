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
export function GlassCube({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 460" className={className} aria-hidden>
      <defs>
        <linearGradient id="gc-left" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#d9d9de" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#9a9aa0" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="gc-right" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2c2c2e" />
          <stop offset="45%" stopColor="#0a0a0a" />
          <stop offset="75%" stopColor="#5a5a5e" />
          <stop offset="100%" stopColor="#1c1c1e" />
        </linearGradient>
        <linearGradient id="gc-top" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c9c9ce" />
        </linearGradient>
        <linearGradient id="gc-refr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="gc-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <filter id="gc-blur">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      <ellipse cx="215" cy="420" rx="170" ry="26" fill="url(#gc-shadow)" />

      {/* faces of a cube standing on a corner */}
      <path d="M 215 40 L 360 115 L 360 330 L 215 405 Z" fill="url(#gc-right)" />
      <path d="M 215 40 L 70 115 L 70 330 L 215 405 Z" fill="url(#gc-left)" />
      <path d="M 215 40 L 360 115 L 215 190 L 70 115 Z" fill="url(#gc-top)" opacity="0.9" />

      {/* inner glass structure */}
      <path d="M 215 190 L 215 405" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1.5" />
      <path d="M 70 115 L 215 190 L 360 115" fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.5" />
      <path d="M 110 150 L 110 350" stroke="url(#gc-refr)" strokeWidth="10" filter="url(#gc-blur)" />
      <path d="M 300 160 L 300 360" stroke="url(#gc-refr)" strokeWidth="6" opacity="0.5" filter="url(#gc-blur)" />
      <path d="M 250 90 L 330 130" stroke="#fff" strokeWidth="3" opacity="0.7" filter="url(#gc-blur)" />

      {/* chrome edges */}
      <path
        d="M 215 40 L 360 115 L 360 330 L 215 405 L 70 330 L 70 115 Z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
