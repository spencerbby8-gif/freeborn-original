/* ==========================================================================
   FREEBORN — PREMIUM ONBOARDING DATA MODEL
   Ported from @freeborn/shared (data.ts, validation.ts, types.ts).
   ========================================================================== */

export type PhotoDraft = {
  id: string;
  src: string; // downscaled JPEG data URL, 4:5 center-cropped
  isCover: boolean;
};

export type VerificationDraft = {
  status: "none" | "submitted";
  selfie?: string;
  submittedAt?: string;
};

export type OnboardingDraft = {
  display_name: string;
  birth_date: string;
  gender: string;
  city: string;
  region: string;
  country_code: string;
  location_source: "manual" | "gps";
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  bio: string;
  relationship_goals: string[];
  values: string[];
  interests: string[];
  lifestyle_preferences: string[];
  deal_breakers: string[];
  occupation: string;
  education: string;
  vaccinationStatus: string;
  age_min: number;
  age_max: number;
  distance_km: number;
  show_genders: string[];
  relationship_intents: string[];
  verified_only: boolean;
  photos_required: boolean;
  photos: PhotoDraft[];
  verification: VerificationDraft;
};

export const EMPTY_DRAFT: OnboardingDraft = {
  display_name: "",
  birth_date: "",
  gender: "",
  city: "",
  region: "",
  country_code: "",
  location_source: "manual",
  latitude: null,
  longitude: null,
  accuracy_m: null,
  bio: "",
  relationship_goals: [],
  values: [],
  interests: [],
  lifestyle_preferences: [],
  deal_breakers: [],
  occupation: "",
  education: "",
  vaccinationStatus: "prefer_not_to_say",
  age_min: 21,
  age_max: 40,
  distance_km: 80,
  show_genders: [],
  relationship_intents: [],
  verified_only: false,
  photos_required: true,
  photos: [],
  verification: { status: "none" },
};

export function normalizeDraft(raw: unknown): OnboardingDraft {
  if (!raw || typeof raw !== "object") return EMPTY_DRAFT;
  return { ...EMPTY_DRAFT, ...(raw as Partial<OnboardingDraft>) };
}

/* --- Step order & meta (premiumOnboardingStepOrder) -------------------- */

/**
 * The 7-screen onboarding. Step names stay inside the Freeborn
 * user_profiles.onboarding_step constraint (from the Supabase migrations);
 * the finer controls (discovery preferences, deal breakers, verification)
 * live in settings after onboarding.
 */
export const STEP_ORDER = [
  "welcome",
  "identity",
  "location",
  "relationship_intent", // intentions + values
  "bio", // bio + optional work/education
  "interests", // lifestyle + interests
  "photos", // photo foundation → completes onboarding
] as const;

export type OnboardingStepName = (typeof STEP_ORDER)[number];

export const STEP_META: Array<{
  step: OnboardingStepName;
  label: string;
  description: string;
}> = [
  { step: "welcome", label: "Welcome", description: "A calm overview before your profile starts taking shape." },
  { step: "identity", label: "Identity", description: "Name, age gate, and gender in one focused moment." },
  { step: "location", label: "Location", description: "One tap for your city — GPS or manual, your choice." },
  { step: "relationship_intent", label: "Intentions", description: "What you're looking for and the values you stand on." },
  { step: "bio", label: "About you", description: "A short human introduction — safety-checked before saving." },
  { step: "interests", label: "Your vibe", description: "How you live and what starts a conversation." },
  { step: "photos", label: "Photos", description: "Your photo foundation — then you're in." },
];

/** Maps legacy 12-step progress onto the 7-screen journey. */
export function normalizeStepName(raw: string): OnboardingStepName {
  if ((STEP_ORDER as readonly string[]).includes(raw)) {
    return raw as OnboardingStepName;
  }
  switch (raw) {
    case "values":
      return "relationship_intent";
    case "lifestyle":
    case "interests_lifestyle":
      return "interests";
    case "about_you":
    case "bio_goals":
      return "bio";
    case "discovery_preferences":
    case "verification":
    case "finish":
    case "complete":
    case "preferences_extras":
      return "photos";
    default:
      return "welcome";
  }
}

/* --- Options (ported from shared/src/data.ts) --------------------------- */

