import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Threshold-gated city pages (B18) — programmatic SEO that refuses to lie.
 *
 * THE RULE. A city page exists ONLY when real, completed memberships in an
 * allowed region actually reach MIN_MEMBERS_PER_CITY. Below the threshold the
 * route 404s and the sitemap lists nothing, because a page that says "singles
 * in your city" over an empty room is a false claim, and auto-generated empty
 * rooms are doorway spam under every major engine's spam policy.
 *
 * THE COUNT IS HONEST BY CONSTRUCTION:
 *  - only profiles with onboarding_completed_at set (a finished onboarding, not
 *    an abandoned sign-up);
 *  - test/QA accounts excluded by email pattern INSIDE the SQL, so a QA fixture
 *    can never inflate somebody's home city (production 2026-11-16: 11 profiles,
 *    4 completed, 1 QA-like, 3 real — all three in Nigerian-area cities, which
 *    the region gate also excludes, so zero pages publish today and that is the
 *    correct behaviour);
 *  - the published page shows a BAND ("5–9", "10–24", …), never the exact
 *    count, so a small community cannot be fingerprinted member by member.
 *
 * REGIONS follow the standing audience rule: US, Europe (EU/EEA/UK/CH), Asia.
 * Everything else — explicitly including NG — is excluded from ever rendering.
 */

export const MIN_MEMBERS_PER_CITY = 5;

/** Emails that identify test/QA fixtures; excluded from every public count. */
export const QA_EMAIL_PATTERN =
  "(^qa[.-])|@(freeborn\\.app|example\\.com|example\\.org|example\\.net|test)$";

export const ALLOWED_COUNTRY_CODES = [
  // North America (audience: US)
  "US",
  // Europe: EU27 + EEA/UK/CH
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "GB", "CH", "NO", "IS", "LI",
  // Asia
  "AE", "BD", "BN", "BT", "KH", "CN", "GE", "HK", "IN", "ID", "IL", "JP", "JO",
  "KZ", "KW", "LA", "LB", "MY", "MV", "MN", "MM", "NP", "OM", "PK", "PH", "QA",
  "SA", "SG", "KR", "LK", "TW", "TJ", "TH", "TR", "TM", "UZ", "VN",
] as const;

export const COUNTRY_NAMES: Record<string, string> = {
  US: "the United States",
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus",
  CZ: "Czechia", DK: "Denmark", EE: "Estonia", FI: "Finland", FR: "France",
  DE: "Germany", GR: "Greece", HU: "Hungary", IE: "Ireland", IT: "Italy",
  LV: "Latvia", LT: "Lithuania", LU: "Luxembourg", MT: "Malta", NL: "the Netherlands",
  PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia", SI: "Slovenia",
  ES: "Spain", SE: "Sweden", GB: "the United Kingdom", CH: "Switzerland",
  NO: "Norway", IS: "Iceland", LI: "Liechtenstein",
  AE: "the United Arab Emirates", BD: "Bangladesh", BN: "Brunei", BT: "Bhutan",
  KH: "Cambodia", CN: "China", GE: "Georgia", HK: "Hong Kong", IN: "India",
  ID: "Indonesia", IL: "Israel", JP: "Japan", JO: "Jordan", KZ: "Kazakhstan",
  KW: "Kuwait", LA: "Laos", LB: "Lebanon", MY: "Malaysia", MV: "the Maldives",
  MN: "Mongolia", MM: "Myanmar", NP: "Nepal", OM: "Oman", PK: "Pakistan",
  PH: "the Philippines", QA: "Qatar", SA: "Saudi Arabia", SG: "Singapore",
  KR: "South Korea", LK: "Sri Lanka", TW: "Taiwan", TJ: "Tajikistan",
  TH: "Thailand", TR: "Türkiye", TM: "Turkmenistan", UZ: "Uzbekistan", VN: "Vietnam",
};

export interface CityPage {
  countryCode: string;
  countryName: string;
  city: string;
  path: string;
  band: string;
}

/** Published membership bands. Exact counts never leave the server. */
export function bandFor(count: number): string | null {
  if (count >= 100) return "100+";
  if (count >= 50) return "50–99";
  if (count >= 25) return "25–49";
  if (count >= 10) return "10–24";
  if (count >= MIN_MEMBERS_PER_CITY) return "5–9";
  return null;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The whole gate in one pure function, pinned by harness section [34]:
 * threshold, region allowlist and non-empty city, or no page at all.
 */
export function cityPageFor(
  memberCount: number,
  countryCode: string | null,
  city: string
): CityPage | null {
  if (!countryCode) return null;
  const code = countryCode.toUpperCase();
  if (!(ALLOWED_COUNTRY_CODES as readonly string[]).includes(code)) return null;
  const trimmed = city.trim();
  if (!trimmed) return null;
  const band = bandFor(memberCount);
  if (!band) return null;
  const countrySlug = slugify(COUNTRY_NAMES[code] ?? code);
  const citySlug = slugify(trimmed);
  if (!citySlug) return null;
  return {
    countryCode: code,
    countryName: COUNTRY_NAMES[code] ?? code,
    city: trimmed,
    path: `/dating/${countrySlug}/${citySlug}`,
    band,
  };
}

interface AggregateRow {
  country_code: string | null;
  city: string;
  member_count: string | number;
}

/** Live, gated city inventory: what the sitemap and the route both serve. */
export async function fetchQualifyingCities(): Promise<CityPage[]> {
  const result = await db.execute(sql`
    select country_code, city,
      count(*) filter (
        where onboarding_completed_at is not null
          and email !~* ${QA_EMAIL_PATTERN}
      ) as member_count
    from user_profiles
    where city is not null and btrim(city) <> ''
    group by 1, 2
  `);
  const rows = (result as unknown as { rows: AggregateRow[] }).rows ?? [];
  const pages: CityPage[] = [];
  for (const row of rows) {
    const page = cityPageFor(Number(row.member_count), row.country_code, row.city);
    if (page) pages.push(page);
  }
  pages.sort((a, b) => a.path.localeCompare(b.path));
  return pages;
}

export async function findCityPage(
  countrySlug: string,
  citySlug: string
): Promise<CityPage | null> {
  const all = await fetchQualifyingCities();
  return all.find((p) => p.path === `/dating/${countrySlug}/${citySlug}`) ?? null;
}
