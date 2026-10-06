import { Reveal } from "@/components/reveal";

/**
 * "Why Freeborn" — a direct, honest answer to the failures users report on
 * other unvaccinated-focused dating apps (Unjected, Unjabbed, etc.).
 * Every claim below is a feature Freeborn actually ships — no invented metrics.
 */
const failures = [
  {
    problem: "Fake profiles & romance scams run rampant",
    fix: "Photo verification with a visible trust badge, and profiles that show real detail — so you can tell a real person from a script.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3l7.5 3v5.2c0 4.8-3.2 8.1-7.5 9.8-4.3-1.7-7.5-5-7.5-9.8V6L12 3z" />
        <path d="M9 11.8l2.1 2.1L15.4 9" />
      </svg>
    ),
  },
  {
    problem: "Filters that don't work — wrong age, wrong distance, wrong gender",
    fix: "Filters that actually filter: age, distance, gender, vaccination stance, religion, kids, drinking, smoking, and language.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
    ),
  },
  {
    problem: "People you passed keep showing back up",
    fix: "Pass is final. When you pass someone, they stay passed — no recycling, no re-showing.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 12a9 9 0 109-9" />
        <path d="M3 4v5h5" />
        <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
      </svg>
    ),
  },
  {
    problem: "Paywalls after a few likes — pay to do anything",
    fix: "Free to match, chat, send photos and voice notes. No paywall hiding the basics.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="6" width="18" height="13" rx="2.5" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </svg>
    ),
  },
  {
    problem: "No way to edit your profile once it's made",
    fix: "Full profile editing anytime — bio, photos, values, lifestyle, and every detail.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    problem: "Fear the app is tracking or exposing your status",
    fix: "Your vaccination stance is shown only as a badge you control. Your email, birth date, and exact location are never public.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
        <path d="M8 10.5V8a4 4 0 018 0v2.5" />
      </svg>
    ),
  },
  {
    problem: "Notifications say you were liked but you can't see who",
    fix: "Real notifications that show who liked you, so you can actually act on them.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M18 8.4a6 6 0 10-12 0c0 6.6-2.7 8.4-2.7 8.4h17.4S18 15 18 8.4z" />
        <path d="M13.7 20a2 2 0 01-3.4 0" />
      </svg>
    ),
  },
  {
    problem: "Invasive biometric verification that collects your data",
    fix: "Optional photo verification that stays private. No face-scanning, no biometric harvesting.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <circle cx="12" cy="12" r="3.4" />
      </svg>
    ),
  },
];

export function WhyFreeborn() {
  return (
    <section id="why-freeborn" className="relative border-t hairline bg-gradient-to-b from-night via-midnight/25 to-night">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Why Freeborn</p>
          <h2 className="mt-5 font-display text-[clamp(2rem,4.2vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-pearl">
            Built on what the other apps{" "}
            <em className="font-medium italic text-gold-soft">got wrong.</em>
          </h2>
          <p className="mt-6 text-[16px] leading-[1.8] text-mist">
            We read the reviews of the other unvaccinated-focused apps. The scams, the broken
            filters, the paywalls, the dead profiles. Freeborn is built to fix every one of them —
            and we only promise what we actually ship.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {failures.map((f, i) => (
            <Reveal key={f.problem} delay={(i % 2) * 80}>
              <div className="h-full rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-6 transition-colors duration-300 hover:border-white/[0.15]">
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-ember-500)]/12 text-[var(--color-ember-300)]">
                    {f.icon}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold italic leading-5 text-[var(--color-ash)]">
                      {f.problem}
                    </p>
                    <p className="mt-2.5 text-[15px] font-medium leading-[1.65] text-[var(--color-ivory)]">
                      {f.fix}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={140}>
          <div className="mt-14 text-center">
            <a
              href="/auth?mode=sign-up"
              className="btn-ember btn-shine relative inline-flex overflow-hidden rounded-full px-9 py-4 text-[16px] font-bold"
            >
              Join Freeborn free
            </a>
            <p className="mt-4 text-[12px] text-[var(--color-ash)]">
              No paywall. No fake profiles. No recycled matches.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
