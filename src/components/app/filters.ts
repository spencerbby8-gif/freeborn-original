export type HomeFilters = {
  vax: string; // any | vaccinated | unvaccinated
  distance: number; // 500 = Anywhere
  ageMin: number;
  ageMax: number;
  genders: string[]; // empty = everyone
  verifiedOnly: boolean;
  onlineOnly: boolean;
  lifestyle: string[]; // match any
  interests: string[]; // match any
  intents: string[]; // match any
  occupations: string[];
  educations: string[];
  religions: string[];
  marital: string[];
  kids: string[];
  drinking: string[];
  smoking: string[];
  languages: string[];
  wantsKids: string[];
  /** Joined in the last 14 days. The badge already existed; the filter did not. */
  newOnly: boolean;
  /** Members who asked for a mixer in their city. */
  mixersOnly: boolean;
  /** "default" defers to the saved Require photos preference, so turning it off
      here is a choice about this search and not a change to the account. */
  photos: "default" | "yes" | "no";
};

export const DEFAULT_FILTERS: HomeFilters = {
  vax: "any",
  distance: 500,
  ageMin: 18,
  ageMax: 99,
  genders: [],
  verifiedOnly: false,
  onlineOnly: false,
  lifestyle: [],
  interests: [],
  intents: [],
  occupations: [],
  educations: [],
  religions: [],
  marital: [],
  kids: [],
  drinking: [],
  smoking: [],
  languages: [],
  wantsKids: [],
  newOnly: false,
  mixersOnly: false,
  photos: "default",
};

export type FacetCount = { stated: number; values: Record<string, number> };

/** What the room actually contains, counted before any of the viewer's filters.
 *  Sent by GET /api/profiles alongside the cards, and on its own when the request
 *  carries facetsOnly=1. */
export type RoomFacets = {
  total: number;
  withPhoto: number;
  verified: number;
  newMembers: number;
  openToMixers: number;
  activeToday: number;
  gender: FacetCount;
  occupation: FacetCount;
  religion: FacetCount;
  marital: FacetCount;
  kids: FacetCount;
  wantsKids: FacetCount;
  drinking: FacetCount;
  smoking: FacetCount;
  language: FacetCount;
  education: FacetCount;
  lifestyle: FacetCount;
  interests: FacetCount;
  intents: FacetCount;
};

export const FILTERS_KEY = "freeborn.filters";
export const FILTERS_EVENT = "freeborn-filters-changed";

// Search choices may reveal health, religion or orientation. Keep the live
// panel in memory, never write that object to localStorage/sessionStorage.
// Standing account preferences remain persisted by the authenticated settings API.
let liveFilters: HomeFilters | null = null;
function removeLegacyFilters(){
  if(typeof window==='undefined')return;
  try{window.localStorage.removeItem(FILTERS_KEY);}catch{/* storage can be disabled */}
}
export function loadFilters(): HomeFilters {
  removeLegacyFilters();
  return structuredClone(liveFilters ?? DEFAULT_FILTERS);
}
export function hasSavedFilters(): boolean {
  removeLegacyFilters();
  return liveFilters !== null;
}
export function saveFilters(filters: HomeFilters) {
  if(typeof window==='undefined')return;
  removeLegacyFilters();
  liveFilters = structuredClone(filters);
  window.dispatchEvent(new Event(FILTERS_EVENT));
}

export function hasActiveFilters(f: HomeFilters): boolean {
  return (
    f.vax !== "any" ||
    f.distance < 500 ||
    f.ageMin > 18 ||
    f.ageMax < 99 ||
    f.genders.length > 0 ||
    f.verifiedOnly ||
    f.onlineOnly ||
    f.lifestyle.length > 0 ||
    f.interests.length > 0 ||
    f.intents.length > 0 ||
    f.occupations.length > 0 ||
    f.educations.length > 0 ||
    f.religions.length > 0 ||
    f.marital.length > 0 ||
    f.kids.length > 0 ||
    f.drinking.length > 0 ||
    f.smoking.length > 0 ||
    f.languages.length > 0 ||
    f.wantsKids.length > 0 ||
    f.newOnly ||
    f.mixersOnly ||
    f.photos !== "default"
  );
}

/** Build the query string for /api/profiles. Only caps that actually restrict are sent. */
export function buildProfileParams(
  f: HomeFilters,
  origin: { lat: number; lng: number } | null
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("vax", f.vax);
  params.set("verified", f.verifiedOnly ? "1" : "0");
  params.set("ageMin", String(f.ageMin));
  params.set("ageMax", String(f.ageMax));
  params.set("gender", f.genders.join(","));
  params.set("intent", f.intents.join(","));
  params.set("distance", String(f.distance));
  if (f.onlineOnly) params.set("online", "1");
  if (f.lifestyle.length) params.set("lifestyle", f.lifestyle.join(","));
  if (f.interests.length) params.set("interests", f.interests.join(","));

  if (f.occupations.length) params.set("occupation", f.occupations.join(","));
  if (f.educations.length) params.set("education", f.educations.join(","));
  if (f.religions.length) params.set("religion", f.religions.join(","));
  if (f.marital.length) params.set("marital", f.marital.join(","));
  if (f.kids.length) params.set("kids", f.kids.join(","));
  if (f.drinking.length) params.set("drinking", f.drinking.join(","));
  if (f.smoking.length) params.set("smoking", f.smoking.join(","));
  if (f.languages.length) params.set("language", f.languages.join(","));
  if (f.wantsKids.length) params.set("wantsKids", f.wantsKids.join(","));
  if (f.newOnly) params.set("new", "1");
  if (f.mixersOnly) params.set("mixers", "1");
  if (f.photos !== "default") params.set("photos", f.photos === "yes" ? "1" : "0");
  // Only send a distance cap when it's a real cap (< 500). 500 = Anywhere.
  if (f.distance < 500 && origin) {
    params.set("distance", String(f.distance));
    params.set("lat", String(origin.lat));
    params.set("lng", String(origin.lng));
  }
  return params;
}
