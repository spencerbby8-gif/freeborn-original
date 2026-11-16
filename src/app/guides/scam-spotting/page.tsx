import type { Metadata } from "next";
import { ogCard } from "@/lib/site";
import { GuidePage } from "@/components/guides/guide-page";

export const metadata: Metadata = {
  title: "Romance-scam red flags, and what Freeborn's guard watches",
  description:
    "The payment-pressure patterns Freeborn's message guard scores for, what pose-mimic verification does and does not stop, and how member reports reach the moderation queue.",
  alternates: { canonical: "/guides/scam-spotting" },
  openGraph: ogCard(
    "/guides/scam-spotting",
    "Romance-scam red flags · Freeborn",
    "The payment-pressure patterns Freeborn's message guard scores for, what pose-mimic verification does and does not stop, and how member reports reach the moderation queue."
  ),
};

const faqs = [
  {
    q: "Does verification mean no scammers get through?",
    a: "No, and anyone who promises that is lying. Pose-mimic verification makes a stolen or generated face much harder to run at scale because a live person must reproduce a shown pose on camera, and moderation reviews uploads and messages — but determined fraud adapts. The guards reduce risk; your judgement remains the last layer.",
  },
  {
    q: "What happens when I report someone?",
    a: "Your report enters the moderation queue as a row in the platform's reports table, where the moderation policy's tiers decide the next step — from warnings through restriction to removal — and appeals run through a separate flow so a moderator's decision is never the final word.",
  },
];

export default function ScamSpottingGuide() {
  return (
    <GuidePage
      path="/guides/scam-spotting"
      title="Romance-scam red flags, and what Freeborn's guard watches"
      eyebrow="Guide · staying safe"
      updated="2026-11-16"
      description="The payment-pressure patterns Freeborn's message guard scores for, what pose-mimic verification does and does not stop, and how member reports reach the moderation queue."
      faqs={faqs}
    >
      <p>
        Romance fraud runs on the same script almost everywhere: fast intimacy,
        a crisis, and a payment channel that cannot be reversed. Knowing the
        script is most of the defence. Here are the red flags we teach, followed by
        what Freeborn does mechanically — described exactly as it ships, including
        the parts it cannot do.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">The red flags</h2>
      <p>
        Pressure to move off-platform within days. Any request for money, gift
        cards, crypto or &ldquo;investment&rdquo; participation, however small the
        first amount. A refusal or repeated failure to video-call. Stories whose
        emergencies always resolve with a transfer. Profile photos that reverse-image
        search to someone else&apos;s life. Love declared before a single ordinary
        Tuesday has been shared.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">What Freeborn&apos;s guard does</h2>
      <p>
        Messages pass through a scam guard that scores extortion and payment-scam
        patterns — the gift-card, crypto and transfer-pressure vocabulary above —
        and escalates in steps from warnings to restrictions as patterns repeat.
        Uploads and messages also pass dual-model moderation, and pose-mimic
        selfie verification ties a profile to a live face reproducing a shown
        pose, which is what makes industrial fake-profile farms expensive here.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">Reports, tiers, appeals</h2>
      <p>
        Any member can report a profile or a message; reports land in the
        moderation queue where the policy tiers decide the response, and the
        affected member can appeal through a separate flow with a human challenge
        on the door. Moderation is described in full on the safety page, including
        its limits.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">What no platform can do</h2>
      <p>
        No guard reads intent perfectly, no verification stops a determined human
        fraudster who is really present, and no moderation queue is instant. If a
        conversation turns toward money, stop and report — the guard works best as
        a backstop to your own refusal, never as a replacement for it.
      </p>
    </GuidePage>
  );
}
