import type { Metadata } from "next";
import { ogCard } from "@/lib/site";
import { GuidePage } from "@/components/guides/guide-page";

export const metadata: Metadata = {
  title: "Meeting like-minded singles without app-store apps",
  description:
    "What to demand from any dating platform — published policies, verifiable humans, free core communication — and how Freeborn answers each point in its shipping code.",
  alternates: { canonical: "/guides/meet-without-apps" },
  openGraph: ogCard(
    "/guides/meet-without-apps",
    "Meeting like-minded singles without app-store apps · Freeborn",
    "What to demand from any dating platform — published policies, verifiable humans, free core communication — and how Freeborn answers each point in its shipping code."
  ),
};

const faqs = [
  {
    q: "Why does it matter that a dating platform is web-first?",
    a: "A web platform reaches you through any browser and can install to your home screen as a progressive web app, so there is no store account, no install and no store removal standing between you and your matches. Freeborn ships a manifest and service worker exactly for that installable-web experience.",
  },
  {
    q: "How can I check that a platform's policies are real?",
    a: "Read them and compare them with the product. Freeborn's privacy, cookie and terms pages are written to describe the system that actually ships — down to the storage keys the app sets — and the safety page describes each verification and moderation check including what it cannot do.",
  },
];

export default function MeetWithoutAppsGuide() {
  return (
    <GuidePage
      path="/guides/meet-without-apps"
      title="Meeting like-minded singles without app-store apps"
      eyebrow="Guide · choosing a platform"
      updated="2026-11-16"
      description="What to demand from any dating platform — published policies, verifiable humans, free core communication — and how Freeborn answers each point in its shipping code."
      faqs={faqs}
    >
      <p>
        Niche, values-aligned dating has mostly lived inside mobile apps: install,
        store account, store rules, and a listing that can change or disappear on
        someone else&apos;s decision. If you want to meet people who share your
        values — health autonomy, natural living, real commitment — without handing
        your love life to an app store, here is the short checklist we would apply
        to any platform, including our own.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">1. Published policies you can actually read</h2>
      <p>
        A platform that will not show you its privacy policy, cookie policy and
        terms is asking for trust it has not earned. Check whether the documents
        describe real behaviour: which data is collected, which keys are stored on
        your device, how deletion works. Freeborn publishes all three, written
        against the shipping system rather than a template, and the cookie policy
        lists every storage key by name.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">2. Humans you can verify, not avatars you must faith</h2>
      <p>
        Bots and stock photos are the tax every dating platform pays unless it
        checks that a person is present. Look for a verification step that requires
        liveness — Freeborn&apos;s is pose-mimic selfie verification, where you
        reproduce a shown pose on camera, backed by moderation of uploads and
        messages. The safety page states plainly what each check can and cannot
        guarantee; treat any platform that claims perfection as a red flag.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">3. Core communication that is free</h2>
      <p>
        If matching and messaging sit behind a paywall, the platform&apos;s
        incentive is your frustration, not your match. Check for billing
        infrastructure: Freeborn has none at all — matching, chat, photos and voice
        notes are free, and there is no subscription code waiting to be switched
        on. That is a statement you can hold us to, because it is true of the
        codebase today.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">4. A web address you own the relationship with</h2>
      <p>
        A platform on its own domain can be bookmarked, linked and reached from
        any device you trust. Freeborn runs entirely on the open web at
        freeborndating.com and installs to your home screen as a progressive web
        app — no store intermediary, no listing review queue, no sudden removal.
      </p>
      <p>
        Our opinion, plainly framed: the four points above matter more than any
        feature list. A platform that passes them can earn your time; one that
        will not discuss them is selling it.
      </p>
    </GuidePage>
  );
}
