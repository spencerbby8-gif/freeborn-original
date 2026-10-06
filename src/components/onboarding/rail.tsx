import { STEP_META, STEP_ORDER } from "@/lib/onboarding-data";

/**
 * The 12-node progress rail: filled ember→gold nodes for completed steps,
 * a glowing gold node for the current step, quiet nodes for what's next.
 */
export function ProgressRail({ stepIndex }: { stepIndex: number }) {
  return (
    <div
      className="mb-7 flex items-center justify-start overflow-x-auto px-1 pb-1 sm:justify-center"
      aria-label={`Onboarding progress: step ${stepIndex + 1} of ${STEP_ORDER.length}`}
    >
      {STEP_ORDER.map((step, i) => {
        const done = i < stepIndex;
        const active = i === stepIndex;
        return (
          <span key={step} className="flex items-center">
            {i > 0 ? (
              <span
                className={`h-[2px] w-3 rounded-full transition-colors duration-500 sm:w-4 ${
                  i <= stepIndex ? "bg-[var(--color-gold-500)]" : "bg-white/10"
                }`}
              />
            ) : null}
            <span
              title={STEP_META[i].label}
              className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border text-[10px] font-black transition-all duration-500 ${
                done
                  ? "border-transparent bg-[var(--gradient-ember-warm)] text-white shadow-[0_0_10px_rgba(239,94,94,0.35)]"
                  : active
                    ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/15 text-[var(--color-gold-300)] shadow-[0_0_0_4px_rgba(217,167,82,0.12),0_0_14px_rgba(217,167,82,0.35)]"
                    : "border-white/15 bg-white/[0.03] text-[var(--color-ash)]"
              }`}
            >
              {done ? (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M2.2 6.4l2.4 2.4 5.2-5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}
