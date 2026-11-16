import type { Metadata } from "next";
import { ogCard } from "@/lib/site";
import { GuidePage } from "@/components/guides/guide-page";

export const metadata: Metadata = {
  title: "Long-distance dating that feels close: the tools that matter",
  description:
    "Photos, voice notes, typing presence and browser-based voice and video calls — the shipped Freeborn features that carry a long-distance match, plus their honest limits.",
  alternates: { canonical: "/guides/long-distance" },
  openGraph: ogCard(
    "/guides/long-distance",
    "Long-distance dating that feels close · Freeborn",
    "Photos, voice notes, typing presence and browser-based voice and video calls — the shipped Freeborn features that carry a long-distance match, plus their honest limits."
  ),
};

const faqs = [
  {
    q: "Do calls need an app install?",
    a: "No. Freeborn calls are peer-to-peer WebRTC sessions run from the browser: each call gets its own channel, ringing rides your personal ring channel, and the handshake and media ride the call channel. Nothing to install on either end.",
  },
  {
    q: "What if my network blocks peer connections?",
    a: "Strict firewalls and some mobile networks can block direct peer-to-peer media; that is a property of the networks, not of Freeborn. Where a relay is configured for the deployment, calls can fall back to it — ask any platform, including ours, what its relay story is before you rely on calls across hostile networks.",
  },
];

export default function LongDistanceGuide() {
  return (
    <GuidePage
      path="/guides/long-distance"
      title="Long-distance dating that feels close: the tools that matter"
      eyebrow="Guide · making distance work"
      updated="2026-11-16"
      description="Photos, voice notes, typing presence and browser-based voice and video calls — the shipped Freeborn features that carry a long-distance match, plus their honest limits."
      faqs={faqs}
    >
      <p>
        Values-aligned communities are small by definition, which means the person
        who shares yours may live three time zones away. Long-distance dating
        fails less from distance than from thin communication: text alone cannot
        carry a voice, a face or a pause. Here is what we ship for that, and —
        because this page does not exaggerate — where the honest limits sit.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">Presence before the message</h2>
      <p>
        Freeborn chat shows a live typing indicator while the other person writes,
        delivered over the realtime channel the same way messages are. It is a
        small thing that changes the texture of a conversation: you stop wondering
        whether anyone is there.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">More than text: photos and voice notes</h2>
      <p>
        Chat carries photos and recorded voice notes alongside plain messages, and
        quoting a message keeps its media attached. A thirty-second voice note
        carries tone that a paragraph cannot; this is the single feature
        long-distance members tell us matters most, and it is free like everything
        else in the core.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">Real calls, device to device, from the browser</h2>
      <p>
        Voice and video calls run as peer-to-end WebRTC sessions: every call gets
        a unique channel, ringing rides the callee&apos;s personal ring channel,
        and the media handshake rides the call channel. No app install, no
        third-party call vendor holding the conversation.
      </p>
      <h2 className="font-display text-2xl text-[var(--color-pearl)]">The honest limits</h2>
      <p>
        Peer-to-peer media depends on both networks allowing it. Corporate
        firewalls and some carrier networks block direct connections; where the
        deployment configures a relay, calls can fall back to it, and where it
        does not, a blocked network means a failed call — that is physics and
        policy, not a product choice. Calls also need a match: message requests
        must be accepted before a chat, and a chat before a call, because
        strangers reaching your camera is exactly what this platform refuses.
      </p>
      <p>
        Our advice, framed as opinion: schedule a video first-date within the first
        week of matching, keep a voice-note thread going between calls, and say the
        distance plan out loud early — tools carry a relationship, but clarity is
        what makes it survive kilometres.
      </p>
    </GuidePage>
  );
}
