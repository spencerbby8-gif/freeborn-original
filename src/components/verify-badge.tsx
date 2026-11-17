/**
 * Freeborn trust badge — a scalloped seal with a white check, in the blue the
 * reference uses on a verified name. Icon-only: it makes no "Verified" text
 * claim, and the title attribute says what the seal actually means.
 */
export function VerifyBadge({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      title="Trust-verified member"
      aria-label="Trust-verified member"
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 1.6l2.2 1.8 2.8-.5 1.1 2.6 2.6 1.1-.5 2.8L22 12l-1.8 2.2.5 2.8-2.6 1.1-1.1 2.6-2.8-.5L12 22.4l-2.2-1.8-2.8.5-1.1-2.6-2.6-1.1.5-2.8L2 12l1.8-2.2-.5-2.8 2.6-1.1 1.1-2.6 2.8.5L12 1.6z"
          fill="url(#vb-grad)"
        />
        <path
          d="M8.2 12.3l2.5 2.5 5.1-5.6"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="vb-grad" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
            <stop stopColor="#59a9f5" />
            <stop offset="1" stopColor="#2f7ce0" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}
