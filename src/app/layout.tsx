import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter } from "next/font/google";
import { ToastHost } from "@/components/toast-host";
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
  metadataBase: new URL("https://freeborn.app"),
  title: {
    default: "Freeborn · Dating for Medical Freedom & Natural Health",
    template: `%s · Freeborn`,
  },
  description:
    "Freeborn is the relationship platform for people who value health autonomy, natural wellness, and intentional long-term commitment. Meet values-aligned singles who respect informed choice.",
  applicationName: "Freeborn",
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
  openGraph: {
    title: "Freeborn · Dating for Medical Freedom & Natural Health",
    description:
      "Values-aligned dating for health autonomy, natural living, and lasting love. Full profiles, clear intentions, privacy by default.",
    siteName: "Freeborn",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Freeborn — Date Like You Mean It",
    description:
      "Values-aligned dating for health autonomy, natural living, and lasting love.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0d18",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="bg-[var(--color-night)]">
      <head>
        {/* Installable web app (PWA) — web-first, no app-store dependency. */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Freeborn" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              'if ("serviceWorker" in navigator) { window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); }); }',
          }}
        />
        {/* Speed layer: warm the connections before the first request needs
            them — auth calls, images, and the captcha start instantly. */}
        <link rel="preconnect" href="https://ihwtpwlszegrjgakqsxx.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://realtime.supabase.co" />
        <link rel="preconnect" href="https://images.pexels.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://challenges.cloudflare.com" />
        <link rel="dns-prefetch" href="https://ip-api.com" />
      </head>
      <body className="min-h-screen bg-[var(--color-night)] font-body text-[var(--color-pearl)] antialiased">
        <ToastHost />
        {children}
      </body>
    </html>
  );
}
