/**
 * MemberPortrait — abstract, non-representational artwork for sample profile cards.
 *
 * WHY THIS EXISTS
 * ---------------
 * The landing page previously rendered nine photographs of real, identifiable people
 * downloaded from Pexels, presented as named Freeborn members with ages, cities,
 * occupations and attributed health beliefs, under the heading "Real people. Real
 * prompts." and with no disclaimer anywhere on the page.
 *
 * That was two separate problems.
 *
 * Licence. Pexels Terms of Service section 5 prohibits using Content featuring a
 * recognisable person "on or in conjunction with anything... offensive (including
 * but not limited to in relation to adult entertainment venues, escort services,
 * drug use, DATING SERVICES, in a way which portrays someone as suffering from, or
 * medicating for, a physical or mental ailment)... or in a political context (... or
 * in connection with any political party or viewpoint)". Freeborn is a dating
 * service, the subjects were portrayed as holding medical-freedom health beliefs,
 * and three of them were midwives, nutritionists or herbalists. Pexels also does
 * not verify model releases and provides no indemnification, so the individuals
 * depicted had separate personality-rights exposure that Freeborn would carry alone.
 * The same dating-services prohibition appears verbatim in Canva's Free Media
 * License and Picsart's third-party licence, so switching free stock providers
 * would not have cured it.
 *
 * Truth. The people shown were not members. At the time of writing the production
 * database held eight auth users and three accounts. Rendering five invented members
 * with real faces under "Real people" is a representation of fact that was not true,
 * and the page's own trust ledger boasted "No invented match rates. No borrowed
 * press logos" a few sections below the invented people.
 *
 * WHAT THIS DOES INSTEAD
 * ----------------------
 * Renders a deterministic abstract composition in the Freeborn palette. It shows the
 * anatomy of a profile card, the typography, the verified seal and the gradient
 * treatment, which is what a visitor actually needs to see, without depicting any
 * human being. Nothing is loaded from a third party, so it also removes the
 * images.pexels.com dependency and its preconnect from the critical path.
 *
 * The composition is derived from a hash of the seed, so each card looks distinct
 * while remaining stable across renders and between server and client.
 */

const PALETTES = [
  { a: "#4fb8a7", b: "#1f6f63", c: "#d9a752" },
  { a: "#d9a752", b: "#8a5f22", c: "#4fb8a7" },
  { a: "#7c6bd9", b: "#3b3170", c: "#d9a752" },
  { a: "#4fb8a7", b: "#2a4f6f", c: "#c98a6b" },
  { a: "#c98a6b", b: "#6d3f2c", c: "#4fb8a7" },
  { a: "#5f9ea0", b: "#2f4f4f", c: "#d9a752" },
] as const;

/** Stable 32-bit string hash. Not cryptographic, just a seed. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type MemberPortraitProps = {
  /** Any stable string. A name is enough. Drives palette and composition. */
  seed: string;
  /** Accessible name for the artwork. Omit for purely decorative use. */
  label?: string;
  className?: string;
  /**
   * Path to a generated sample portrait under /images/samples. When present it
   * replaces the abstract composition. These are AI-generated illustrative
   * images committed to the repo, so they load same-origin and fall inside the
   * CSP img-src 'self' allowance. They depict no real person and no account is
   * ever created for them; the cards that use them are labelled as design
   * samples. The abstract artwork below stays as the fallback for any seed
   * without a photo.
   */
  photo?: string;
};

