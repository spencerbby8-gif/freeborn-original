import "./freeborn-loader.css";

/** A short ember-to-spark signature, never an artificial minimum wait.
 * The accessible label stays silent visually; reduced motion is static. */
export function FreebornLoader({ fullScreen = false, compact = false, label = "Please wait" }: { fullScreen?: boolean; compact?: boolean; label?: string }) {
  return <div className={`freeborn-loader${fullScreen ? " freeborn-loader--screen" : ""}${compact ? " freeborn-loader--compact" : ""}`} role="status" aria-label={label}>
    <svg className="freeborn-ignition" viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path className="ignition-orbit" d="M15 48a27 27 0 0 1 45-27M65 32a27 27 0 0 1-45 27" stroke="#e9c37c" strokeWidth="1.5" strokeLinecap="round"/>
      <path className="ignition-flame" d="M41 15c3 12 14 17 14 30a15 15 0 0 1-30 0c0-8 5-14 9-18-1 8 2 11 4 12 5-7 5-15 3-24Z" fill="#e9a97b"/>
      <path className="ignition-core" d="M41 38c0 7 6 9 6 15a7 7 0 0 1-14 0c0-5 5-8 8-15Z" fill="#f4efe7"/>
      <path className="ignition-spark" d="m63 12 1.5 4.5L69 18l-4.5 1.5L63 24l-1.5-4.5L57 18l4.5-1.5Z" fill="#e9c37c"/>
    </svg>
  </div>;
}
