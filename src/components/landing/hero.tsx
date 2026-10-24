"use client";

import { useEffect, useRef, useState } from "react";
import { VerifyBadge } from "@/components/verify-badge";
import { MemberPortrait } from "@/components/landing/member-portrait";

type HeroProfile = {
  name: string;
  /** AI-generated illustrative portrait. No account exists for any of these. */
  photo: string;
  age: number;
  city: string;
  job: string;
  prompt: string;
  answer: string;
  traits: string[];
  verified: boolean;
};

const mara: HeroProfile = {
  name: "Mara",
  photo: "/images/samples/mara.jpg",
  age: 29,
  city: "Austin, TX",
  job: "Functional nutritionist",
  prompt: "A value I will not compromise on…",
  answer:
    "Informed choice. I want a relationship where we can ask good questions and make health decisions without pressure.",
  traits: ["Long-term", "Natural health", "Health autonomy"],
  verified: true,
};

const jonah: HeroProfile = {
  name: "Jonah",
  photo: "/images/samples/jonah.jpg",
  age: 34,
  city: "Boise, ID",
  job: "Regenerative farmer",
  prompt: "My perfect Sunday…",
  answer:
    "Sunrise coffee, farmers market, a long walk, meal prep from scratch, and phones away by dinner.",
  traits: ["Life partner", "Grounded", "Outdoorsy"],
  verified: true,
};

const elena: HeroProfile = {
  name: "Elena",
  photo: "/images/samples/elena.jpg",
  age: 31,
  city: "Franklin, TN",
  job: "Midwife",
  prompt: "I'm looking for someone who…",
  answer:
    "Lives with conviction, cares about natural health, and wants a peaceful home more than a performative life.",
  traits: ["Intentional", "Family-minded", "Wellness"],
  verified: false,
};

