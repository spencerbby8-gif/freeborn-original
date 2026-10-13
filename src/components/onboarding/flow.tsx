"use client";

import { useState } from "react";
import { Wordmark } from "@/components/wordmark";
import { VerifyBadge } from "@/components/verify-badge";
import {
  normalizeDraft,
  STEP_ORDER,
  type OnboardingDraft,
  type OnboardingStepName,
} from "@/lib/onboarding-data";
import { getAccessToken } from "@/lib/supabase/browser";
import { ProgressRail } from "@/components/onboarding/rail";
import { IdentityStep, IntentionsStep, LocationStep, WelcomeStep } from "./steps-a";
import { AboutStep, PhotosStep, VibeStep } from "./steps-b";

const TOTAL_STEPS = STEP_ORDER.length;

type OnboardingFlowProps = {
  initialDraft: OnboardingDraft;
  initialStep: OnboardingStepName;
};

export function OnboardingFlow({ initialDraft, initialStep }: OnboardingFlowProps) {
  const initialIndex = Math.max(0, STEP_ORDER.indexOf(initialStep));
  const [stepIndex, setStepIndex] = useState(Math.min(initialIndex, TOTAL_STEPS - 1));
  const [draft, setDraft] = useState<OnboardingDraft>(() => normalizeDraft(initialDraft));
  const [pending, setPending] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>("Ready");
  const [flowError, setFlowError] = useState<string | null>(null);
  /** Completion celebration — a brief "you're in" moment before the app opens. */
  const [celebrating, setCelebrating] = useState(false);

  const currentStep = STEP_ORDER[stepIndex];

  const goToStep = (index: number) => {
    const target = Math.max(0, Math.min(index, TOTAL_STEPS - 1));
    setStepIndex(target);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  const handleBack = () => goToStep(stepIndex - 1);

  /** Every Continue saves the correct step, then advances (or completes). */
  /** POST with one automatic retry — survives transient preview restarts. */
  const postWithRetry = async (url: string, headers: Record<string, string>, body: string) => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { method: "POST", headers, body });
        // Retry only on transport-level or upstream errors, not clean API errors.
        if (res.status >= 500 || res.status === 502 || res.status === 503 || res.status === 504) {
          lastError = new Error(`Upstream error (${res.status})`);
          await new Promise((r) => setTimeout(r, 1300));
          continue;
        }
        return res;
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 1300));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Network failure");
  };

  const saveAndAdvance = async (step: OnboardingStepName, patch: Partial<OnboardingDraft>) => {
    setPending(true);
    setSaveStatus("Saving…");
    setFlowError(null);
    setDraft((prev) => ({ ...prev, ...patch }));
    const token = await getAccessToken();
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    try {
      const res = await postWithRetry("/api/onboarding", headers, JSON.stringify({ step, patch }));
      if (res.status === 401) {
        setSaveStatus("Session expired");
        setFlowError("Your session expired mid-onboarding. Sign in again — your progress is saved up to this screen.");
        setPending(false);
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setSaveStatus("Save error");
        setFlowError(json?.error ?? "Could not save that step. Press Continue to try again.");
        setPending(false);
        return;
      }
      setSaveStatus("Saved");

      // Final screen: complete onboarding and enter the app.
      if (stepIndex >= TOTAL_STEPS - 1) {
        setSaveStatus("Finishing…");
        const done = await postWithRetry("/api/onboarding/complete", headers, "");
        if (done.status === 401) {
          setSaveStatus("Session expired");
          setFlowError("Your session expired mid-onboarding. Sign in again — your progress is saved up to this screen.");
          setPending(false);
          return;
        }
        const json = (await done.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!done.ok || !json?.ok) {
          setSaveStatus("Save error");
          setFlowError(json?.error ?? "Could not finish onboarding. Press the button to try again.");
          setPending(false);
          return;
        }
        /* Milestone moment (2026 onboarding research): celebrate the first
           meaningful action before the app opens — one breath, then in. */
        setCelebrating(true);
        window.setTimeout(() => window.location.assign("/app"), 1500);
        return;
      }

      goToStep(stepIndex + 1);
    } catch {
      setSaveStatus("Save error");
      setFlowError("The preview server blinked for a moment and the save didn't land. Press Continue once more — nothing was lost.");
    } finally {
      setPending(false);
    }
  };

  const common = {
    stepIndex,
    totalSteps: TOTAL_STEPS,
    draft,
    onBack: handleBack,
    onSave: (patch: Partial<OnboardingDraft>) => saveAndAdvance(currentStep, patch),
    pending,
    saveStatus,
  };

  const renderStep = () => {
    switch (currentStep) {
      case "welcome":
        return (
          <WelcomeStep
            stepIndex={stepIndex}
            totalSteps={TOTAL_STEPS}
            onSave={(patch) => saveAndAdvance("welcome", patch)}
            pending={pending}
            saveStatus={saveStatus}
          />
        );
      case "identity":
        return <IdentityStep {...common} />;
      case "location":
        return <LocationStep {...common} />;
      case "relationship_intent":
        return <IntentionsStep {...common} />;
      case "bio":
        return <AboutStep {...common} />;
      case "interests":
        return <VibeStep {...common} />;
      case "photos":
        return <PhotosStep {...common} />;
    }
  };

  if (celebrating) {
    return (
      <div className="animate-fade-in flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
        <span className="animate-scale-in flex h-20 w-20 items-center justify-center rounded-full border border-[var(--color-teal-500)]/40 bg-[var(--color-teal-500)]/10">
          <VerifyBadge size={40} />
        </span>
        <h1 className="fb-h-display">You&apos;re in.</h1>
        <p className="fb-meta max-w-[36ch]">
          Your profile is ready — the room is waiting. Welcome to Freeborn.
        </p>
        <div className="mt-2">
          <Wordmark size="sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <ProgressRail stepIndex={stepIndex} />
      {flowError ? (
        <div
          role="alert"
          className="animate-scale-in mb-5 flex items-start gap-3 rounded-2xl border border-[rgba(255,107,122,0.25)] bg-[rgba(255,107,122,0.08)] px-4 py-3.5 text-[13px] font-bold leading-5 text-red-200"
        >
          <span className="mt-0.5 flex h-2 w-2 shrink-0 rounded-full bg-red-400" />
          {flowError}
        </div>
      ) : null}
      {renderStep()}
    </div>
  );
}
