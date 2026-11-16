import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ogCard } from "@/lib/site";
import { PageStructuredData } from "@/components/seo/page-structured-data";

export const metadata: Metadata = {
  title: "Unjected alternative on the open web",
  description:
    "Unjected holds 2.4 stars on the US App Store. Freeborn runs the same idea — values-aligned dating for health autonomy — on the open web: no install, no store gatekeeper, no paywalled basics.",
  alternates: { canonical: "/alternatives" },
  openGraph: ogCard(
    "/alternatives",
    "Unjected alternative on the open web · Freeborn",
    "Unjected holds 2.4 stars on the US App Store. Freeborn runs the same idea — values-aligned dating for health autonomy — on the open web: no install, no store gatekeeper, no paywalled basics."
  ),
};

/**
 * The honest comparison page (B16).
 *
 * WHY THIS PAGE EXISTS. People frustrated with app-store-only niche dating apps
 * search for alternatives by name. The high-intent version of this page is the
 * one that tells the truth: every claim about Freeborn below is checkable in
 * this codebase (no billing infrastructure exists at all; verification and
 * moderation are the shipped systems described on /safety), and every claim
 * about a competitor is a dated snapshot of public store data, retrieved
 * 2026-11-16 through Apple's public iTunes Search API and the public App Store
 * page (raw responses kept in evidence/taskboard-2026-11-14/b16/).
 *
 * WHAT THIS PAGE REFUSES TO DO, by construction and by harness pin: no
 * star-rating or review-count markup about Freeborn anywhere (the trust ledger
 * line), no member counts, no borrowed press logos, and no guessed competitor
 * numbers — where a fact could not be verified today, the cell says so instead
 * of carrying a number.
 */
const VERIFIED_ON = "2026-11-16";

const faqs = [
  {
    q: "Do I have to install an app to use Freeborn?",
    a: "No. Freeborn is a web platform at freeborndating.com that works in any modern browser and installs to your home screen as a progressive web app. There is no app store account, no store review waiting period and no store removal risk between you and your matches.",
  },
  {
    q: "Does Freeborn paywall messaging?",
    a: "No. Matching, chat, photos and voice notes are free. The codebase contains no billing or subscription infrastructure at all, so there is no paywall waiting to be switched on behind the basics.",
  },
  {
    q: "How does Freeborn keep bots and scammers out?",
    a: "Pose-mimic selfie verification checks that the person behind a profile is present and live, dual-model moderation reads uploads and messages, and a scam guard watches for extortion and payment-scam patterns. The full description, including what each check can and cannot do, is on the safety page.",
  },
];

const rows: { dimension: string; freeborn: string; unjected: string; stores: string }[] = [
  {
    dimension: "How you reach it",
    freeborn: "Any browser, installable as a PWA. No store account, no install.",
    unjected: "iOS app through the US App Store (listing live when checked).",
    stores: "Install through Apple or Google stores, per app.",
  },
  {
    dimension: "Store gatekeeping between you and your matches",
    freeborn: "None — an independent web platform on its own domain.",
    unjected: "Subject to App Store policies, review and removal, like every iOS app.",
    stores: "Subject to each store's policies and enforcement.",
  },
  {
    dimension: `US App Store rating, checked ${VERIFIED_ON}`,
    freeborn: "Not applicable — there is no app listing to rate.",
    unjected: "2.4 average over 220 ratings (public listing data, retrieved 2026-11-16).",
    stores: "Varies per app; see each listing.",
  },
  {
    dimension: "Paywall on the basics",
    freeborn: "None. Match, chat, send photos and voice notes for free; no billing code exists in the platform.",
    unjected: "See the listing's in-app purchase declarations.",
    stores: "Varies per app; see each listing.",
  },
  {
    dimension: "Bot and scam defence",
    freeborn: "Pose-mimic selfie verification, dual-model moderation and a scam guard, described in full on /safety.",
    unjected: "See the listing and the developer's own documentation.",
    stores: "Varies per app.",
  },
  {
    dimension: "Public policy documents",
    freeborn: "Privacy, cookie and terms pages published, written to describe the system that actually ships.",
    unjected: "See the developer's site and listing.",
    stores: "Varies per app.",
  },
];

