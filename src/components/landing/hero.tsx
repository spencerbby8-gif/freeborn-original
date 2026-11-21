import type { ReactNode } from "react";
import { VerifyBadge } from "@/components/verify-badge";

/* ============================================================================
   Landing hero — rebuilt to the approved hero comp ("Designed for real
   connections."). Two static renders of the rebuilt Freeborn app UI ship as
   pure JSX so the phones stay crisp at any density; every portrait shown is
   AI-generated and no account exists for any of the members pictured. The
   phone status bar / Dynamic Island / home indicator are deliberately absent
   (product decision: no fake OS chrome in the product story).
   ========================================================================== */

const GRAD_CREAM =
  "linear-gradient(120deg,#f7e6cb 0%,#f0c9a0 35%,#e5a878 70%,#d9805f 100%)";
const GRAD_HEADLINE =
  "linear-gradient(100deg,#d0805f 0%,#e8a878 25%,#f7e6cb 55%,#f0d3ae 80%,#d9a06f 100%)";

function IconHeart({ className = "h-5 w-5", strokeWidth = 1.7 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 20s-6.8-4.6-9.1-9.5C1.9 7.4 4.6 4.7 7.4 4.7c1.8 0 3.3 1 4.6 2.3 1.3-1.3 2.8-2.3 4.6-2.3 2.8 0 5.5 2.7 4.5 5.8C18.8 15.4 12 20 12 20z"
        stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round"
      />
    </svg>
  );
}
function IconFlame({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 5z"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
function IconX({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconChevronLeft({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconEllipsis({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="5.5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18.5" cy="12" r="1.5" />
    </svg>
  );
}
function IconCompass({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
function IconChat({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M8 10h8M8 13.5h5M21 12c0 4-4 7-9 7a9.6 9.6 0 0 1-4-.8L3 20l1.6-4.2A7.4 7.4 0 0 1 3 12c0-4 4-7 9-7s9 3 9 7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
function IconUser({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="7.8" r="3.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.4 20a6.6 6.6 0 0 1 13.2 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconGlobe({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.8 12h16.4M12 3.8c2.4 2.2 3.7 5.1 3.7 8.2s-1.3 6-3.7 8.2c-2.4-2.2-3.7-5.1-3.7-8.2S9.6 6 12 3.8z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function IconCup({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M7 9h9v5.5a4.5 4.5 0 0 1-4.5 4.5h0A4.5 4.5 0 0 1 7 14.5V9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16 10h1.5a2.2 2.2 0 0 1 0 4.4H16M10 5.5c.8.8.8 1.6 0 2.4M13.2 5.5c.8.8.8 1.6 0 2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IconPersonLine({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="7.4" r="3.1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.2 19.4a6 6 0 0 1 11.6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Shared in-phone tab bar (Discover active, matching the comp). */
function PhoneTabBar() {
  const item = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-1 text-[9px] font-semibold tracking-[0.06em] ${
      active ? "text-[#e9c37c]" : "text-[#7c7889]"
    }`;
  return (
    <nav className="flex border-t border-white/5 bg-[#101018] px-2 pb-4 pt-2" aria-hidden>
      <span className={item(true)}>
        <IconCompass className="h-[21px] w-[21px]" />
        <span>Discover</span>
        <span className="h-[2.5px] w-5 rounded-full bg-[#e9c37c]" />
      </span>
      <span className={item(false)}>
        <IconHeart className="h-[21px] w-[21px]" strokeWidth={1.5} />
        <span>Likes</span>
      </span>
      <span className={item(false)}>
        <span className="relative">
          <IconChat className="h-[21px] w-[21px]" />
          <em className="absolute -right-2 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#e0685f] text-[8.5px] font-bold not-italic text-white">2</em>
        </span>
        <span>Messages</span>
      </span>
      <span className={item(false)}>
        <IconUser className="h-[21px] w-[21px]" />
        <span>Profile</span>
      </span>
    </nav>
  );
}

function SayHelloRow() {
  return (
    <div className="flex items-center justify-between px-6 py-3">
      <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-[#262743]">
        <IconX className="h-5 w-5 text-[#e8e4d8]" />
      </span>
      <span
        className="flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-bold text-[#2a1a10] shadow-[0_10px_28px_rgba(240,190,140,0.35)]"
        style={{ background: GRAD_CREAM }}
      >
        <IconHeart className="h-[17px] w-[17px]" strokeWidth={1.6} />
        Say hello
      </span>
      <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-[#262743]">
        <IconFlame className="h-5 w-5 text-[#e9c37c]" />
      </span>
    </div>
  );
}

function DiscoverScreen() {
  return (
    <div className="flex h-full w-full flex-col bg-[#151724] text-[#f4efe7]">
      <div className="flex items-center justify-between px-5 pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#a5a1b4]">
          Tonight in Brooklyn
        </p>
        <span className="relative rounded-full border border-white/10 bg-[#1e1f33] p-2.5">
          <IconHeart className="h-[18px] w-[18px] text-[#f4efe7]" strokeWidth={1.5} />
          <em className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#e0685f] text-[9px] font-bold not-italic text-white">2</em>
        </span>
      </div>
      <h2 className="px-5 pt-3 font-display text-[32px] leading-[1.06] tracking-[-0.01em]">
        Someone you&rsquo;ll<br />remember.
      </h2>
      <div className="flex items-center gap-2 px-5 pt-4">
        {["Long-term", "Natural health", "Health autonomy"].map((t) => (
          <span key={t} className="whitespace-nowrap rounded-full bg-[#42303f] px-3 py-1.5 text-[10px] font-semibold text-[#dcb0b4]">
            {t}
          </span>
        ))}
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-[#1e1f33]">
          <IconFlame className="h-4 w-4 text-[#e9c37c]" />
        </span>
      </div>
      <div className="relative mx-4 mt-4 min-h-0 flex-1 overflow-hidden rounded-[22px]">
        <img
          src="/images/samples/aria.jpg"
          alt="Aria, 27, laughing in the sunset — AI-generated sample member"
          className="absolute inset-0 h-full w-full object-cover object-[50%_16%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/75" />
        <span className="absolute left-4 top-3.5 text-[9px] font-bold uppercase tracking-[0.3em] text-white/85">
          New here
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-black/40 p-2.5 backdrop-blur-sm">
          <IconHeart className="h-5 w-5 text-[#f3ddd2]" strokeWidth={1.6} />
        </span>
        <div className="absolute inset-x-4 bottom-3">
          <p className="flex items-center gap-2 font-display text-[29px] leading-none text-white">
            Aria <VerifyBadge size={20} />
          </p>
          <p className="mt-1.5 text-[10.5px] text-[#e8e4d8]">27 · Graphic Designer · Brooklyn</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[9px] font-semibold text-[#8fe0ac]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#57d38a]" />
            5&prime;6&Prime; · Active today
          </p>
          <div className="mt-2 flex gap-1.5">
            {["Hiking", "Ambient music", "Matcha lover"].map((t) => (
              <span key={t} className="rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[9px] text-[#f0ede2] backdrop-blur-sm">
                {t}
              </span>
            ))}
          </div>
          <p className="mt-2 max-w-[95%] text-[8.5px] leading-snug text-[#d5d1c4]">
            Designing by day, chasing sunsets by night. I believe in deep talks, random adventures, and good coffee.
          </p>
        </div>
      </div>
      <SayHelloRow />
      <PhoneTabBar />
    </div>
  );
}

function Tile({ label, value, tone, children }: { label: string; value: string; tone: "dim" | "gold"; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-white/5 bg-[#1e1f33] p-2">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
          tone === "gold" ? "bg-[#e9c37c] text-[#241a10]" : "bg-[#26202c] text-[#e9c37c]"
        }`}
      >
        {children}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[8.5px] text-[#a5a1b4]">{label}</span>
        <span className="mt-0.5 text-[11.5px] font-semibold text-[#f4efe7]">{value}</span>
      </span>
    </div>
  );
}

function ProfileScreen() {
  return (
    <div className="flex h-full w-full flex-col bg-[#151724] text-[#f4efe7]">
      <div className="relative h-[272px] w-full shrink-0 overflow-hidden">
        <img
          src="/images/samples/aria.jpg"
          alt="Aria, 27 — AI-generated sample member"
          className="absolute inset-0 h-full w-full object-cover object-[50%_18%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-[#151724]" />
        <span className="absolute left-4 top-4">
          <IconChevronLeft className="h-6 w-6 text-white drop-shadow" />
        </span>
        <span className="absolute right-4 top-5 text-white drop-shadow">
          <IconEllipsis className="h-6 w-6" />
        </span>
        <div className="absolute bottom-2.5 left-5">
          <p className="flex items-center gap-2 font-display text-[27px] leading-none text-white">
            Aria <VerifyBadge size={19} />
          </p>
          <p className="mt-1 text-[10px] text-[#e8e4d8]">27 · Graphic Designer · Brooklyn</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[8.5px] font-semibold text-[#8fe0ac]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#57d38a]" />
            Active today
          </p>
        </div>
        <span
          className="absolute -bottom-1 right-4 grid h-14 w-14 place-items-center rounded-full text-white shadow-[0_10px_24px_rgba(217,106,92,0.5)]"
          style={{ background: "linear-gradient(150deg,#f0a185,#d9705c)" }}
          aria-hidden
        >
          <IconHeart className="h-6 w-6" strokeWidth={1.7} />
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-[#1e1f33] px-4 py-2.5">
          <div>
            <p className="text-[9.5px] font-semibold text-[#d0805f]">Looking for</p>
            <p className="mt-0.5 font-display text-[15.5px] leading-[1.25] text-[#f4efe7]">
              Something real<br />and meaningful
            </p>
          </div>
          <svg viewBox="0 0 64 64" className="h-12 w-12 shrink-0" fill="none" aria-hidden style={{ filter: "drop-shadow(0 0 10px rgba(255,125,149,0.65))" }}>
            <path d="M32 54S9 39.4 4.3 23.3C1.9 14.6 8.2 7.5 16.6 7.5c6.7 0 11.6 3.6 15.4 9 3.8-5.4 8.7-9 15.4-9 8.4 0 14.7 7.1 12.3 15.8C55 39.4 32 54 32 54z" stroke="#ff7d95" strokeWidth="3.4" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Lifestyle" value="Active" tone="dim">
            <IconPersonLine className="h-5 w-5 text-[#d8cf8a]" />
          </Tile>
          <Tile label="Drinks" value="Matcha" tone="dim">
            <IconCup className="h-5 w-5" />
          </Tile>
          <Tile label="Zodiac" value="Leo" tone="gold">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
              <path d="M5 15a4 4 0 1 0 4-4M12 7v10M17 9l-2 6" stroke="#241a10" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Tile>
          <Tile label="Languages" value="English" tone="dim">
            <IconGlobe className="h-5 w-5" />
          </Tile>
        </div>
        <div className="rounded-2xl border border-white/5 bg-[#1e1f33] p-3">
          <p className="text-[8.5px] font-semibold text-[#d0805f]">About me</p>
          <p className="mt-1 text-[9px] leading-snug text-[#d9d5c9]">
            Creative soul with a curious mind. I love meaningful conversations, weekend getaways, and trying new cuisines.
          </p>
          <p className="mt-2 text-[8.5px] font-semibold text-[#d0805f]">My passions</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {["Hiking", "Photography", "Ambient Music", "Travel"].map((t) => (
              <span key={t} className="rounded-full border border-white/5 bg-[#262740] px-2.5 py-1 text-[8.5px] text-[#dcd8cc]">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
      <SayHelloRow />
      <PhoneTabBar />
    </div>
  );
}

/** Phone canvas: lays out the 393×852 app screen at ~0.58–1.0 scale. */
function Phone({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} className="shrink-0 select-none [zoom:0.43] min-[430px]:[zoom:0.66] sm:[zoom:0.74] xl:[zoom:0.72] 2xl:[zoom:0.8]">
      <div className="relative h-[852px] w-[393px] overflow-hidden rounded-[52px] border border-white/10 bg-[#151724] shadow-[0_0_0_9px_#04050d,0_0_0_10px_rgba(255,255,255,0.05),0_60px_110px_-24px_rgba(0,0,0,0.8)]">
        {children}
      </div>
    </div>
  );
}

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
    <section id="top" className="relative overflow-hidden pb-16 pt-24 sm:pt-28 xl:flex xl:min-h-[100svh] xl:items-center xl:pb-10 xl:pt-20">
      {/* single disciplined ember glow — no aurora soup */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[860px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(239,94,94,0.16), rgba(217,167,82,0.07) 55%, transparent 75%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* On small screens the comp's vertical order holds: phones first, then
            the headline band. On xl+ the two columns sit side by side so the
            whole hero fits a landscape viewport. */}
        <div className="flex flex-col items-center gap-10 xl:flex-row xl:justify-between xl:gap-6">
          {/* ---------- band: headline + features ---------- */}
          <div className="order-2 w-full min-w-0 xl:order-1 xl:max-w-[540px]">
            <h1 className="font-display text-[clamp(2.6rem,6.2vw,4.35rem)] font-medium leading-[1.02] tracking-[-0.02em]">
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: GRAD_HEADLINE }}
              >
                Designed for real<br />connections.
              </span>
            </h1>
            <p className="mt-5 max-w-md text-[17px] leading-[1.65] text-mist">
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
                className="btn-ghost rounded-full px-7 py-3.5 text-[15px] font-semibold"
              >
                See how it works
              </a>
            </div>

            <ul className="mt-9 flex flex-col gap-6 xl:mt-11 xl:gap-7">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex items-center gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#e9c37c]/25 bg-[#e9c37c]/10">
                    {f.icon}
                  </span>
                  <span>
                    <b className="block text-[15px] font-semibold text-pearl">{f.title}</b>
                    <span className="mt-0.5 block text-[13px] leading-snug text-mist">{f.sub}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ---------- app phones (rebuilt Freeborn UI, rendered live) ---------- */}
          <div className="order-1 flex flex-col items-center xl:order-2">
            <div className="flex items-end justify-center gap-3 sm:gap-5">
              <Phone label="Freeborn app Discover screen: sample member Aria, 27, in Brooklyn">
                <DiscoverScreen />
              </Phone>
              <Phone label="Freeborn app profile screen: sample member Aria, 27, Graphic Designer in Brooklyn">
                <ProfileScreen />
              </Phone>
            </div>
            <p className="mt-4 text-center text-[10.5px] tracking-wide text-ash">
              Sample members. Every face and profile shown is AI-generated; no account exists for anyone here.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
