"use client";

import { FreebornLoader } from "@/components/ui/freeborn-loader";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient, getAccessToken } from "@/lib/supabase/browser";
import { announceAuthEntryReady, retargetAuthEntry } from "@/lib/auth/entry-toast";
import { STEP_ORDER, type OnboardingDraft, type OnboardingStepName } from "@/lib/onboarding-data";
import { OnboardingFlow } from "@/components/onboarding/flow";

type GateState =
  | { phase: "loading" }
  | { phase: "error" }
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

        /* One probe = "does this device still hold a usable session?". A null
           answer means no client user OR a 401 from the state route. */
        let memberId: string | null = null;
        const probe = async (): Promise<Response | null> => {
          const {
            data: { user }, error,
          } = await supabase.auth.getUser();
          if (error && (!error.status || error.status >= 500 || error.status === 429)) throw error;
          if (!user) return null;
          memberId = user.id;
          const token = await getAccessToken();
          const res = await fetch("/api/onboarding/state", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          return res.status === 401 ? null : res;
        };

        let res = await probe();
        if (!res) {
          /* A token caught mid-refresh is not a lost session: try ONE silent
             refresh before bouncing the member to the auth screen. Without
             this, refresh races read as "session-lost" and contribute to the
             auth/gate redirect ping-pong. */
          await supabase.auth.refreshSession().catch(() => undefined);
          res = await probe();
        }

        if (!res) {
          window.location.replace("/auth?mode=sign-in&status=session-lost");
          return;
        }

        // A non-401 service error is not an empty draft or a lost session.
        // Do not let a failed response silently initialize onboarding.
        if (!res.ok) {
          setState({ phase: "error" });
          return;
        }

        const json = (await res.json()) as {
          completed?: boolean;
          draft?: OnboardingDraft;
          initialStep?: OnboardingStepName;
        };

        if (typeof json?.completed !== "boolean" || (!json.completed &&
            (!json.draft || typeof json.draft !== "object" || Array.isArray(json.draft) ||
              !STEP_ORDER.includes(json.initialStep as OnboardingStepName)))) {
          setState({ phase: "error" });
          return;
        }

        if (json.completed) {
          // Finished members land in the app shell (tabs included), never on
          // the bare discovery page.
          if (memberId) retargetAuthEntry(memberId, "/onboarding", "/app");
          window.location.replace("/app");
          return;
        }

        if (memberId) announceAuthEntryReady(memberId);
        setState({
          phase: "ready",
          draft: json.draft ?? ({} as OnboardingDraft),
          initialStep: json.initialStep ?? "welcome",
        });
      } catch {
        // Network, malformed responses and temporary Auth outages are not
        // evidence that the member signed out.
        setState({ phase: "error" });
      }
    })();
  }, []);

  if (state.phase === "loading") {
    return (
      <FreebornLoader label="Restoring your profile setup"/>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--color-night)] px-6 text-center text-[var(--color-pearl)]" role="alert">
        <h1 className="text-xl font-semibold">We couldn’t load your setup</h1>
        <p className="max-w-md text-sm text-[var(--color-mist)]">Your session or setup may be temporarily unavailable. Please try again.</p>
        <button type="button" className="btn-ember px-6 py-3" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  return <OnboardingFlow initialDraft={state.draft} initialStep={state.initialStep} />;
}
