/** Presentation uses the viewer's device clock, never a candidate's city or a fixed hour. */
export function discoveryHeading(city: string | null, nearby: boolean, now = new Date()): string {
  if (!nearby || !city?.trim()) return "Date like you mean it";
  const hour = now.getHours();
  const period = hour >= 5 && hour < 12 ? "Morning" : hour >= 12 && hour < 17 ? "Afternoon" : hour >= 17 && hour < 21 ? "Evening" : "Tonight";
  return `${period} in ${city.trim()}`;
}
export const intentLabels: Record<string, string> = {
  long_term: "Long-term", life_partner: "Life partner", friendship: "Friendship", still_exploring: "Exploring",
};
export function profileChips(profile?: { relationshipGoals?: string[]; lifestyle?: string[]; values?: string[]; interests?: string[] }) {
  if (!profile) return [];
  return [profile.relationshipGoals?.[0] ? (intentLabels[profile.relationshipGoals[0]] ?? profile.relationshipGoals[0]) : null,
    profile.lifestyle?.[0] ?? profile.values?.[0], profile.interests?.[0]].filter((v): v is string => Boolean(v));
}
export function hasUnvaccinatedBadge(profile: {verified: boolean; vaccinationStatus?: string}) {
  // No accepted evidence standard exists. Identity approval and self-report
  // must NEVER grant a health badge. Preserve classification/filtering only.
  void profile;
  return false;
}