export default async function AlternativesPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <>
      <PageStructuredData path="/alternatives" name="Unjected alternative on the open web" description="Unjected holds 2.4 stars on the US App Store. Freeborn runs the same idea — values-aligned dating for health autonomy — on the open web: no install, no store gatekeeper, no paywalled basics." />
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
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

        <section className="mx-auto max-w-4xl px-5 pb-16 pt-10 sm:px-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-gold)]">
            An honest comparison · figures checked {VERIFIED_ON}
          </p>
          <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
            An Unjected alternative that lives on the open web
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[var(--color-pearl-dim)]">
            If you found values-aligned, health-autonomy dating through the app
            stores and left frustrated — by ratings, by paywalls, by bots or by a
            listing disappearing — this page is the straight comparison. Freeborn
            carries the same idea, dating for people who take health autonomy and
            natural living seriously, and runs it as a web platform: nothing to
            install, no store gatekeeper between you and your matches, and no
            paywall on the basics.
          </p>

          <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-ink)]/60">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-[var(--color-pearl-dim)]">
                  <th className="px-4 py-3 font-medium">Dimension</th>
                  <th className="px-4 py-3 font-medium text-[var(--color-gold)]">Freeborn</th>
                  <th className="px-4 py-3 font-medium">Unjected</th>
                  <th className="px-4 py-3 font-medium">App-store-only apps, generally</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dimension} className="border-b border-[var(--color-line)]/60 last:border-0">
                    <td className="px-4 py-3 align-top font-medium">{r.dimension}</td>
                    <td className="px-4 py-3 align-top text-[var(--color-pearl-dim)]">{r.freeborn}</td>
                    <td className="px-4 py-3 align-top text-[var(--color-pearl-dim)]">{r.unjected}</td>
                    <td className="px-4 py-3 align-top text-[var(--color-pearl-dim)]">{r.stores}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[var(--color-pearl-dim)]">
            Unjected figures: public US App Store listing data (2.4 average over 220
            ratings) retrieved {VERIFIED_ON} through Apple&apos;s public iTunes
            Search API; raw responses are kept in the project evidence directory.
            A US App Store search for &ldquo;Unjabbed&rdquo; on the same date returned
            no current listing, so this page makes no rating claim about it. Where a
            competitor fact could not be verified today, the cell says where to look
            instead of carrying a number.
          </p>

          <div className="mt-10 rounded-2xl border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/5 px-6 py-5">
            <h2 className="font-display text-xl">What this page will never do</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-pearl-dim)]">
              <li>No invented ratings or review markup about Freeborn — the platform publishes no star-rating or review-count structured data anywhere, on this page or any other.</li>
              <li>No member counts, no borrowed press logos, no manufactured scarcity.</li>
              <li>No undated competitor numbers: every third-party figure carries the date it was retrieved and gets re-checked whenever this page changes.</li>
            </ul>
          </div>

          <section className="mt-12">
            <h2 className="font-display text-2xl">Questions people actually ask</h2>
            <div className="mt-5 space-y-6">
              {faqs.map((f) => (
                <div key={f.q}>
                  <h3 className="font-medium text-[var(--color-pearl)]">{f.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-pearl-dim)]">{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link
              href="/auth"
              className="rounded-full bg-[var(--color-gold)] px-6 py-3 text-sm font-semibold text-[var(--color-night)] transition hover:opacity-90"
            >
              Create your profile
            </Link>
            <Link
              href="/safety"
              className="rounded-full border border-[var(--color-line)] px-6 py-3 text-sm text-[var(--color-pearl-dim)] transition hover:text-[var(--color-pearl)]"
            >
              Read how verification works
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
