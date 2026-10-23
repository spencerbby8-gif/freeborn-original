import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export const metadata: Metadata = {
  title: "Safety & trust",
  description:
    "How Freeborn keeps the room real: pose-mimic verification, dual-model moderation, privacy by default, and the controls you hold.",
  robots: { index: true, follow: true },
  /* Without this the page inherits the sitewide root canonical and tells search
     engines that /safety is a duplicate of the homepage. */
  alternates: { canonical: "/safety" },
};

const iconProps = {
  width: 26,
  height: 26,
  viewBox: "0 0 26 26",
  fill: "none",
  "aria-hidden": true as const,
};

const icons: Record<string, ReactNode> = {
  shield: (
    <svg {...iconProps}>
      <path d="M13 2.8l7.6 3v6c0 5.4-3.4 9.3-7.6 11-4.2-1.7-7.6-5.6-7.6-11v-6l7.6-3z" stroke="#4fb8a7" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9.6 12.6l2.4 2.4 4.6-5" stroke="#d9a752" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  eye: (
    <svg {...iconProps}>
      <path d="M2.5 13S6.5 6.5 13 6.5 23.5 13 23.5 13 19.5 19.5 13 19.5 2.5 13 2.5 13z" stroke="#d9a752" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="13" cy="13" r="3" stroke="#4fb8a7" strokeWidth="1.4" />
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
  scale: (
    <svg {...iconProps}>
      <path d="M13 3v20M6 23h14M13 6l-6 3 2.5 5a3 3 0 01-5 0L7 9M13 6l6 3-2.5 5a3 3 0 005 0L19 9" stroke="#d9a752" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const sections = [
  {
    icon: "shield",
    title: "Identity verification, without the surveillance",
    body: "A quick pose-mimic selfie: you mimic a pose, and two independent engines confirm it's a live person matching your photos. No ID, no documents, and no biometric template is built from your face. An approved selfie is kept, because it has to be: it is re-read when you change your photos, so the seal can be re-checked against the person who earned it. A rejected selfie is never stored at all. The Privacy Policy sets out exactly what is retained and for how long. Uploading a new face photo revokes the seal until you re-verify, so the teal badge always matches the face. One thing stated plainly: the engines are unavailable at the moment, so verification holds requests as pending and no new seals are being issued.",
  },
  {
    icon: "eye",
    title: "Reports never decide anything on their own",
    body: "Reports are cross-checked by two independent models from different providers, judging observable evidence only, and never private chats. A report alone never bans anyone and never removes content. Where the models disagree, nothing happens to your account. Suspension has one automatic ground: a sign-in address that resolves to a hosting or datacenter range, which the acceptable-use terms do not permit. Both models are third-party services and neither is infallible, so when they cannot run a report is recorded without a verdict instead of being settled by whichever engine answered. There is no review queue inside the product yet; an unresolved case is read by the operator when a member writes in.",
  },
  {
    icon: "gate",
    title: "The door stays closed to server farms",
    body: "Sign-in attempts from datacenter and hosting networks are blocked, and the check reads the connection IP our own infrastructure observes rather than a forwarded header a client can rewrite. VPN and proxy traffic is allowed and only recorded: privacy-minded members are Freeborn's own people, and a VPN is not proof of abuse. The lookup fails open, so a slow third party never locks a real person out.",
  },
  {
    icon: "lock",
    title: "Private by default",
    body: "Email, full birth date, last names, and exact coordinates are never shown to another member. Profile data is returned only to signed-in sessions that pass your own discovery settings, so the membership is not a public directory and cannot be crawled. Chat media belongs to the conversation it was sent in and is reachable only by its participants. Nothing is sold, there are no advertisers, and there are no third-party analytics on this site.",
  },
  {
    icon: "sliders",
    title: "Controls in your hands",
    body: "Block, report, hide, or deactivate — one tap, no dark patterns, no 'are you sure?' maze. Hiding removes you from Discover instantly; matches and history stay saved.",
  },
  {
    icon: "scale",
    title: "Rate limits on reports",
    body: "Report tools are rate-limited per account, so one person can't weaponize them with mass reports. Reports open investigations — they never punish on their own.",
  },
];

export default function SafetyPage() {
  return (
    <main className="night-field min-h-[100dvh]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" className="transition hover:opacity-80">
          <Wordmark size="md" />
        </Link>
        <Link href="/" className="btn-ghost rounded-full px-5 py-2.5 text-[13px] font-bold">
          Back to home
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:px-8 lg:pt-16">
        <p className="eyebrow">Safety &amp; trust</p>
        <h1 className="mt-5 font-display text-[clamp(2.2rem,4.5vw,3.6rem)] font-semibold leading-[1.06] tracking-[-0.02em] text-pearl">
          A real room.{" "}
          <em className="font-medium italic text-gold-soft">Verified, moderated, and yours to control.</em>
        </h1>
        <p className="mt-6 max-w-2xl text-[16px] leading-[1.8] text-mist">
          This is how Freeborn is built to keep the room real: not a promise, but the
          working system behind it. Where a control depends on a third-party service
          that can fail, we say so here rather than presenting it as unconditional,
          and the Privacy Policy carries the full detail.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <div
              key={s.title}
              className="group rounded-[22px] border hairline bg-abyss/60 p-7 transition-all duration-500 hover:border-ember/30 hover:bg-abyss"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border hairline bg-night transition-transform duration-500 group-hover:-translate-y-1">
                {icons[s.icon]}
              </div>
              <h2 className="mt-5 font-display text-[19px] font-semibold tracking-tight text-pearl">{s.title}</h2>
              <p className="mt-2.5 text-[14px] leading-[1.75] text-mist">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-[28px] border border-[var(--color-teal-500)]/20 bg-[var(--color-teal-500)]/[0.04] p-8 sm:p-10">
          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[var(--color-teal-300)]">
            The Freeborn safety promise
          </p>
          <ul className="mt-4 grid gap-3 text-[14px] leading-[1.7] text-mist sm:grid-cols-2">
            <li>· Identity checks use pose-mimic selfies, and anything doubtful goes to a human queue. Never a link sent in DMs.</li>
            <li>· Reports land in a moderation queue with rate limits — one person cannot weaponize them.</li>
            <li>· Chat media stays inside the conversation it was sent in, and nothing is ever sold or handed to advertisers.</li>
            <li>· New profile photos require re-verification, so the seal always matches the face.</li>
            <li>· You can hide or deactivate your account at any time — one tap, no dark patterns.</li>
            <li>· No paywall hides who liked you — every like is visible, exactly as it happened.</li>
          </ul>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/auth?mode=sign-up"
              className="btn-ember btn-shine relative overflow-hidden rounded-full px-8 py-3.5 text-[15px] font-bold"
            >
              Create your profile
            </Link>
            <Link href="/" className="btn-ghost rounded-full px-7 py-3.5 text-[15px] font-semibold">
              Back to the room
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
