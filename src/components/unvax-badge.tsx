/**
 * Unvaccinated badge — shown top-right of a card / profile for members who
 * identify as unvaccinated. A shield with a leaf: protected, natural, free.
 */
export function UnvaxBadge({ size = 20, withLabel = false }: { size?: number; withLabel?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--color-gold-500)]/45 bg-[#1a1408]/80 backdrop-blur-sm ${
        withLabel ? "px-2.5 py-1" : "p-1.5"
      }`}
      title="Identifies as unvaccinated"
      aria-label="Identifies as unvaccinated"
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 2.5l7 2.8v5c0 4.6-3 8-7 9.8-4-1.8-7-5.2-7-9.8v-5l7-2.8z"
          fill="url(#unvax-g)"
          opacity="0.95"
        />
        <path
          d="M12 7.5c1.8 1.2 2.6 3 2.3 5-.3 1.8-1.3 3-2.3 3.8-1-.8-2-2-2.3-3.8-.3-2 .5-3.8 2.3-5z"
          fill="#0a0d18"
          opacity="0.85"
        />
        <path d="M12 8v8.5" stroke="#f6d79a" strokeWidth="1.1" strokeLinecap="round" />
        <defs>
          <linearGradient id="unvax-g" x1="5" y1="3" x2="19" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f6d79a" />
            <stop offset="1" stopColor="#d9a752" />
          </linearGradient>
        </defs>
      </svg>
      {withLabel ? (
        <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-gold-300)]">
          Unvaccinated
        </span>
      ) : null}
    </span>
  );
}
