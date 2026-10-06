import { useId } from "react";

export type WordmarkSize = "sm" | "md" | "lg";

/**
 * Freeborn Monogram — "The Flame" (elevated)
 *
 * An abstract F-shape carved by two ember arcs meeting at a golden center,
 * set on a midnight plate with an ember → gold → violet gradient ring.
 * Ancient like a seal, modern like a spark. Pure SVG, crisp at any size.
 */
export function Monogram({ size = 42 }: { size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ember = `fb-ember-${uid}`;
  const plate = `fb-plate-${uid}`;
  const sheen = `fb-sheen-${uid}`;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Ambient glow behind the seal */}
      <div
        className="pulse-glow absolute inset-0 rounded-[32%]"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, rgba(239,94,94,0.42) 0%, rgba(217,167,82,0.22) 45%, transparent 70%)",
          filter: "blur(8px)",
        }}
      />
      <svg
        viewBox="0 0 40 40"
        width={size}
        height={size}
        className="relative drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
      >
        <defs>
          <linearGradient id={ember} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ef5e5e" />
            <stop offset="55%" stopColor="#d9a752" />
            <stop offset="100%" stopColor="#8a6ef2" />
          </linearGradient>
          <linearGradient id={plate} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1f2744" />
            <stop offset="100%" stopColor="#0a0d18" />
          </linearGradient>
          <radialGradient id={sheen} cx="0.3" cy="0.22" r="0.9">
            <stop offset="0%" stopColor="rgba(255,255,255,0.20)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.04)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        {/* Rounded square plate */}
        <rect x="1" y="1" width="38" height="38" rx="12" ry="12" fill={`url(#${plate})`} stroke={`url(#${ember})`} strokeWidth="1.5" />
        {/* Inner sheen + hairline ring for depth */}
        <rect x="1" y="1" width="38" height="38" rx="12" ry="12" fill={`url(#${sheen})`} />
        <rect x="4" y="4" width="32" height="32" rx="9.5" ry="9.5" fill="none" stroke="rgba(246,215,154,0.16)" strokeWidth="0.75" />

        {/* The flame / F glyph */}
        <g stroke={`url(#${ember})`} strokeWidth="2.5" strokeLinecap="round" fill="none">
          {/* Left ember arc */}
          <path d="M14 28 C 14 18, 18 12, 24 10" />
          {/* Right ember arc */}
          <path d="M26 28 C 26 20, 23 16, 20 13" />
          {/* Ember spark */}
          <circle cx="20" cy="11" r="1.8" fill="#f6d79a" stroke="none" />
        </g>
        {/* Hearth line grounding the flame */}
        <path d="M13 31.5h14" stroke={`url(#${ember})`} strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
      </svg>
    </div>
  );
}

const dims: Record<WordmarkSize, { logo: number; name: string; tag: string }> = {
  sm: { logo: 32, name: "text-[18px]", tag: "text-[7px]" },
  md: { logo: 42, name: "text-[22px]", tag: "text-[8px]" },
  lg: { logo: 64, name: "text-[32px] leading-none", tag: "text-[9px]" },
};

export function Wordmark({
  muted = false,
  size = "md",
  mono = false,
}: {
  muted?: boolean;
  size?: WordmarkSize;
  mono?: boolean;
}) {
  const d = dims[size];

  return (
    <div className="flex select-none items-center gap-3.5">
      <Monogram size={d.logo} />
      <div className="leading-tight">
        <div
          className={`${d.name} font-semibold tracking-tighter ${
            mono ? "uppercase tracking-[0.18em]" : ""
          } ${muted ? "text-[var(--color-pearl)]/80" : "text-[var(--color-pearl)]"}`}
          style={{ fontFamily: "var(--font-display-stack)" }}
        >
          {mono ? "FREEBORN" : "Freeborn"}
        </div>
        <div
          className={`mt-1 uppercase font-black tracking-[0.3em] ${d.tag} ${
            muted ? "text-[var(--color-ash)]" : "text-[var(--color-sand)]"
          }`}
        >
          Date like you mean it.
        </div>
      </div>
    </div>
  );
}
