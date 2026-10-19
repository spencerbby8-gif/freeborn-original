import { STEP_ORDER, type OnboardingDraft, type OnboardingStepName } from "@/lib/onboarding-data";
import { applyStepPatch, ensureProfileRow } from "@/lib/onboarding-store";
import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";
import { isUnderMinAge, MIN_AGE } from "@/lib/age";

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

  /* AGE GATE — server-side.

     The onboarding UI builds its birth-year dropdown starting at
     currentYear - 18 (src/components/onboarding/fields.tsx:391) and the copy
     says "Your birth date confirms you're 18+". But birth_date was passed
     straight through to the database (src/lib/onboarding-store.ts:295) with no
     validation here, none in /api/profile/me, and no CHECK constraint on the
     column — the only age constraint in the schema validated the PREFERENCE
     range, not the member's own age. A direct POST with birth_date '2012-01-01'
     was accepted and made the member discoverable.

     Three layers now: this 400, the UI dropdown, and the CHECK constraint in
     db/migrations/2026-10-16-min-age-check.sql. The constraint is the one no
     code path can bypass.

     Deliberately does not log the birth date itself — that is PII, and the
     fact that a rejection happened is the useful signal. */
  if (patch && patch.birth_date !== undefined && isUnderMinAge(patch.birth_date)) {
    console.error("[onboarding-age-gate] rejected under-18 birth_date", {
      user: user.id,
      step,
    });
    return Response.json(
      { error: `Freeborn is for members aged ${MIN_AGE} and over.` },
      { status: 400 },
    );
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
