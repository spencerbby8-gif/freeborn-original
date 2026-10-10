/**
 * Unvaccinated badge — shown on cards and profiles for members who identify
 * as unvaccinated. A refined leaf mark inside a thin gold ring: natural,
 * protected, quietly proud. Icon-only by default; withLabel adds the wordmark.
 */
export function UnvaxBadge({ size = 20, withLabel = false }: { size?: number; withLabel?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--color-gold-500)]/45 bg-[#161006]/85 backdrop-blur-sm ${
        withLabel ? "px-2.5 py-1" : "p-1.5"
      }`}
      title="Identifies as unvaccinated"
      aria-label="Identifies as unvaccinated"
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10.2" stroke="url(#unvax-ring)" strokeWidth="1.6" />
        <path
          d="M12 6.8c2.6 1.7 3.8 4.2 3.3 7.1-.4 2.4-1.8 4.2-3.3 5.2-1.5-1-2.9-2.8-3.3-5.2-.5-2.9.7-5.4 3.3-7.1z"
          stroke="url(#unvax-ring)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M12 8.4v8.8" stroke="#f6d79a" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M12 11.4l1.7-1.5M12 14.4l-1.7-1.5" stroke="#f6d79a" strokeWidth="1.1" strokeLinecap="round" />
        <defs>
          <linearGradient id="unvax-ring" x1="5" y1="4" x2="19" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f6d79a" />
            <stop offset="1" stopColor="#d9a752" />
          </linearGradient>
        </defs>
      </svg>
      {withLabel ? (
        <span className="text-[10.5px] font-black uppercase tracking-[0.14em] text-[var(--color-gold-300)]">
          Unvaccinated
        </span>
      ) : null}
    </span>
  );
}
