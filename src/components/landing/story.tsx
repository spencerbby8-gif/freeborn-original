import { Reveal } from "@/components/reveal";
import { ScenePanel } from "@/components/landing/member-portrait";

const ribbon = [
  "Date like you mean it",
  "Informed choice",
  "Natural health",
  "Intentional love",
  "Health autonomy",
  "Roots & resilience",
  "Lasting commitment",
];

export function Marquee() {
  const items = [...ribbon, ...ribbon];
  return (
    <div className="relative z-10 -my-5 rotate-[-1.1deg]">
      <div className="overflow-hidden border-y hairline bg-void/70 py-4 backdrop-blur-sm">
        <div className="marquee-track items-center gap-10">
          {items.map((item, i) => (
            <span key={`${item}-${i}`} className="flex items-center gap-10 whitespace-nowrap">
              <span className="font-display text-lg italic tracking-wide text-sand">
                {item}
              </span>
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
                <rect x="5" y="0" width="7" height="7" transform="rotate(45 5 0)" fill="#ef5e5e" opacity="0.8" />
              </svg>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Manifesto() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 py-28 sm:px-8 lg:py-36">
      <div className="grid items-center gap-14 lg:grid-cols-[0.94fr_1.06fr] lg:gap-20">
        <Reveal className="order-2 lg:order-1">
          <figure className="relative">
            <div className="overflow-hidden rounded-[28px] border hairline">
              <ScenePanel
                label="Abstract golden-hour field at dusk"
                className="kenburns h-[340px] w-full sm:h-[420px]"
              />
            </div>
            <figcaption className="mt-4 flex items-center gap-3 text-[12px] tracking-wide text-ash">
              <span className="h-px w-8 bg-gold/60" />
              Sunday, somewhere between the garden and the market.
            </figcaption>
          </figure>
        </Reveal>

        <div className="order-1 lg:order-2">
          <Reveal>
            <p className="eyebrow">The manifesto</p>
            <h2 className="mt-5 font-display text-[clamp(2rem,4.2vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-pearl">
              A calmer room for{" "}
              <em className="font-medium italic text-gold-soft">serious hearts.</em>
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-7 text-[16px] leading-[1.8] text-mist">
              Most dating apps reward reflexes — a stack, a swipe, a half-second
              verdict on a face. Freeborn was built on the opposite bet: that the
              things which actually hold two lives together deserve room on the
              first screen. How you live. How you heal. What you want to build,
              and with what kind of patience.
            </p>
            <p className="mt-5 text-[16px] leading-[1.8] text-mist">
              This is a space for people who believe health choices are personal,
              natural wellness matters, and relationships should be built with
              honesty, respect, and long-term direction — without turning a first
              conversation into a debate.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-9 border-l-2 border-ember/60 pl-5 font-display text-[22px] italic leading-snug text-ivory">
              “Date like you mean it.”
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