export function MemberPortrait({ seed, label, className, photo }: MemberPortraitProps) {
  const h = hash(seed);
  const p = PALETTES[h % PALETTES.length];
  const uid = `mp-${h.toString(36)}`;

  if (photo) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={photo}
        alt={label ? `${label}: illustrative AI-generated sample portrait` : ""}
        loading="lazy"
        decoding="async"
        className={`h-full w-full object-cover ${className ?? ""}`}
      />
    );
  }

  /* Derived geometry, all bounded so the composition never breaks the frame. */
  const cx = 26 + (h % 48);
  const cy = 30 + ((h >> 5) % 34);
  const r = 30 + ((h >> 9) % 22);
  const rot = (h >> 13) % 360;
  const arcSweep = 90 + ((h >> 17) % 140);

  return (
    <svg
      viewBox="0 0 100 113"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0a0d18" />
          <stop offset="55%" stopColor={p.b} stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0a0d18" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor={p.a} stopOpacity="0.5" />
          <stop offset="100%" stopColor={p.a} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-arc`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={p.a} />
          <stop offset="50%" stopColor={p.c} />
          <stop offset="100%" stopColor={p.a} stopOpacity="0.15" />
        </linearGradient>
      </defs>

      <rect width="100" height="113" fill={`url(#${uid}-bg)`} />
      <rect width="100" height="113" fill={`url(#${uid}-glow)`} />

      <g transform={`rotate(${rot} ${cx} ${cy})`} opacity="0.85">
        {/* Two arcs meeting, echoing the Monogram's flame construction. */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r * 0.4} ${cy - r * 0.85}`}
          fill="none"
          stroke={`url(#${uid}-arc)`}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx + r} ${cy + 6} A ${r * 0.82} ${r * 0.82} 0 0 1 ${cx - r * 0.3} ${
            cy + r * 0.9
          }`}
          fill="none"
          stroke={p.c}
          strokeOpacity="0.55"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={r * 0.2} fill={p.a} fillOpacity="0.28" />
      </g>

      {/* Horizon bands: quiet structure, no figure, no silhouette. */}
      <g opacity="0.22" stroke={p.c} strokeWidth="0.5">
        <line x1="0" y1={78 + (h % 6)} x2="100" y2={74 + (h % 6)} />
        <line x1="0" y1={90 + (h % 5)} x2="100" y2={88 + (h % 5)} />
      </g>

      <path
        d={`M ${10 + (h % 20)} 113 Q 50 ${113 - arcSweep / 4} ${90 - (h % 20)} 113 Z`}
        fill={p.b}
        fillOpacity="0.35"
      />
    </svg>
  );
}

/**
 * ScenePanel — abstract landscape artwork for editorial sections.
 *
 * Replaces a Pexels photograph of "a couple laughing and embracing in a sunlit
 * wheat field". The subjects were two identifiable people used as decorative
 * imagery for a dating service, which Pexels Terms of Service section 5 prohibits
 * for Content featuring a recognisable person. The same reasoning as
 * MemberPortrait, applied to a wide-format panel.
 *
 * Renders a golden-hour field: layered horizon bands and a low sun. No figures.
 */
export function ScenePanel({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  const uid = "scene-field";
  return (
    <svg
      viewBox="0 0 120 63"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1830" />
          <stop offset="42%" stopColor="#4a3a4e" />
          <stop offset="68%" stopColor="#a8724a" />
          <stop offset="100%" stopColor="#d9a752" />
        </linearGradient>
        <radialGradient id={`${uid}-sun`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f0d9a8" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#d9a752" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#d9a752" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-field`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f4f45" />
          <stop offset="100%" stopColor="#0a0d18" />
        </linearGradient>
      </defs>

      <rect width="120" height="63" fill={`url(#${uid}-sky)`} />
      <circle cx="74" cy="40" r="21" fill={`url(#${uid}-sun)`} />
      <circle cx="74" cy="40" r="5.2" fill="#f4e2bd" fillOpacity="0.85" />

      {/* Distant treeline, then the field itself. */}
      <path
        d="M0 44 L9 41 L17 43.5 L26 40 L34 43 L45 40.5 L56 43 L67 41 L79 43.5 L90 41 L101 43 L112 40.5 L120 43 L120 63 L0 63 Z"
        fill="#16241f"
        fillOpacity="0.9"
      />
      <path
        d="M0 51 Q30 47.5 60 51 T120 50 L120 63 L0 63 Z"
        fill={`url(#${uid}-field)`}
      />

      {/* Furrow lines converging toward the sun. */}
      <g stroke="#4fb8a7" strokeOpacity="0.16" strokeWidth="0.4">
        <line x1="-6" y1="63" x2="72" y2="50" />
        <line x1="18" y1="63" x2="74" y2="50.4" />
        <line x1="44" y1="63" x2="76" y2="50.8" />
        <line x1="126" y1="63" x2="78" y2="50" />
        <line x1="102" y1="63" x2="76.5" y2="50.4" />
      </g>
    </svg>
  );
}
