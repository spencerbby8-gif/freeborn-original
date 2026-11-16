import type { Metadata } from "next";
import Link from "next/link";
import { ogCard } from "@/lib/site";
import { PageStructuredData } from "@/components/seo/page-structured-data";

export const metadata: Metadata = {
  title: "Guides — honest dating advice from the platform that ships it",
  description:
    "Practical guides on meeting like-minded singles without app-store apps, making long-distance dating work with real browser calls, and spotting romance scams — every Freeborn claim checked against the shipping codebase.",
  alternates: { canonical: "/guides" },
  openGraph: ogCard(
    "/guides",
    "Guides · Freeborn",
    "Practical guides on meeting like-minded singles without app-store apps, making long-distance dating work with real browser calls, and spotting romance scams — every Freeborn claim checked against the shipping codebase."
  ),
};

const guides = [
  {
    href: "/guides/meet-without-apps",
    title: "Meeting like-minded singles without app-store apps",
    blurb:
      "What to demand from any dating platform — published policies, verifiable humans, free core communication — and how Freeborn answers each point in code.",
    updated: "2026-11-16",
  },
  {
    href: "/guides/long-distance",
    title: "Long-distance dating that feels close: the tools that matter",
    blurb:
      "Photos, voice notes, typing presence and browser-based voice and video calls — the shipped features that carry a long-distance match, plus their honest limits.",
    updated: "2026-11-16",
  },
  {
    href: "/guides/scam-spotting",
    title: "Romance-scam red flags, and what Freeborn's guard watches",
    blurb:
      "The payment-pressure patterns our message guard scores for, what pose-mimic verification does and does not stop, and how member reports reach the moderation queue.",
    updated: "2026-11-16",
  },
];

export default function GuidesIndexPage() {
  return (
    <>
      <PageStructuredData
        path="/guides"
        name="Guides — honest dating advice from the platform that ships it"
        description="Practical guides on meeting like-minded singles without app-store apps, making long-distance dating work with real browser calls, and spotting romance scams — every Freeborn claim checked against the shipping codebase."
      />
      <main className="night-field min-h-[100dvh]">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
          <Link href="/" className="transition hover:opacity-80">
            <span className="font-display text-2xl tracking-tight">Freeborn</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-[var(--color-pearl-dim)]">
            <Link href="/safety" className="transition hover:text-[var(--color-pearl)]">Safety</Link>
            <Link href="/auth" className="transition hover:text-[var(--color-pearl)]">Sign in</Link>
          </nav>
        </header>

        <section className="mx-auto max-w-3xl px-5 pb-20 pt-8 sm:px-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-gold)]">
            Freeborn guides · no fabricated stats, ever
          </p>
          <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
            Honest guides for dating with your values intact
          </h1>
          <p className="mt-6 leading-relaxed text-[var(--color-pearl-dim)]">
            Everything below is either advice (clearly framed as our opinion) or a
            fact about Freeborn that you can check against the platform itself —
            the safety page, the privacy page, or the shipping code. Each guide
            carries the date its Freeborn claims were last checked.
          </p>

          <div className="mt-10 space-y-6">
            {guides.map((g) => (
              <Link
                key={g.href}
                href={g.href}
                className="block rounded-2xl border border-[var(--color-line)] bg-[var(--color-ink)]/60 px-6 py-5 transition hover:border-[var(--color-gold)]/50"
              >
                <h2 className="font-display text-xl text-[var(--color-pearl)]">{g.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-pearl-dim)]">{g.blurb}</p>
                <p className="mt-3 text-xs text-[var(--color-pearl-dim)]">Checked {g.updated}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
