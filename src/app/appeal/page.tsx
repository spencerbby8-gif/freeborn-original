import type { Metadata } from "next";
import { AppealExperience } from "./appeal-experience";

export const metadata: Metadata = {
  title: "Appeal a suspension",
  description: "Appeal a Freeborn account suspension — a real investigation, results in 2 days.",
  robots: { index: false },
};

export default function AppealPage() {
  return <AppealExperience />;
}
