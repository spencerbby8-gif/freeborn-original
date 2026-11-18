import { PreviewShell } from "./preview-shell";
import "./preview.css";

/**
 * Visual review surface for all eight reference screens.
 *
 * Deliberately outside /app: it needs no Supabase session, so every tab can be
 * walked in a browser during review. The components it renders are the same ones
 * the signed-in app uses.
 */
export const metadata = { robots: { index: false, follow: false } };

export default function PreviewPage() {
  return <PreviewShell />;
}
