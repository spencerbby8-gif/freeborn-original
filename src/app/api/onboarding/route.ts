import { STEP_ORDER, type OnboardingDraft, type OnboardingStepName } from "@/lib/onboarding-data";
import { applyStepPatch, ensureProfileRow } from "@/lib/onboarding-store";
import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";

export async function POST(request: Request) {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return Response.json({ error: "Sign in to continue onboarding." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { step, patch } = (body ?? {}) as {
    step?: string;
    patch?: Partial<OnboardingDraft>;
  };

  if (!step || !(STEP_ORDER as readonly string[]).includes(step)) {
    return Response.json({ error: "Unknown onboarding step." }, { status: 400 });
  }

  try {
    await ensureProfileRow(user.id, user.email, supabase);
    const nextStep = await applyStepPatch(
      user.id,
      user.email,
      step as OnboardingStepName,
      patch ?? {},
      supabase
    );
    return Response.json({ ok: true, step: nextStep });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown save failure";
    console.error("[onboarding-save]", step, message);
    return Response.json(
      { error: `Couldn't save that step: ${message}` },
      { status: 500 }
    );
  }
}
