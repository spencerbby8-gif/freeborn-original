import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter } from "next/font/google";
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
      <body className="min-h-screen bg-[var(--color-night)] font-body text-[var(--color-pearl)] antialiased">
        {children}
      </body>
    </html>
  );
}
