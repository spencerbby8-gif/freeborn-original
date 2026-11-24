/** Plain-text evidence normalization only, not an HTML/XSS sanitizer.
 * Decode the small supported entity set in one pass so &amp;quot; stays &quot;.
 */
export function normalizePublicText(value) {
  const entities = { '&#x27;': "'", '&#39;': "'", '&amp;': '&', '&quot;': '"' };
  return value.replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;|&amp;|&quot;/g, entity => entities[entity])
    .replace(/\s+/g, ' ').trim();
}