function ProfileCard({
  profile,
  className = "",
  tilt,
  lift,
  dim = false,
}: {
  profile: HeroProfile;
  className?: string;
  tilt: number;
  lift: number;
  dim?: boolean;
}) {
  return (
    <article
      className={`deck-card absolute overflow-hidden rounded-[26px] border hairline bg-abyss ${className}`}
      style={{ "--tilt": `${tilt}deg`, "--lift": `${lift}px` } as React.CSSProperties}
    >
      <div className="relative aspect-[3/3.4] w-full overflow-hidden">
        <MemberPortrait seed={profile.name} photo={profile.photo} label={`${profile.name}, ${profile.age}`} className="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-abyss via-abyss/10 to-transparent" />
        {dim && <div className="absolute inset-0 bg-night/45" />}
        <div className="absolute right-4 top-4 rounded-full bg-night/55 p-1.5 backdrop-blur-sm">
          {profile.verified && <VerifyBadge size={20} />}
        </div>
        <div className="absolute inset-x-4 bottom-3">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-2xl font-semibold text-pearl">
              {profile.name}
            </h3>
            <span className="font-display text-xl text-gold-soft">{profile.age}</span>
          </div>
          <p className="text-[11px] tracking-wide text-sand">
            {profile.job} · {profile.city}
          </p>
        </div>
      </div>
      <div className="space-y-2.5 p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-gold">
          {profile.prompt}
        </p>
        <p className="text-[13px] leading-relaxed text-ivory/90">{profile.answer}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {profile.traits.map((trait) => (
            <span
              key={trait}
              className="rounded-full border hairline bg-pearl/5 px-2.5 py-1 text-[10px] font-medium tracking-wide text-sand"
            >
              {trait}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export function Hero() {
  const [mounted, setMounted] = useState(false);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const deckRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const onMove = (e: MouseEvent) => {
      const rect = deckRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setParallax({
        x: Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width * 1.2))),
        y: Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height * 1.2))),
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const layer = (depth: number) => ({
    transform: `translate(${parallax.x * depth}px, ${parallax.y * depth}px)`,
    transition: "transform 0.6s cubic-bezier(0.22,1,0.36,1)",
  });

  return (
    <section id="top" className="night-field relative overflow-hidden pb-24 pt-32 lg:pb-32 lg:pt-40">
      {/* single disciplined ember glow — no aurora soup */}
      <div
        aria-hidden
        className="ember-breathe pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[860px] -translate-x-[62%] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(239,94,94,0.16), rgba(217,167,82,0.07) 55%, transparent 75%)",
        }}
      />

      <div className={`relative mx-auto max-w-6xl px-5 sm:px-8 ${mounted ? "in-view" : ""}`}>
        <div className="grid items-center gap-16 lg:grid-cols-[1.04fr_0.96fr]">
          {/* ---------- copy ---------- */}
          <div>
            <div className="mask-line">
              <span>
                <span className="inline-flex items-center gap-2.5 rounded-full border hairline bg-pearl/[0.04] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-sand">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ember" />
                  </span>
                  Values-aligned dating · No paywall · 18+
                </span>
              </span>
            </div>

            <h1 className="mt-7 font-display text-[clamp(2.9rem,6.4vw,5.2rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-pearl">
              <span className="mask-line" style={{ transitionDelay: "120ms" }}>
                <span style={{ transitionDelay: "120ms" }}>Date freely.</span>
              </span>
              <span className="mask-line" style={{ transitionDelay: "260ms" }}>
                <span style={{ transitionDelay: "260ms" }}>
                  Love{" "}
                  <em
                    className="bg-clip-text font-medium italic text-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(100deg, #ef5e5e 10%, #f6d79a 60%, #d9a752 95%)",
                    }}
                  >
                    intentionally.
                  </em>
                </span>
              </span>
            </h1>

            <div className="mask-line mt-7 max-w-xl">
              <span style={{ transitionDelay: "420ms" }}>
                <p className="text-[17px] leading-[1.75] text-mist">
                  Freeborn is a calm space for health autonomy, natural living, and
                  lasting love, with full profiles, clear intentions, and privacy by
                  default. Meet people who value informed choice as much as you do.
                </p>
              </span>
            </div>

            <div className="mask-line mt-9">
              <span style={{ transitionDelay: "560ms" }}>
                <div className="flex flex-wrap items-center gap-4">
                  <a
                    href="/auth?mode=sign-up"
                    className="btn-ember btn-shine relative overflow-hidden rounded-full px-8 py-3.5 text-[15px] font-bold"
                  >
                    Create your profile
                  </a>
                  <a
                    href="#how"
                    className="btn-ghost rounded-full px-7 py-3.5 text-[15px] font-semibold"
                  >
                    See how it works
                  </a>
                </div>
              </span>
            </div>

            <div className="mask-line mt-10">
              <span style={{ transitionDelay: "700ms" }}>
                <ul className="flex flex-wrap gap-x-7 gap-y-3">
                  {[
                    "Values-forward profiles",
                    "Medical freedom respected",
                    "Long-term intent only",
                  ].map((chip) => (
                    <li
                      key={chip}
                      className="flex items-center gap-2 text-[13px] font-medium text-sand"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                        <path
                          d="M7 1.2l1.6 3.4 3.7.5-2.7 2.6.7 3.7L7 9.6l-3.3 1.8.7-3.7L1.7 5.1l3.7-.5L7 1.2z"
                          stroke="#d9a752"
                          strokeWidth="1"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {chip}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-[12px] tracking-wide text-ash">
                  Free to join and free to stay. Every like is visible, discovery
                  narrows to what you actually asked for, and intentions are on the
                  card before the first message.
                </p>
              </span>
            </div>
          </div>

          {/* ---------- profile deck ---------- */}
          {/* Wrapped so the honesty note below can sit under the deck without
              becoming a third grid item and breaking the two-column layout. */}
          <div className="relative">
          <div
            ref={deckRef}
            className="relative mx-auto h-[560px] w-full max-w-[460px] select-none sm:h-[600px]"
          >
            <div className="absolute inset-0" style={layer(-7)}>
              <ProfileCard
                profile={elena}
                tilt={7.5}
                lift={-38}
                dim
                className="left-[46%] top-6 w-[248px] sm:w-[264px]"
              />
            </div>
            <div className="absolute inset-0" style={layer(-14)}>
              <ProfileCard
                profile={jonah}
                tilt={-9}
                lift={-12}
                dim
                className="left-[-4%] top-14 w-[248px] sm:w-[264px]"
              />
            </div>
            <div className="absolute inset-0 z-10" style={layer(10)}>
              <ProfileCard
                profile={mara}
                tilt={-1.5}
                lift={36}
                className="left-[16%] top-10 w-[272px] sm:left-[20%] sm:w-[292px]"
              />
            </div>

            {/* floating match toast */}
            <div
              className="float-soft absolute -left-2 bottom-2 z-20 sm:bottom-8"
              style={{ "--tilt": "-3deg" } as React.CSSProperties}
            >
              <div style={layer(18)}>
                <div className="flex items-center gap-3 rounded-2xl border hairline bg-midnight/90 px-4 py-3 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.7)] backdrop-blur-md">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-ember to-gold">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path
                        d="M8 13.6S2.1 9.9 2.1 5.9a3 3 0 015.9-.7A3 3 0 0113.9 5.9c0 4-5.9 7.7-5.9 7.7z"
                        fill="#fff7f2"
                      />
                    </svg>
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold text-pearl">A quiet match</p>
                    <p className="text-[11px] text-mist">
                      Mara liked your answer on informed choice
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* floating completeness chip */}
            <div
              className="float-soft absolute -right-1 top-0 z-20 hidden sm:block"
              style={{ "--tilt": "2.5deg", animationDelay: "1.4s" } as React.CSSProperties}
            >
              <div style={layer(24)}>
                <div className="flex items-center gap-2.5 rounded-2xl border hairline bg-midnight/90 px-3.5 py-2.5 shadow-[0_20px_50px_-14px_rgba(0,0,0,0.65)] backdrop-blur-md">
                  <span className="h-2 w-2 rounded-full bg-mint" />
                  <p className="text-[11px] font-medium text-sand">
                    Profile complete · photos 4 of 6
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p className="pointer-events-none mt-5 text-center text-[10.5px] tracking-wide text-ash">
            Sample deck. Every face and profile shown here is AI-generated. No account
            exists for anyone in it.
          </p>
          </div>
        </div>
      </div>
    </section>
  );
}
