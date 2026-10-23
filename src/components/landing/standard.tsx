import { Reveal } from "@/components/reveal";

const pillars = [
  {
    index: "01",
    title: "Values before volume",
    body: "Freeborn is built for people who want health autonomy, natural living, faith or philosophy, family direction, and long-term intentions to have room in the dating experience, without turning a profile into a debate.",
  },
  {
    index: "02",
    title: "Natural health belongs in compatibility",
    body: "Lifestyle, wellness rhythm, informed choice, and medical freedom can shape daily life. Freeborn gives members a respectful way to share those values early, so connection starts with context.",
  },
  {
    index: "03",
    title: "Trust without overexposure",
    body: "Age-gated onboarding, private birth dates, editable discovery settings, visible verification status, and clear profile completeness cues help the room feel accountable, while personal essentials stay private.",
  },
];

const ledger = [
  { stat: "18+", label: "age-gated membership before discovery opens" },
  { stat: "6", label: "profile photos maximum, keeping presentation intentional" },
  { stat: "3", label: "relationship intentions highlighted on each profile" },
  { stat: "0", label: "birth dates, emails, or account providers shown publicly" },
];

export function Standard() {
  return (
    <section id="standard" className="relative border-t hairline">
      <div className="mx-auto max-w-6xl px-5 py-28 sm:px-8 lg:py-36">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">The Freeborn standard</p>
          <h2 className="mt-5 font-display text-[clamp(2rem,4.2vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-pearl">
            Three commitments,{" "}
            <em className="font-medium italic text-gold-soft">kept in code.</em>
          </h2>
          <p className="mt-6 text-[16px] leading-[1.8] text-mist">
            Not slogans on a landing page. Product decisions. Every one of these
            shapes what you can share, what stays private, and how discovery feels.
          </p>
        </Reveal>

        <div className="mt-16">
          {pillars.map((pillar, i) => (
            <Reveal key={pillar.index} delay={i * 90}>
              <div className="group grid gap-4 border-t hairline py-10 transition-all duration-500 hover:bg-pearl/[0.02] sm:grid-cols-[110px_1fr] sm:gap-8 lg:py-12">
                <span className="font-display text-[15px] italic text-ash transition-all duration-500 group-hover:text-ember">
                  ({pillar.index})
                </span>
                <div className="transition-transform duration-500 group-hover:translate-x-1.5">
                  <h3 className="font-display text-[clamp(1.4rem,2.4vw,1.9rem)] font-semibold tracking-tight text-pearl">
                    {pillar.title}
                  </h3>
                  <p className="mt-3 max-w-3xl text-[15px] leading-[1.8] text-mist">
                    {pillar.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
          <div className="border-t hairline" />
        </div>
      </div>

      {/* trust ledger */}
      <div className="relative overflow-hidden border-t hairline bg-void/60">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, rgba(217,167,82,0.09), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
          <Reveal>
            <p className="eyebrow text-center">The trust ledger</p>
            <p className="mx-auto mt-4 max-w-xl text-center text-[15px] leading-relaxed text-mist">
              No invented match rates. No borrowed press logos. These are the
              rules the product actually ships with.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-px overflow-hidden rounded-[24px] border hairline bg-pearl/[0.06] sm:grid-cols-2 lg:grid-cols-4">
            {ledger.map((item, i) => (
              <Reveal key={item.stat} delay={i * 80} className="bg-night">
                <div className="flex h-full flex-col justify-between px-7 py-9 transition-colors duration-500 hover:bg-midnight">
                  <span className="font-display text-[56px] font-semibold leading-none tracking-tight text-pearl">
                    {item.stat}
                  </span>
                  <span className="mt-6 block text-[13px] leading-relaxed text-sand">
                    {item.label}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
