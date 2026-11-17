import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { Fraunces, Inter } from "next/font/google";
import { ToastHost } from "@/components/toast-host";
import { absolute, CONTACT_EMAIL, OG_IMAGE, OPERATOR_NAME, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  /* metadataBase resolves EVERY relative canonical, Open Graph and Twitter URL in
     the app. It pointed at https://freeborn.app, a domain Freeborn does not own —
     verified 2026-10-19 to serve an unrelated site titled "Freeborn - Your
     privacy, your control" from Cloudflare. Every social preview and every
     canonical tag was therefore attributing this site to someone else's domain.
     It now derives from the single canonical constant in @/lib/site. */
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Freeborn · Dating for Medical Freedom & Natural Health",
    template: `%s · Freeborn`,
  },
  description:
    "Freeborn is a dating app for unvaccinated and vaccinated people alike. Browse, match, and connect, with an optional badge to help unvaccinated members find one another.",
  applicationName: SITE_NAME,
  keywords: [
    "medical freedom dating",
    "natural health dating app",
    "values aligned relationships",
    "intentional dating platform",
    "health autonomy matches",
    "holistic singles community",
    "natural wellness dating",
    "informed choice relationships",
    "serious relationship app",
    "Freeborn app",
  ],
  category: "Relationship Platform",
  /* No sitewide canonical default. Verified against a production build: pages
     without their own alternates.canonical inherited this one and emitted
     canonical=<homepage>, so /app, /auth, /appeal, /onboarding and /discover all
     told crawlers they were duplicates of the landing page. A canonical pointing
     from a noindex page at an indexable one is a contradictory signal Google
     documents against.
     Instead every INDEXABLE page declares its own canonical, and non-indexable
     pages declare none, which is the correct instruction for them. The indexable
     set is INDEXABLE_PATHS in @/lib/site, and it matches sitemap.ts exactly. */
  openGraph: {
    title: "Freeborn · Dating for Medical Freedom & Natural Health",
    description:
      "Values-aligned dating for health autonomy, natural living, and lasting love. Full profiles, clear intentions, privacy by default.",
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
    url: absolute("/"),
    /* The share card image, with declared dimensions and alt text — the three
       fields TikTok, Facebook and Google's own pages all emit and Freeborn had
       none of. Pages may override openGraph.images; none currently needs to. */
    images: [
      { url: OG_IMAGE.path, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: OG_IMAGE.alt },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Freeborn · Date Like You Mean It",
    description:
      "Values-aligned dating for health autonomy, natural living, and lasting love.",
    images: [
      { url: OG_IMAGE.path, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: OG_IMAGE.alt },
    ],
  },
  robots: {
    index: true,
    follow: true,
    /* TikTok ships max-image-preview:large on its GENERIC robots meta (Google's
       own pages likewise), because SERP image features and rich cards read the
       generic tag; the googleBot block below only overrides for Google. */
    "max-image-preview": "large",
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  /* Bing Webmaster Tools ownership proof. The owner supplied this code on
     2026-11-16, closing the B15 tap; Next renders it as
     <meta name="msvalidate.01" content="..."> in every served head. It is a
     public ownership token, not a secret — harness [32] pins it verbatim and
     seo-walk S11 proves it ships in the served bytes. */
  verification: {
    other: {
      "msvalidate.01": "21AFBB7C27303E2A2F4F26CC3D69B50F",
    },
  },
};

/**
 * Sitewide structured data.
 *
 * `Organization` tells search engines who operates the service, which matters for
 * E-E-A-T on a platform asking people to trust it with health and identity data.
 * `WebSite` makes the domain eligible for sitelinks searchbox treatment.
 *
 * Every value here is verifiable and none of it is inflated: no `aggregateRating`,
 * no `numberOfUsers`, no `award`, no `sameAs` pointing at social profiles that do
 * not exist. Fabricated structured data is a manual-action risk under Google's
 * spam policies, and the landing page's own trust ledger already commits to
 * "No invented match rates. No borrowed press logos." The structured data holds
 * the same line.
 */
const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: OPERATOR_NAME,
  alternateName: SITE_NAME,
  url: SITE_URL,
  email: CONTACT_EMAIL,
  description:
    "Operator of Freeborn, a values-aligned dating platform for people who prioritise health autonomy, natural living and long-term commitment.",
};

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  publisher: { "@type": "Organization", name: OPERATOR_NAME },
  inLanguage: "en",
};

/**
 * Supabase origin for the preconnect hint, read from the public env var so the
 * project reference is never hardcoded in source. Empty string means unset, and
 * the hint is simply omitted — the app still works, it just pays the TLS handshake
 * on first use instead of warming it.
 */
const supabaseOrigin = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
).replace(/\/$/, "");

// F9: a per-request CSP nonce only works if pages render per request.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#0a0d18",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    /* The two next/font variables have to reach the document root: globals.css
       declares `--font-display: var(--font-fraunces), …` and `--font-body:
       var(--font-inter), …`, and an undefined custom property invalidates the
       WHOLE font-family declaration at computed-value time — it does not fall
       through to the serif/system stacks that follow it. Without these classes
       every "display" heading on the site computed to the inherited sans stack,
       so Fraunces was downloaded and never used. */
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} bg-[var(--color-night)]`}
    >
      <head>
        {/* Installable web app (PWA) — web-first, no app-store dependency. */}
        <link rel="manifest" href="/manifest.json" />
        {/* Advertises the sitemap in-band, the way Google's own properties do, so
            a crawler that lands on any page finds the full URL inventory without
            having been told about robots.txt first. */}
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Freeborn" />
        {/* Static file rather than an inline script, so the CSP can use a nonce on
            script-src without needing 'unsafe-inline'. See public/sw-register.js. */}
        <script src="/sw-register.js" nonce={nonce} defer />
        {/* Speed layer: warm the connections before the first request needs
            them — auth calls, images, and the captcha start instantly.
            The Supabase origin comes from the environment rather than being
            hardcoded, so a project migration is a config change and not a
            source edit that can be forgotten in one of two deployments. */}
        {supabaseOrigin ? (
          <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
        ) : null}
        <link rel="dns-prefetch" href="https://realtime.supabase.co" />
        <link rel="dns-prefetch" href="https://challenges.cloudflare.com" />
        <link rel="dns-prefetch" href="https://ip-api.com" />
        {/* No hardcoded <link rel="canonical"> here. metadata.alternates.canonical
            already emits one, resolved against metadataBase, and a second tag with
            a different value would be a conflicting canonical. Every page sets its
            own canonical in its metadata export; the sitewide default is the root. */}
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
        />
      </head>
      <body className="min-h-screen bg-[var(--color-night)] font-body text-[var(--color-pearl)] antialiased">
        <ToastHost />
        {children}
      </body>
    </html>
  );
}
