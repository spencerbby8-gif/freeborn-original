import type { Metadata } from "next";
import { AppealExperience } from "./appeal-experience";

export const metadata: Metadata = {
  title: "Appeal a suspension",
  description:
    "Appeal a Freeborn account suspension. Every appeal is read and decided by a person, not by a model.",
  robots: { index: false },
};

export default function AppealPage() {
  return <AppealExperience />;
}
