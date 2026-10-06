import { Reveal } from "@/components/reveal";

const faqs = [
  {
    q: "Who is Freeborn for?",
    a: "Freeborn is for values-aligned singles who care about medical freedom, natural health, informed choice, and intentional long-term relationships. It is for people who want compatibility to include how they live, heal, build family, and make decisions.",
  },
  {
    q: "Is Freeborn only for people with the exact same health views?",
    a: "No. Freeborn is not a purity test. It is a relationship platform for people who value autonomy, respectful conversation, natural living, and long-term clarity. Members decide which values are essential for them.",
  },
  {
    q: "How is Freeborn different from other dating apps?",
    a: "Freeborn emphasizes full profiles, clear intentions, finite discovery, privacy-minded onboarding, and compatibility around values like health autonomy and natural wellness. It is built around deciding with context instead of reacting to a stack.",
  },
  {
    q: "Is Freeborn free?",
    a: "The current product lets members create a profile, discover people, like, match, and message — without advertising a paid plan or an invented upgrade promise.",
  },
  {
    q: "What information is public?",
    a: "Discovery surfaces profile details such as display name, age, city, region, occupation, bio, intentions, interests, lifestyle, photos, and verification status. Email, full birth date, and account provider details are never shown publicly.",
  },
  {
    q: "How do you build trust without overpromising?",
    a: "By showing what the product actually supports today: age-gated onboarding, editable privacy controls, discoverability settings, verification status, profile completeness cues, and clear member standards.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="relative border-t hairline">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-28 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-36">
        <Reveal className="lg:sticky lg:top-32 lg:self-start">
          <p className="eyebrow">Questions, answered</p>
          <h2 className="mt-5 font-display text-[clamp(2rem,4.2vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-pearl">
            Honest answers,{" "}
            <em className="font-medium italic text-gold-soft">no fine print.</em>
          </h2>
          <p className="mt-6 max-w-sm text-[15px] leading-[1.8] text-mist">
            If something isn't answered here, it probably isn't in the product
            yet — and we'd rather say that plainly than dress it up.
          </p>
        </Reveal>

        <div>
          {faqs.map((faq, i) => (
            <Reveal key={faq.q} delay={i * 50}>
              <details className="faq group border-t hairline">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6">
                  <span className="font-display text-[18px] font-medium tracking-tight text-pearl transition-colors duration-300 group-hover:text-gold-soft">
                    {faq.q}
                  </span>
                  <span className="faq-plus flex h-8 w-8 shrink-0 items-center justify-center rounded-full border hairline text-sand">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <div className="faq-body overflow-hidden">
                  <p className="pb-7 pr-12 text-[15px] leading-[1.8] text-mist">{faq.a}</p>
                </div>
              </details>
            </Reveal>
          ))}
          <div className="border-t hairline" />
        </div>
      </div>
    </section>
  );
}
