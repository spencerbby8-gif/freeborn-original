"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient, getAccessToken } from "@/lib/supabase/browser";
import type { OnboardingDraft, OnboardingStepName } from "@/lib/onboarding-data";
import { OnboardingFlow } from "@/components/onboarding/flow";

type GateState =
  | { phase: "loading" }
  | { phase: "ready"; draft: OnboardingDraft; initialStep: OnboardingStepName };

/**
 * Session gate that works without cookies: reads the Supabase session from
 * the browser client (localStorage), then pulls the draft via Bearer token.
 * If there is no session, the member goes back to the auth screen with an
 * explanation instead of a silent bounce.
 */
export function OnboardingGate() {
  const ran = useRef(false);
  const [state, setState] = useState<GateState>({ phase: "loading" });

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.replace("/auth?mode=sign-in&status=session-lost");
          return;
        }

        const token = await getAccessToken();
        const res = await fetch("/api/onboarding/state", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (res.status === 401) {
          window.location.replace("/auth?mode=sign-in&status=session-lost");
          return;
        }

        const json = (await res.json()) as {
          completed?: boolean;
          draft?: OnboardingDraft;
          initialStep?: OnboardingStepName;
        };

        if (json.completed) {
          // Finished members land in the app shell (tabs included), never on
          // the bare discovery page.
          window.location.replace("/app");
          return;
        }

        setState({
          phase: "ready",
          draft: json.draft ?? ({} as OnboardingDraft),
          initialStep: json.initialStep ?? "welcome",
        });
      } catch {
        window.location.replace("/auth?mode=sign-in&status=session-lost");
      }
    })();
  }, []);

  if (state.phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-24">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
      </div>
    );
  }

  return <OnboardingFlow initialDraft={state.draft} initialStep={state.initialStep} />;
}
