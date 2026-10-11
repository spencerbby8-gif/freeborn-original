/**
 * Display normalizer — raw stored values (legacy rows, enum fallbacks) must
 * never surface with underscores in the UI: "life_partner" → "Life partner".
 * Legitimate hyphens in real words ("Long-term", "Non-binary") are preserved.
 */
export function prettyText(value: string | null | undefined): string {
  if (!value) return "";
  const spaced = value.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
