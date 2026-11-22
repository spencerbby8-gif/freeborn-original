import type { Metadata } from "next";
import { PrototypeFrame } from "@/components/prototype/frame";
import { OnboardingGate } from "@/components/onboarding/gate";

export const metadata: Metadata = {
  title: "Build your profile",
  description: "Freeborn onboarding: one focused step at a time.",
  robots: { index: false, follow: true },
};

/**
 * The session check happens client-side (OnboardingGate) so the flow works
 * even in browsers/contexts that block third-party cookies — the Supabase
 * session lives in localStorage and the APIs are called with Bearer tokens.
 */
export default function OnboardingPage() {
  return <PrototypeFrame hideTabs><div className="fb-onboarding"><OnboardingGate /></div></PrototypeFrame>;
}
