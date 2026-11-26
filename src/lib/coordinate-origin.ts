/** Parse a complete, geographically valid query origin. A missing, blank,
 * malformed or out-of-range coordinate is not the equator/prime meridian. */
export function coordinateOrigin(params: URLSearchParams): { latitude: number; longitude: number } | null {
  const lat = params.get("lat")?.trim();
  const lng = params.get("lng")?.trim();
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  if (!lat || !lng || !decimal.test(lat) || !decimal.test(lng)) return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
