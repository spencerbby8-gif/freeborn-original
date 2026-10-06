import type { Metadata } from "next";
import { Wordmark } from "@/components/wordmark";
import { OnboardingGate } from "@/components/onboarding/gate";

export const metadata: Metadata = {
  title: "Build your profile",
  description: "Freeborn onboarding — one focused step at a time.",
  robots: { index: false, follow: true },
};

/**
 * The session check happens client-side (OnboardingGate) so the flow works
 * even in browsers/contexts that block third-party cookies — the Supabase
 * session lives in localStorage and the APIs are called with Bearer tokens.
 */
export default function OnboardingPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col justify-between bg-[var(--color-night)] text-[var(--color-pearl)] selection:bg-[var(--color-gold-500)]/20 selection:text-[var(--color-gold-300)]">
      <header className="mx-auto flex w-full max-w-[760px] items-center justify-between px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
        <Wordmark size="md" />
      </header>

      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-4 py-6 sm:px-6 sm:py-8">
        <OnboardingGate />
      </main>

      <footer className="mx-auto w-full max-w-[760px] px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="border-t border-white/5 pt-4 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--color-ash)]">
          Freeborn · Values before volume
        </div>
      </footer>
    </div>
  );
}
