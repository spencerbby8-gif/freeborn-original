/** Best-effort client cache invalidation; never an authorization boundary. */
export function clearSecurityCheckCache(): void {
  try { window.sessionStorage.removeItem("fb-security-checked"); } catch { /* storage is optional */ }
}
