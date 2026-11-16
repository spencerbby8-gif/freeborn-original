import type { ReactNode } from "react";
import Link from "next/link";
import { absolute } from "@/lib/site";
import { PageStructuredData } from "@/components/seo/page-structured-data";

/**
 * Shared shell for the honest guides cluster (B17).
 *
 * Every guide renders through here so the SEO and honesty invariants hold in
 * one place: per-page WebPage + BreadcrumbList markup, an FAQPage block derived
 * from the SAME faqs array the page renders (the house rule from the landing
 * page), a visible "checked against the codebase on" date stamp, and a closing
 * honesty note slot. Guide copy is allowed to contain advice (opinion, clearly
 * framed) and codebase-verifiable facts about Freeborn — nothing else. The
 * harness pins the banned-claim vocabulary across every file in src/app/guides.
 */
export function GuidePage({
  path,
  title,
  eyebrow,
  updated,
  description,
  faqs = [],
  children,
}: {
  path: string;
  title: string;
  eyebrow: string;
  updated: string;
  description: string;
  faqs?: { q: string; a: string }[];
  children: ReactNode;
}) {
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
      <PageStructuredData path={path} name={title} description={description} />
      {faqs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }}
        />
      )}
      <main className="night-field min-h-[100dvh]">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
          <Link href="/" className="transition hover:opacity-80">
            <span className="font-display text-2xl tracking-tight">Freeborn</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-[var(--color-pearl-dim)]">
            <Link href="/guides" className="transition hover:text-[var(--color-pearl)]">Guides</Link>
            <Link href="/safety" className="transition hover:text-[var(--color-pearl)]">Safety</Link>
            <Link href="/auth" className="transition hover:text-[var(--color-pearl)]">Sign in</Link>
          </nav>
        </header>

        <article className="mx-auto max-w-3xl px-5 pb-20 pt-8 sm:px-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-gold)]">{eyebrow}</p>
          <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-3 text-xs text-[var(--color-pearl-dim)]">
            Freeborn guide · checked against the shipping codebase on {updated} ·{" "}
            <Link href={path} className="underline decoration-[var(--color-line)] underline-offset-4">
              {absolute(path).replace("https://", "")}
            </Link>
          </p>
          <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[var(--color-pearl-dim)]">
            {children}
          </div>

          {faqs.length > 0 && (
            <section className="mt-12 border-t border-[var(--color-line)] pt-8">
              <h2 className="font-display text-2xl text-[var(--color-pearl)]">Quick answers</h2>
              <div className="mt-5 space-y-6">
                {faqs.map((f) => (
                  <div key={f.q}>
                    <h3 className="font-medium text-[var(--color-pearl)]">{f.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed">{f.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link
              href="/auth?mode=sign-up"
              className="rounded-full bg-[var(--color-gold)] px-6 py-3 text-sm font-semibold text-[var(--color-night)] transition hover:opacity-90"
            >
              Create your profile
            </Link>
            <Link
              href="/safety"
              className="rounded-full border border-[var(--color-line)] px-6 py-3 text-sm transition hover:text-[var(--color-pearl)]"
            >
              How Freeborn keeps the room real
            </Link>
          </div>
        </article>
      </main>
    </>
  );
}
