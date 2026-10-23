"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/reveal";

const steps = [
  {
    step: "01",
    title: "Build a values-aligned profile",
    body: "Share your essentials, health rhythm, lifestyle, relationship direction, interests, and a short bio. It is designed to feel human before it feels searchable.",
  },
  {
    step: "02",
    title: "Set your boundaries",
    body: "Choose who you want to see, how far discovery should reach, and whether deal breakers should be strict. Clarity is part of chemistry.",
  },
  {
    step: "03",
    title: "Read the whole person",
    body: "Profiles put location, intention, words, interests, photos, wellness cues, and verification status in one calm view, so every choice has context.",
  },
  {
    step: "04",
    title: "Move toward something real",
    body: "When a like becomes mutual, the conversation begins with values already on the table, not a blank performance of small talk.",
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.step);
            if (!Number.isNaN(idx)) setActive(idx);
          }
        }
      },
      { rootMargin: "-38% 0px -48% 0px", threshold: 0 }
    );
    for (const node of refs.current) {
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how" className="relative border-t hairline bg-gradient-to-b from-night to-midnight/40">
      <div className="mx-auto grid max-w-6xl gap-14 px-5 py-28 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24 lg:py-36">
        {/* sticky intro column */}
        <div className="lg:sticky lg:top-32 lg:self-start">
          <Reveal>
            <p className="eyebrow">How it works</p>
            <h2 className="mt-5 font-display text-[clamp(2rem,4.2vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-pearl">
              Chemistry,{" "}
              <em className="font-medium italic text-gold-soft">with context.</em>
            </h2>
            <p className="mt-6 max-w-md text-[16px] leading-[1.8] text-mist">
              Four deliberate steps instead of an endless feed. Freeborn is built
              around deciding with context, not reacting to a stack.
            </p>
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-10 hidden items-center gap-1.5 lg:flex">
              {steps.map((s, i) => (
                <span
                  key={s.step}
                  className={`h-[3px] rounded-full transition-all duration-700 ${
                    i <= active ? "w-10 bg-ember" : "w-6 bg-pearl/15"
                  }`}
                />
              ))}
              <span className="ml-3 font-display text-sm italic text-sand">
                {steps[active].step} / 04
              </span>
            </div>
          </Reveal>
        </div>

        {/* steps column */}
        <div>
          {steps.map((s, i) => (
            <div
              key={s.step}
              data-step={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className={`step-row ${active === i ? "is-active" : ""}`}
            >
              <Reveal className="px-6 py-10 sm:px-8 lg:py-12" delay={i * 60}>
                <div className="flex items-start gap-6">
                  <span
                    className={`font-display text-[44px] font-medium leading-none transition-colors duration-700 ${
                      active === i ? "text-ember" : "text-pearl/20"
                    }`}
                  >
                    {s.step}
                  </span>
                  <div>
                    <h3 className="font-display text-[22px] font-semibold tracking-tight text-pearl">
                      {s.title}
                    </h3>
                    <p className="mt-3 max-w-lg text-[15px] leading-[1.75] text-mist">
                      {s.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