export const genderOptions = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "non_binary", label: "Non-binary" },
  { value: "genderqueer", label: "Genderqueer" },
  { value: "genderfluid", label: "Genderfluid" },
  { value: "agender", label: "Agender" },
  { value: "two_spirit", label: "Two-Spirit" },
  { value: "prefer_to_self_describe", label: "Prefer to self-describe" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const relationshipGoalOptions = [
  { value: "long_term", label: "Long-term relationship", caption: "Building something serious and lasting." },
  { value: "life_partner", label: "Life partner", caption: "Ready to share a full life together." },
  { value: "meaningful_connection", label: "Meaningful connection", caption: "Open to wherever depth leads." },
  { value: "still_exploring", label: "Still exploring", caption: "Taking my time with clarity." },
];

export const lifestyleOptions = [
  "Health autonomy", "Natural living", "Low-tox home", "Organic food", "Homeschool curious",
  "Family-minded", "Faith-friendly", "Early bird", "Night owl", "Homebody", "Social butterfly",
  "Adventurous", "Routine-oriented", "Spontaneous", "Planner", "Fitness-focused",
  "Ingredient-conscious", "Homesteading", "Regenerative food", "Outdoorsy", "City lover",
  "Vegetarian", "Vegan", "Flexitarian", "Coffee snob", "Tea drinker", "Wine lover",
  "Sober curious", "Non-drinker", "Non-smoker", "Natural wellness", "Informed health choices",
  "Spiritual", "Religious", "Secular", "Dog person", "Cat person", "Plant parent",
  "Minimalist", "Digital nomad", "Career-focused", "Side projects",
  "Gym & training", "Beach life", "Country living", "Big city energy", "Entrepreneur",
  "Content creator", "Savings-minded", "Big family energy", "Quiet evenings", "Sunday service",
  "Market days", "Road tripper", "Pet-free", "Work-from-home", "Still building my rhythm",
];

export const valueOptions = [
  "Medical freedom", "Health autonomy", "Informed consent", "Natural health", "Holistic wellness",
  "Herbal remedies", "Traditional food", "Low-tox living", "Family values", "Faith",
  "Personal sovereignty", "Self-reliance", "Community", "Environmental stewardship",
  "Regenerative agriculture", "Homeschooling", "Home birth", "Nutritional freedom", "Body autonomy",
  "Honesty", "Loyalty", "Kindness", "Hard work", "Generosity", "Respect",
  "Privacy", "Gratitude", "Discipline", "Forgiveness",
];

export const interestOptions = [
  "Natural health", "Medical freedom", "Holistic wellness", "Herbal remedies", "Homesteading",
  "Regenerative farming", "Farmers markets", "Traditional food", "Travel", "Cooking", "Hiking",
  "Reading", "Photography", "Music", "Art", "Yoga", "Dancing", "Running", "Cycling", "Gardening",
  "Dogs", "Cats", "Coffee", "Baking", "Pottery", "Design", "Meditation", "Journaling",
  "Museums", "Concerts", "Board games", "Tennis", "Swimming", "Rock climbing", "Film", "Writing",
  "Camping", "Fishing", "Basketball", "Football", "Gym sessions", "Beach days", "Road trips",
  "Thrifting", "Fashion", "Podcasts", "Anime", "Gaming", "Crafting", "DIY & building",
  "Afrobeats", "Gospel music", "Worship", "Small business", "Investing", "Volunteering",
];

export const occupationOptions = [
  "Student",
  "Entrepreneur",
  "Business owner",
  "Nurse",
  "Doctor / healthcare",
  "Teacher",
  "Engineer",
  "Software / tech",
  "Designer",
  "Farmer / agriculture",
  "Chef / cook",
  "Tradesperson",
  "Lawyer",
  "Accountant / finance",
  "Artist",
  "Writer",
  "Content creator",
  "Marketing / sales",
  "Real estate",
  "Hospitality",
  "Military / first responder",
  "Homemaker",
  "Retired",
];

export const educationOptions = [
  "High school",
  "Trade / technical school",
  "Some college",
  "Associate degree",
  "Bachelor's degree",
  "Master's degree",
  "Doctorate / professional",
  "Self-taught",
  "Homeschooled",
  "Still studying",
  "Prefer not to say",
];

export const dealBreakerOptions = [
  "Health coercion", "Disrespect for medical freedom", "Mocking natural health",
  "No long-term intention", "Smoking", "Dishonesty", "Poor communication",
  "Different life goals", "Long distance", "Drama", "Jealousy", "Controlling behavior",
  "Different values", "Medical pressure", "No sense of humor", "Passive aggression",
  "Disrespectful", "Unreliable", "Non-monogamous", "Wants kids", "Doesn't want kids",
  "Cheating", "Addiction", "Anger issues", "Love games", "Silent treatment",
  "Rude to others", "Laziness", "Always online", "Financial secrecy",
];

export const onboardingFieldHints: Record<string, string> = {
  display_name: "First name or a name you go by. Last names stay private.",
  birth_date: "Used only to confirm you are 18+. Only your age is shown publicly.",
  gender: "Shown on your profile so discovery can respect your preferences.",
  city: "Shown publicly as city and region — never your exact address.",
  bio: "Short and human. No contact details — Freeborn keeps those private.",
  deal_breakers: "Optional, but honest boundaries save everyone time.",
  occupation: "Optional — helps people understand your world.",
  education: "Optional — share as much or as little as you like.",
  lifestyle_preferences: "Choose the cues that actually shape your days.",
};

/* --- Validation (mirrors shared/src/auth/validation.ts zod schemas) ----- */

/* Re-exported from the single implementation in src/lib/age.ts.

   This file previously had its OWN copy, and it was subtly different from the
   other three: it computed age in LOCAL time (new Date(y, m-1, d) and
   now.getFullYear()) while /api/profiles, /api/profile/[id] and
   /api/profile/me all used UTC. Near a birthday the same member could be
   reported as two different ages depending on which code path ran. Netlify
   runs in UTC so production was unaffected, but local dev was not.

   Kept as a re-export so existing importers of this module are unaffected.
   Imported AND re-exported (not `export ... from`) because validateIdentity
   below calls it locally, and a bare re-export does not bind the name in this
   module's scope. */
import { ageFromBirthDate } from "@/lib/age";
export { ageFromBirthDate };

export type StepErrors = Record<string, string>;

export function validateIdentity(d: { display_name: string; birth_date: string; gender: string }) {
  const errors: StepErrors = {};
  const name = d.display_name.trim();
  if (name.length < 2 || name.length > 30) {
    errors.display_name = "Add a display name between 2 and 30 characters.";
  }
  const age = ageFromBirthDate(d.birth_date);
  if (age === null) errors.birth_date = "Choose your date of birth.";
  else if (age < 18) errors.birth_date = "Freeborn is for adults. Members must be 18 or older.";
  if (!d.gender) errors.gender = "Choose how you identify.";
  return errors;
}

export function validateLocation(d: { city: string }) {
  const errors: StepErrors = {};
  if (d.city.trim().length < 2) errors.city = "Enter your city so discovery can work.";
  return errors;
}

export function validateCount(
  items: string[],
  min: number,
  max: number,
  tooFew: string,
  tooMany: string
): string | null {
  if (items.length < min) return tooFew;
  if (items.length > max) return tooMany;
  return null;
}

export function validateBio(bio: string): string | null {
  const value = bio.trim();
  if (value.length < 20) return "Write at least 20 characters so people get a real sense of you.";
  if (value.length > 500) return "Keep your bio under 500 characters.";
  return null;
}

/* --- Safety checks (ported detectUnsafeContactDetails) ------------------- */

export type SafetyIssue = { type: string; match: string };

const safetyPatterns: Array<{ type: string; regex: RegExp }> = [
  { type: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: "phone", regex: /\+?\d[\d\s().-]{7,}\d/g },
  { type: "url", regex: /\b(?:https?:\/\/|www\.)\S+|[a-z0-9-]+\.(?:com|net|org|io|co|me|app|link|bio)\b/gi },
  { type: "social_handle", regex: /(?:^|\s)[@][a-z0-9_.]{3,}\b/gi },
];

export function detectUnsafeContactDetails(value: string): SafetyIssue[] {
  if (!value) return [];
  const issues: SafetyIssue[] = [];
  for (const pattern of safetyPatterns) {
    const matches = value.match(pattern.regex);
    if (matches) {
      for (const match of matches) issues.push({ type: pattern.type, match: match.trim() });
    }
  }
  return issues;
}

export function explainUnsafeContactDetails(issues: SafetyIssue[]): string {
  const types = [...new Set(issues.map((i) => i.type))];
  const names = types
    .map((t) =>
      t === "email" ? "email addresses" : t === "phone" ? "phone numbers" : t === "url" ? "links" : "social handles"
    )
    .join(", ");
  return `Your text looks like it contains ${names}. Freeborn removes contact details from bios so members stay safe and conversations happen in-app.`;
}

/* --- Completion eligibility (mirrors finish-step logic) ------------------ */

export function completionItems(draft: OnboardingDraft) {
  return [
    { label: "Identity", done: Boolean(draft.display_name && draft.birth_date && draft.gender) },
    { label: "Public city", done: Boolean(draft.city) },
    { label: "Intentions", done: draft.relationship_goals.length > 0 },
    { label: "Values", done: draft.values.length > 0 },
    { label: "Bio", done: draft.bio.trim().length >= 20 },
    { label: "Lifestyle & interests", done: draft.lifestyle_preferences.length > 0 && draft.interests.length >= 3 },
    { label: "Photos", done: draft.photos.length > 0 },
  ];
}

export function eligibilityError(draft: OnboardingDraft): string | null {
  const items = completionItems(draft);
  const missing = items.filter((i) => !i.done).map((i) => i.label);
  if (missing.length === 0) return null;
  return `Complete these before entering Freeborn: ${missing.join(", ")}.`;
}
