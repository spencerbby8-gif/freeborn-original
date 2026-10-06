import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";

export async function GET(request: Request) {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ error: "Not signed in." }, { status: 401 });

  const [profileRes, prefsRes, notifRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select(
        "display_name, city, region, bio, occupation, education, discoverable, is_verified, onboarding_stage"
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("discovery_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const profile = (profileRes.data ?? {}) as Record<string, unknown>;
  const prefs = (prefsRes.data ?? {}) as Record<string, unknown>;
  const notif = (notifRes.data ?? {}) as Record<string, unknown>;

  return Response.json({
    account: { email: user.email },
    profile: {
      displayName: profile.display_name ?? "",
      city: profile.city ?? "",
      region: profile.region ?? "",
      bio: profile.bio ?? "",
      occupation: profile.occupation ?? "",
      education: profile.education ?? "",
      discoverable: profile.discoverable ?? true,
      isVerified: profile.is_verified ?? false,
      stage: profile.onboarding_stage ?? "account_created",
    },
    discovery: {
      ageMin: prefs.age_min ?? 22,
      ageMax: prefs.age_max ?? 45,
      distanceKm: prefs.distance_km ?? 80,
      showGenders: prefs.show_genders ?? ["woman", "man", "non_binary"],
      verifiedOnly: prefs.verified_only ?? false,
      photosRequired: prefs.photos_required ?? true,
      vaccinationPreference: prefs.vaccination_preference ?? "any",
    },
    notifications: {
      matchAlerts: notif.match_alerts ?? true,
      messageAlerts: notif.message_alerts ?? true,
      likeAlerts: notif.like_alerts ?? true,
      profileActivity: notif.profile_activity ?? true,
    },
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { profile, discovery, notifications } = (body ?? {}) as {
    profile?: Record<string, unknown>;
    discovery?: Record<string, unknown>;
    notifications?: Record<string, unknown>;
  };

  try {
    if (profile) {
      const patch: Record<string, unknown> = {};
      if (typeof profile.displayName === "string") patch.display_name = profile.displayName.slice(0, 40);
      if (typeof profile.city === "string") patch.city = profile.city.slice(0, 60);
      if (typeof profile.region === "string") patch.region = profile.region.slice(0, 60);
      if (typeof profile.bio === "string") patch.bio = profile.bio.slice(0, 500);
      if (typeof profile.occupation === "string") patch.occupation = profile.occupation.slice(0, 80);
      if (typeof profile.education === "string") patch.education = profile.education.slice(0, 80);
      if (typeof profile.discoverable === "boolean") patch.discoverable = profile.discoverable;
      const { error } = await supabase.from("user_profiles").update(patch).eq("id", user.id);
      if (error) throw error;
    }

    if (discovery) {
      const patch: Record<string, unknown> = { user_id: user.id };
      if (typeof discovery.ageMin === "number") patch.age_min = Math.min(99, Math.max(18, discovery.ageMin));
      if (typeof discovery.ageMax === "number") patch.age_max = Math.min(99, Math.max(18, discovery.ageMax));
      if (typeof discovery.distanceKm === "number") patch.distance_km = Math.min(500, Math.max(5, discovery.distanceKm));
      if (Array.isArray(discovery.showGenders)) patch.show_genders = discovery.showGenders;
      if (typeof discovery.verifiedOnly === "boolean") patch.verified_only = discovery.verifiedOnly;
      if (typeof discovery.photosRequired === "boolean") patch.photos_required = discovery.photosRequired;
      if (
        discovery.vaccinationPreference === "any" ||
        discovery.vaccinationPreference === "vaccinated" ||
        discovery.vaccinationPreference === "unvaccinated"
      ) {
        patch.vaccination_preference = discovery.vaccinationPreference;
      }
      const { error } = await supabase
        .from("discovery_preferences")
        .upsert(patch, { onConflict: "user_id" });
      if (error) throw error;
    }

    if (notifications) {
      const patch: Record<string, unknown> = { user_id: user.id };
      if (typeof notifications.matchAlerts === "boolean") patch.match_alerts = notifications.matchAlerts;
      if (typeof notifications.messageAlerts === "boolean") patch.message_alerts = notifications.messageAlerts;
      if (typeof notifications.likeAlerts === "boolean") patch.like_alerts = notifications.likeAlerts;
      if (typeof notifications.profileActivity === "boolean") patch.profile_activity = notifications.profileActivity;
      const { error } = await supabase
        .from("notification_preferences")
        .upsert(patch, { onConflict: "user_id" });
      if (error) throw error;
    }

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Couldn't save settings: ${message}` }, { status: 500 });
  }
}
