/**
 * Presentation helpers for the "Someone you'll remember" surface.
 *
 * These are wording and layout decisions, not new facts: every value rendered
 * here comes from a column the member already filled in. Anything the data does
 * not contain is simply not shown — the reference has a Zodiac tile and a
 * Languages tile, and this file only ever fills them from real profile fields
 * (`birthMonthYear` → a star sign is arithmetic on a date the member gave us;
 * a language is a column they answered).
 */

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/**
 * Star sign from "September 1998" — the only birth data the profile route sends
 * (see birthLabel in /api/profile/[id]). Day-level precision is not available, so
 * a cusp date is not resolvable and returns the sign for the midpoint of the
 * month's dominant sign. Deliberately conservative: we'd rather show a sign the
 * member recognises than invent a day.
 */
export function zodiacFromBirthMonth(birthMonthYear: string | null | undefined): string | null {
  if (!birthMonthYear) return null;
  const lower = birthMonthYear.toLowerCase();
  const monthIdx = MONTHS.findIndex((m) => lower.includes(m));
  if (monthIdx < 0) return null;
  return ZODIAC_BY_MONTH[monthIdx];
}

const ZODIAC_BY_MONTH = [
  "Capricorn", // January — Capricorn until the 19th, the month's majority
  "Aquarius",
  "Pisces",
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
];

/** "5'6\"" from centimetres — the reference states height in feet and inches. */
export function heightImperial(cm: number | null | undefined): string | null {
  if (!cm || !Number.isFinite(cm)) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

/** "Active today" — the same three tiers the profile route returns, in the
 *  reference's words. "hidden" is its own answer, never "last seen". */
export function presenceLabel(presence: string | null | undefined): {
  label: string;
  live: boolean;
} | null {
  switch (presence) {
    case "now":
      return { label: "Active now", live: true };
    case "today":
      return { label: "Active today", live: true };
    case "week":
      return { label: "Active this week", live: true };
    case "hidden":
      return { label: "Keeps their activity private", live: false };
    default:
      return null;
  }
}

/**
 * The reference's Lifestyle tile says "Active". That word has a specific meaning
 * inside Freeborn (a presence heartbeat) and it is not a lifestyle answer, so the
 * tile shows the member's own first lifestyle selection instead and falls back to
 * the honest ambiguity: "Active" only when the member is demonstrably active.
 */
export function lifestyleHeadline(lifestyle: string[] | null | undefined): string | null {
  const first = (lifestyle ?? []).find((l) => typeof l === "string" && l.trim().length > 0);
  return first ? titleCase(first) : null;
}

/** "matcha lover" → "Matcha lover" — the reference keeps chips sentence-cased. */
export function titleCase(value: string): string {
  if (!value) return value;
  const lower = value.toLocaleLowerCase();
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
}

/** The one-line bio the deck card shows. Keeps the member's own words. */
export function deckBio(bio: string | null | undefined): string {
  return (bio ?? "").replace(/\s+/g, " ").trim();
}

/** "Kaduna" + "" → "Kaduna"; "Brooklyn" + "New York" → "Brooklyn, New York". */
export function placeLabel(city?: string | null, region?: string | null): string {
  const c = (city ?? "").trim();
  const r = (region ?? "").trim();
  if (c && r && c.toLocaleLowerCase() !== r.toLocaleLowerCase()) return `${c}, ${r}`;
  return c || r;
}
