import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ogCard, SITE_NAME } from "@/lib/site";
import { findCityPage } from "@/lib/city-pages";
import { PageStructuredData } from "@/components/seo/page-structured-data";

/**
 * Gated city page (B18). Renders ONLY when the live, QA-excluded, completed-
 * onboarding count for this city in an allowed region reaches the threshold in
 * src/lib/city-pages.ts; otherwise notFound(). The sentence below therefore
 * cannot overstate: the band comes from the same query that decided the page
 * exists, and the check date is the render date (cached one hour).
 */
export const revalidate = 3600;

type Params = Promise<{ country: string; city: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { country, city } = await params;
  const page = await findCityPage(country, city);
  if (!page) return { robots: { index: false, follow: true } };
  const title = `${page.city}, ${page.countryName} singles on Freeborn`;
  const description = `${page.band} members who finished onboarding call ${page.city} home on ${SITE_NAME} — values-aligned dating for health autonomy and natural living, on the open web.`;
  return {
    title,
    description,
    alternates: { canonical: page.path },
    robots: { index: true, follow: true },
    openGraph: ogCard(page.path, `${title} · Freeborn`, description),
  };
}

export default async function CityPageRoute({ params }: { params: Params }) {
  const { country, city } = await params;
  const page = await findCityPage(country, city);
  if (!page) notFound();
  const checked = new Date().toISOString().slice(0, 10);
  const description = `${page.band} members who finished onboarding call ${page.city} home on ${SITE_NAME} — values-aligned dating for health autonomy and natural living, on the open web.`;
  return (
    <>
      <PageStructuredData path={page.path} name={`${page.city}, ${page.countryName} singles on Freeborn`} description={description} />
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
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-gold)]">
            A real community, counted honestly · checked {checked}
          </p>
          <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
            {page.city}, {page.countryName} singles on Freeborn
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[var(--color-pearl-dim)]">
            Between <strong className="text-[var(--color-pearl)]">{page.band} members</strong> who
            finished onboarding call {page.city} home on Freeborn as of {checked}. This page
            exists because that count is real: Freeborn publishes a city page only
            when completed memberships in the region reach five, and it prints a
            band rather than an exact number so a small community stays private.
          </p>

          <div className="mt-10 rounded-2xl border border-[var(--color-line)] bg-[var(--color-ink)]/60 px-6 py-5">
            <h2 className="font-display text-xl text-[var(--color-pearl)]">How this number is counted</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-pearl-dim)]">
              <li>Finished onboardings only — abandoned sign-ups do not count.</li>
              <li>Test and QA accounts are excluded inside the count query itself.</li>
              <li>Cities below five real members get no page at all: no empty rooms, ever.</li>
              <li>The count re-checks hourly; the date above is the render date.</li>
            </ul>
          </div>

          <div className="mt-10 space-y-6 text-[15px] leading-relaxed text-[var(--color-pearl-dim)]">
            <p>
              What those members get is the same everywhere: pose-mimic selfie
              verification, dual-model moderation, free matching and messaging with
              photos, voice notes and browser calls, and privacy, cookie and terms
              pages written against the system that actually ships.
            </p>
            <p>
              Looking wider than {page.city}? The guides cover meeting like-minded
              people without app-store apps, making long-distance work, and spotting
              romance scams before they start.
            </p>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link
              href="/auth?mode=sign-up"
              className="rounded-full bg-[var(--color-gold)] px-6 py-3 text-sm font-semibold text-[var(--color-night)] transition hover:opacity-90"
            >
              Join Freeborn in {page.city}
            </Link>
            <Link
              href="/guides"
              className="rounded-full border border-[var(--color-line)] px-6 py-3 text-sm transition hover:text-[var(--color-pearl)]"
            >
              Read the guides
            </Link>
          </div>
        </article>
      </main>
    </>
  );
}
