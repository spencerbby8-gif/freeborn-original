import type { ReactNode } from "react";
import { PrototypeFrame } from "@/components/prototype/frame";

/** Presentation only. AuthExperience retains all provider, CAPTCHA, recovery,
 * email confirmation and password controls. */
export function AuthShell({ children }: { children: ReactNode }) {
  return <PrototypeFrame hideTabs>{children}</PrototypeFrame>;
}
