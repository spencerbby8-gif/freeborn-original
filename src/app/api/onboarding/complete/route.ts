import { eligibilityError } from "@/lib/onboarding-data";
import {
  completeOnboarding,
  draftFromDb,
  ensureProfileRow,
} from "@/lib/onboarding-store";
import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";

export async function POST(request: Request) {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return Response.json({ error: "Sign in to continue onboarding." }, { status: 401 });
  }

  await ensureProfileRow(user.id, user.email, supabase);
  const draft = await draftFromDb(user.id, supabase);
  const problem = eligibilityError(draft);
  if (problem) {
    return Response.json({ error: problem }, { status: 400 });
  }

  await completeOnboarding(user.id, supabase);
  return Response.json({ ok: true });
}
