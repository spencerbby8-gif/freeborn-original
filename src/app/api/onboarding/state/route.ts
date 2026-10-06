import { normalizeStepName, type OnboardingStepName } from "@/lib/onboarding-data";
import { draftFromDb, ensureProfileRow } from "@/lib/onboarding-store";
import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";

export async function GET(request: Request) {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const profile = await ensureProfileRow(user.id, user.email, supabase);
  if (!profile) {
    return Response.json({ error: "Could not load your profile." }, { status: 500 });
  }

  if (profile.onboarding_stage === "ready" || profile.onboarding_completed_at) {
    return Response.json({ completed: true });
  }

  const initialStep: OnboardingStepName = normalizeStepName(profile.onboarding_step);

  const draft = await draftFromDb(user.id, supabase);
  return Response.json({ completed: false, draft, initialStep });
}
