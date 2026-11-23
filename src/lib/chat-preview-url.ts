/** Only local, inert media previews may reach a chat image/video URL sink.
 * Keep the original opaque browser URL (no HTML interpolation or URL rewriting).
 * Server-side upload authorization and byte validation remain independent.
 */
const PREVIEW_TYPES = {
  image: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  video: new Set(["video/mp4", "video/webm", "video/quicktime"]),
};

export function createChatPreviewUrl(file: Blob, kind: "image" | "video"): string {
  const mime = file.type.toLowerCase().split(";")[0].trim();
  if (!PREVIEW_TYPES[kind].has(mime)) throw new Error(`Choose a supported ${kind} file.`);
  const url = URL.createObjectURL(file);
  // Reject HTML metacharacters before any value enters a DOM/JSX URL attribute.
  if (/["'&<>]/.test(url)) {
    URL.revokeObjectURL(url);
    throw new Error("The browser returned an unsafe media preview URL.");
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "blob:" || parsed.origin !== window.location.origin) {
      throw new Error("Media previews must be local to this page.");
    }
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return url;
}
