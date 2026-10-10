import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";

const iconProps = {
  width: 26,
  height: 26,
  viewBox: "0 0 26 26",
  fill: "none",
  "aria-hidden": true as const,
};

const icons: Record<string, ReactNode> = {
  leaf: (
    <svg {...iconProps}>
      <path
        d="M13 2.5c5 3.4 8 7.6 8 12a8 8 0 11-16 0c0-4.4 3-8.6 8-12z"
        stroke="#d9a752"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M13 8v12M13 12.5l3.4-2.6M13 16l-3.4-2.6" stroke="#4fb8a7" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  gate: (
    <svg {...iconProps}>
      <rect x="3" y="5" width="20" height="16" rx="3" stroke="#d9a752" strokeWidth="1.4" />
      <circle cx="9.2" cy="12" r="2.4" stroke="#4fb8a7" strokeWidth="1.4" />
      <path d="M5.6 18.2c.7-1.7 2-2.6 3.6-2.6s2.9.9 3.6 2.6M15.5 10h4.8M15.5 13.5h4.8M15.5 17h3" stroke="#d9a752" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  lock: (
    <svg {...iconProps}>
      <rect x="5" y="11" width="16" height="11" rx="3" stroke="#d9a752" strokeWidth="1.4" />
      <path d="M8.5 11V8.4a4.5 4.5 0 019 0V11" stroke="#d9a752" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="13" cy="16" r="1.6" fill="#4fb8a7" />
      <path d="M13 17.4v1.8" stroke="#4fb8a7" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  sliders: (
    <svg {...iconProps}>
      <path d="M4 8h18M4 13h18M4 18h18" stroke="#d9a752" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9" cy="8" r="2.2" fill="#0a0d18" stroke="#4fb8a7" strokeWidth="1.4" />
      <circle cx="17" cy="13" r="2.2" fill="#0a0d18" stroke="#4fb8a7" strokeWidth="1.4" />
      <circle cx="11" cy="18" r="2.2" fill="#0a0d18" stroke="#4fb8a7" strokeWidth="1.4" />
    </svg>
  ),
  heart: (
    <svg {...iconProps}>
      <path d="M13 21.5S4.4 16.6 4.4 10.4a4.6 4.6 0 018.6-1.7 4.6 4.6 0 018.6 1.7c0 6.2-8.6 11.1-8.6 11.1z" stroke="#d9a752" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  badge: (
    <svg {...iconProps}>
      <path d="M13 2.8l7.6 3v6c0 5.4-3.4 9.3-7.6 11-4.2-1.7-7.6-5.6-7.6-11v-6l7.6-3z" stroke="#4fb8a7" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9.6 12.6l2.4 2.4 4.6-5" stroke="#d9a752" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const features = [
  {
    icon: "leaf",
    title: "Health autonomy respected",
    body: "Freeborn is for people who believe medical decisions and wellness practices deserve informed consent, personal agency, and respectful conversation — never coercion or ridicule.",
    wide: true,
  },
  {
    icon: "gate",
    title: "Age-gated entry",
    body: "Date of birth is required to confirm 18+ eligibility, then kept private from public profiles.",
    wide: false,
  },
  {
    icon: "lock",
    title: "Private by default",
    body: "Emails, full birth dates, last names, and account provider details stay out of discovery cards and public surfaces.",
    wide: false,
  },
  {
    icon: "sliders",
    title: "Discovery controls",
    body: "Tune age range, distance, shown genders, intentions, verified-only discovery — and whether you are discoverable at all.",
    wide: false,
  },
  {
    icon: "heart",
    title: "See who liked you — free",
    body: "Every like is visible, exactly as it happened. No mystery notifications, no paywall to peek at who's interested.",
    wide: false,
  },
  {
    icon: "badge",
    title: "Verified-only discovery",
    body: "Turn it on and the room shows just trust-checked profiles — the teal seal always matches the face.",
    wide: false,
  },
];

const principles = [
  {
    title: "Honor health autonomy",
    body: "Members are free to make informed choices about their bodies, homes, food, family, and care. Compatibility starts with respect.",
  },
  {
    title: "Be recognizable and real",
    body: "Recent photos, honest details, a bio that sounds like you. A profile should feel like an invitation into your values — not a performance.",
  },
  {
    title: "Move toward commitment with care",
    body: "Pass respectfully, like intentionally, and open with something specific. Freeborn rewards attention and patience over impulse.",
  },
];

export function Safety() {
  return (
    <section id="safety" className="relative border-t hairline bg-gradient-to-b from-night via-midnight/30 to-night">
      <div className="mx-auto max-w-6xl px-5 py-28 sm:px-8 lg:py-36">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <Reveal className="lg:sticky lg:top-32 lg:self-start">
            <p className="eyebrow">Safety & privacy</p>
            <h2 className="mt-5 font-display text-[clamp(2rem,4.2vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-pearl">
              Trust is a{" "}
              <em className="font-medium italic text-gold-soft">design decision.</em>
            </h2>
            <p className="mt-6 text-[16px] leading-[1.8] text-mist">
              We don't ask you to trust a promise — we show you the controls.
              Every safety choice below is visible, editable, and enforced in the
              product, not just on this page.
            </p>
            <div className="mt-8 flex flex-col items-start gap-4">
              <a href="/auth?mode=sign-up" className="btn-ghost inline-flex rounded-full px-6 py-3 text-[14px] font-bold">
                Create your account
              </a>
              <a href="/safety" className="text-[13px] font-bold text-gold-soft underline decoration-gold/30 underline-offset-4 transition hover:decoration-gold/70">
                Read the full safety &amp; trust standard →
              </a>
            </div>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((feature, i) => (
              <Reveal
                key={feature.title}
                delay={i * 80}
                className={feature.wide ? "sm:col-span-2" : ""}
              >
                <div className="group h-full rounded-[22px] border hairline bg-abyss/60 p-7 transition-all duration-500 hover:border-ember/30 hover:bg-abyss">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border hairline bg-night transition-transform duration-500 group-hover:-translate-y-1">
                    {icons[feature.icon]}
                  </div>
                  <h3 className="mt-5 font-display text-[19px] font-semibold tracking-tight text-pearl">
                    {feature.title}
                  </h3>
                  <p className="mt-2.5 text-[14px] leading-[1.75] text-mist">{feature.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* community principles */}
        <div className="mt-24">
          <Reveal>
            <div className="rule-ember mb-12" />
            <p className="eyebrow">The community standard</p>
          </Reveal>
          <div className="mt-8 grid gap-10 md:grid-cols-3">
            {principles.map((principle, i) => (
              <Reveal key={principle.title} delay={i * 100}>
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-[13px] italic text-ember">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-display text-[19px] font-semibold tracking-tight text-pearl">
                    {principle.title}
                  </h3>
                </div>
                <p className="mt-3 text-[14px] leading-[1.75] text-mist">{principle.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
