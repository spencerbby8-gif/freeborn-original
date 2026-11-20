export type LandingFaq = {
  q: string;
  a: string;
};

/**
 * One source of truth for the new landing FAQ. `src/app/page.tsx` derives the
 * FAQPage structured data from this same array, so the visible answers and the
 * JSON-LD cannot drift apart.
 */
export const landingFaqs: LandingFaq[] = [
  {
    q: "Who is Freeborn for?",
    a: "Freeborn is a general dating platform for adults who want a more intentional way to meet. It is for people looking for meaningful conversation, compatible values and a connection that has room to grow — whatever their background or worldview.",
  },
  {
    q: "Is Freeborn only about health or vaccination views?",
    a: "No. Freeborn is for everyone 18+. Members can choose to share lifestyle, wellness and medical freedom details, and set an optional vaccination preference in discovery. They are never a membership requirement or the product's exclusive identity.",
  },
  {
    q: "What makes discovery different?",
    a: "Profiles give more context than a photo alone: intentions, interests, words, photos and the boundaries members choose to make visible. Discovery settings let people shape who they see without turning dating into an endless feed.",
  },
  {
    q: "Is Freeborn free?",
    a: "The current product lets members create a profile, discover people, like, match and message. You can explore Freeborn and connect with others through the app.",
  },
  {
    q: "What information stays private?",
    a: "Email addresses, full birth dates, account provider details and exact locations are not shown publicly in discovery. Members have privacy and discoverability controls, and the product keeps reporting and blocking available from the real account flows.",
  },
  {
    q: "How does Freeborn approach trust and safety?",
    a: "The product uses age-gated onboarding, editable privacy controls, discoverability settings, verification status where available, profile completeness cues and clear member standards. Safety, reporting, blocking and appeal routes remain part of the functional application rather than marketing claims.",
  },
];
