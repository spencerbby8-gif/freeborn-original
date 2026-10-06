import { Reveal } from "@/components/reveal";
import { Monogram } from "@/components/wordmark";
import { ArrowIcon } from "@/components/icons";

const promises = [
  "Full profiles — values, intentions, and lifestyle on the first screen",
  "Privacy by default: emails and birth dates never shown publicly",
  "Finite discovery designed for deciding with context, not reacting to a stack",
];

export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t hairline">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-64 left-1/2 h-[640px] w-[1000px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(239,94,94,0.16), rgba(217,167,82,0.07) 55%, transparent 75%)",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-5 py-28 sm:px-8 lg:py-36">
        <Reveal>
          <div className="surface magic-border relative overflow-hidden rounded-[48px] p-10 text-center shadow-[var(--shadow-card-lg)] sm:p-16">
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full opacity-60 blur-[90px]"
              style={{ background: "radial-gradient(circle, rgba(217,167,82,0.22), transparent 70%)" }}
            />
            <div
              className="pointer-events-none absolute -bottom-24 -left-20 h-80 w-80 rounded-full opacity-50 blur-[90px]"
              style={{ background: "radial-gradient(circle, rgba(239,94,94,0.2), transparent 70%)" }}
            />

            <div className="relative mx-auto flex max-w-2xl flex-col items-center">
              <Monogram size={64} />
              <div className="mt-8 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--color-sand)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ember-500)] shadow-[0_0_10px_rgba(239,94,94,0.6)]" />
                Free to join · Built for the long term
              </div>
              <h2
                className="mt-7 text-balance text-center text-[clamp(2.2rem,5vw,3.9rem)] leading-[1.04] tracking-tight text-[var(--color-pearl)]"
                style={{ fontFamily: "var(--font-display-stack)" }}
              >
                Your people are already{" "}
                <span className="text-ember">patient.</span> Go meet them.
              </h2>
              <p className="mt-6 max-w-xl text-center text-[16px] leading-[1.8] text-[var(--color-mist)]">
                Create your Freeborn account and step into a room where health
                autonomy is respected, intentions are stated up front, and every
                profile is a person — not a card in a stack.
              </p>

              <ul className="mt-9 w-full max-w-md space-y-3 text-left">
                {promises.map((promise) => (
                  <li
                    key={promise}
                    className="flex items-start gap-3 text-[14px] leading-relaxed text-[var(--color-sand)]"
                  >
                    <svg className="mt-1 shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <circle cx="7" cy="7" r="6.4" stroke="#d9a752" strokeWidth="1" />
                      <path d="M4.4 7.2l1.8 1.8 3.4-3.9" stroke="#d9a752" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {promise}
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
                <a
                  href="/auth?mode=sign-up"
                  className="btn-ember btn-shine group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full px-9 py-4 text-[16px] font-bold"
                >
                  Create your profile
                  <ArrowIcon size={17} className="transition-transform group-hover:translate-x-0.5" />
                </a>
                <a
                  href="/discover"
                  className="btn-ghost inline-flex items-center gap-2 rounded-full px-7 py-4 text-[15px] font-bold"
                >
                  Preview the discovery room
                </a>
              </div>
              <p className="mt-7 text-[12px] tracking-wide text-[var(--color-ash)]">
                No invented metrics. No pressure. Just dating like you mean it.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
