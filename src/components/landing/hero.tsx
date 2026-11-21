/* ============================================================================
   Landing hero — rebuilt to the approved comp. The hero is one full-bleed
   scene: a couple in love on a mountain ridge above the clouds at golden hour
   (AI-generated; no real persons). Copy follows the comp verbatim: the
   gradient headline, the subline, and the three gold feature rows. No member
   cards or app mocks ship in the hero — the scene carries the mood, the
   product story lives below the fold.
   ========================================================================== */

const GRAD_HEADLINE =
  "linear-gradient(100deg,#e89a68 0%,#f0bd8d 28%,#f9ead0 55%,#e0ac74 80%,#c98a5a 100%)";

const FEATURES = [
  {
    title: "Intent-based Matching",
    sub: "We focus on what truly matters to you.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#e9c37c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[21px] w-[21px]" aria-hidden>
        <circle cx="12" cy="8" r="3.5" /><path d="M6.3 19.6a5.7 5.7 0 0 1 11.4 0" />
      </svg>
    ),
  },
  {
    title: "Privacy First",
    sub: "Your data stays private and secure.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#e9c37c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[21px] w-[21px]" aria-hidden>
        <path d="M12 3l7 2.8v5.4c0 4.6-3 8.4-7 9.8-4-1.4-7-5.2-7-9.8V5.8L12 3z" /><path d="M9.8 12l1.7 1.7 3.2-3.2" />
      </svg>
    ),
  },
  {
    title: "Better Conversations",
    sub: "AI-powered icebreakers that feel natural.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#e9c37c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[21px] w-[21px]" aria-hidden>
        <path d="M8 10h8M8 13.5h5" /><path d="M21 12c0 4-4 7-9 7a9.6 9.6 0 0 1-4-.8L3 20l1.6-4.2A7.4 7.4 0 0 1 3 12c0-4 4-7 9-7s9 3 9 7z" />
      </svg>
    ),
  },
] as const;

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* full-bleed scene — decorative; the copy carries the meaning */}
      <img
        src="/images/couples-hero.jpg"
        alt="A couple in love on a mountain ridge above a sea of clouds at golden hour — illustrative scene, AI-generated"
        className="absolute inset-0 h-full w-full object-cover object-[73%_12%] lg:object-[62%_22%]"
      />
      {/* legibility gradients: strong left-to-right falloff, bottom vignette for the fold */}
      <div
        aria-hidden
        className="absolute inset-0 hidden sm:block"
        style={{
          background:
            "linear-gradient(88deg, rgba(6,8,16,0.94) 0%, rgba(6,8,16,0.82) 26%, rgba(6,8,16,0.5) 52%, rgba(6,8,16,0.08) 76%, rgba(6,8,16,0) 100%), linear-gradient(0deg, rgba(6,8,16,0.72) 0%, rgba(6,8,16,0) 34%), linear-gradient(180deg, rgba(6,8,16,0.6) 0%, rgba(6,8,16,0) 22%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 sm:hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(6,8,16,0.6) 0%, rgba(6,8,16,0.42) 24%, rgba(6,8,16,0.68) 50%, rgba(6,8,16,0.93) 78%, rgba(6,8,16,0.97) 100%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col justify-end px-5 pb-12 pt-28 sm:justify-center sm:px-8 sm:pb-16 sm:pt-24">
        <div className="max-w-xl">
          <h1 className="mt-4 font-display text-[clamp(2.75rem,7vw,4.6rem)] font-medium leading-[1.0] tracking-[-0.02em] [filter:drop-shadow(0_2px_18px_rgba(0,0,0,0.45))]">
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: GRAD_HEADLINE }}
            >
              Designed for<br />real<br className="sm:hidden" /> connections.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-[1.65] text-[#e9e4d6] sm:text-[17px]">
            Smart matches, real conversations,<br className="hidden sm:block" /> meaningful relationships.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <a
              href="/auth?mode=sign-up"
              className="btn-ember btn-shine relative overflow-hidden rounded-full px-8 py-3.5 text-[15px] font-bold"
            >
              Create your profile
            </a>
            <a
              href="#how"
              className="rounded-full border border-white/25 bg-black/35 px-7 py-3.5 text-[15px] font-semibold text-[#f3efe4] backdrop-blur-sm transition-colors duration-300 hover:border-white/45 hover:bg-black/50"
            >
              See how it works
            </a>
          </div>

          <ul className="mt-8 flex flex-col gap-5 sm:mt-10">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-center gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#e9c37c]/30 bg-black/45 backdrop-blur-sm">
                  {f.icon}
                </span>
                <span>
                  <b className="block text-[14.5px] font-semibold text-[#f7f3ea] [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">{f.title}</b>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-[#cfc9ba]">{f.sub}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-7 text-[10px] tracking-wide text-[#a9a593]/90">
            Illustrative scene — AI-generated imagery. No real members are depicted.
          </p>
        </div>
      </div>
    </section>
  );
}
