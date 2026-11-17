import { HarnessFixture } from "./fixture";

/**
 * Visual fixture for the discovery card and the full-profile screen.
 *
 * It renders the real components against literal copies of the payload
 * /api/profiles and /api/profile/[id] return, so the composition can be reviewed
 * without a Supabase session. Nothing here reaches the network beyond stubs that
 * answer the four calls those screens make on mount.
 */
export const metadata = { robots: { index: false, follow: false } };

export default function HarnessPage() {
  return <HarnessFixture />;
}
