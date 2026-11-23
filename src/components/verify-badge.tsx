/**
 * Freeborn trust badge — exact blue seal and white check from the
 * owner-supplied prototype. Presentation only; verification gates are unchanged.
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
          fill="#3b9df2"
          d="M12 1.8l2.6 2.5 3.6-.4 1.5 3.3 3.2 1.7-1.4 3.4 1.4 3.4-3.2 1.7-1.5 3.3-3.6-.4L12 22.2l-2.6-2.5-3.6.4-1.5-3.3-3.2-1.7 1.4-3.4-1.4-3.4 3.2-1.7 1.5-3.3 3.6.4L12 1.8z"
        />
        <path
          fill="#fff"
          d="M10.6 15.6l-3-3 1.5-1.5 1.5 1.5 4.3-4.3 1.5 1.5-5.8 5.8z"
        />
      </svg>
    </span>
  );
}
