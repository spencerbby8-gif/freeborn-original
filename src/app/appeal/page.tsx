import type { Metadata } from "next";
import { AppealExperience } from "./appeal-experience";

export const metadata: Metadata = {
  title: "Appeal a suspension",
  description:
    "Information about appealing a Freeborn account suspension.",
  robots: { index: false },
};

export default function AppealPage() {
  return <AppealExperience />;
}
