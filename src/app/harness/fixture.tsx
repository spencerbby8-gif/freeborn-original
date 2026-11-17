"use client";

import { useEffect, useState } from "react";
import { HomeDeck } from "@/components/app/home-deck";
import { ProfileView } from "@/components/app/profile-view";
import { DeckCard } from "@/components/app/deck-card";
import { BellIcon, ChatIcon, CompassIcon, HeartIcon, ProfileIcon } from "@/components/ui/line-icons";

/**
 * Fixture surface for visual review. Everything below is a literal copy of the
 * shape /api/profiles and /api/profile/[id] already return, so what renders here
 * is what a member sees — no new data, no new claims.
 */

const CARD = {
  id: "fixture-1",
  name: "Aria",
  age: 27,
  city: "Brooklyn",
  occupation: "Graphic Designer",
  headline: "Designing by day, chasing sunsets by night. I believe in deep talks, random adventures, and good coffee.",
  promptQuestion: "A value I will not compromise on…",
  promptAnswer: "Honesty, even when it is inconvenient.",
  traits: ["Hiking", "Ambient music", "Matcha lover"],
  interests: [],
  photo: "/harness/portrait.jpg",
  photos: ["/harness/portrait.jpg"],
  verified: true,
  presence: "today",
  distanceKm: 4,
  heightCm: 168,
  isNew: true,
  likes: 2,
  vaccinationStatus: "unvaccinated",
  joinedAt: "2026-11-01T00:00:00Z",
};

const FULL = {
  id: "fixture-1",
  name: "Aria",
  age: 27,
  city: "Brooklyn",
  region: "",
  occupation: "Graphic Designer",
  education: "Pratt Institute",
  educationLevel: "bachelors",
  bio: "Creative soul with a curious mind. I love meaningful conversations, weekend getaways, and trying new cuisines.",
  language: "English",
  religion: "",
  maritalStatus: "Never married",
  hasKids: "No kids",
  wantsKids: "Open to kids",
  drinking: "Socially",
  smoking: "Never",
  heightCm: 168,
  values: ["Honesty", "Kindness", "Loyalty"],
  interests: ["Hiking", "Photography", "Ambient music", "Travel"],
  lifestyle: ["Active", "Natural wellness", "Coffee snob"],
  relationshipGoals: ["long_term"],
  prompts: [{ prompt: "A value I will not compromise on…", answer: "Honesty, even when it is inconvenient." }],
  photos: ["/harness/portrait.jpg"],
  verified: true,
  vaccinationStatus: "unvaccinated",
  replyRate: 92,
  matchRate: 41,
  conversationCount: 12,
  memberSince: "2026-08-14T00:00:00Z",
  birthMonthYear: "August 1999",
  distanceKm: 4,
  gender: "woman",
  dealBreakers: [],
  presence: "today",
  mixerCity: null,
  inCommon: null,
  messageRestricted: null,
};

export function HarnessFixture() {
  const [which, setWhich] = useState("deck");

  /* Both member screens call these two on mount; they are answered here so the
     fixture renders without a session. Nothing else is stubbed. */
  useEffect(() => {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/profiles")) {
        return new Response(JSON.stringify({ profiles: [CARD], facets: { total: 1 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/profile/fixture-1")) {
        return new Response(JSON.stringify({ profile: FULL }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/profile/me")) {
        return new Response(JSON.stringify({ profile: { photos: ["/harness/portrait.jpg"] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/chat/requests")) {
        return new Response(JSON.stringify({ incoming: [], outgoing: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/notifications")) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/settings")) {
        return new Response(JSON.stringify({ discovery: {} }), { status: 404 });
      }
      return realFetch(input as RequestInfo, init);
    };
    const q = new URLSearchParams(window.location.search).get("as");
    if (q) setWhich(q);
  }, []);

  return (
    <div className="fb-sr min-h-[100dvh] pb-10">
      <div className="mx-auto w-full max-w-[520px] px-5 pt-5">
        {/* chrome the AppShell would provide, reproduced so the composition reads */}
        <header className="fb-sr-header">
          <div>
            <p className="fb-sr-eyebrow">Tonight in Brooklyn</p>
            <h1 className="fb-sr-header__title">Someone you&rsquo;ll remember.</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <span className="fb-sr-disc fb-sr-round" style={{ width: 42, height: 42 }}>
              <span className="relative flex">
                <BellIcon size={17} />
                <span className="fb-sr-dot">2</span>
              </span>
            </span>
            <span className="fb-sr-avatar" style={{ width: 42, height: 42 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/harness/portrait.jpg" alt="" className="h-full w-full object-cover" />
            </span>
          </div>
        </header>

        <div className="fb-sr-chiprow mt-5">
          <span className="fb-sr-chip">Long-term</span>
          <span className="fb-sr-chip">Natural health</span>
          <span className="fb-sr-chip">Health autonomy</span>
          <span className="fb-sr-chip fb-sr-chip--gold">
            <CompassIcon size={14} />
          </span>
        </div>

        <div className="mt-5">
          {which === "deck" ? (
            <DeckCard
              profile={CARD}
              isTop
              depth={0}
              units="mi"
              onOpen={() => setWhich("profile")}
              onLike={() => undefined}
              onPass={() => undefined}
              onSayHello={() => setWhich("profile")}
            />
          ) : (
            <ProfileView profileId="fixture-1" onClose={() => setWhich("deck")} />
          )}
        </div>
      </div>

      <nav className="fb-sr-tabs">
        <div className="fb-sr-tabs__row">
          <span className="fb-sr-tab" data-active="true">
            <span className="fb-sr-tab__icon">
              <CompassIcon size={21} />
            </span>
            Discover
          </span>
          <span className="fb-sr-tab">
            <span className="fb-sr-tab__icon">
              <HeartIcon size={21} />
            </span>
            Likes
          </span>
          <span className="fb-sr-tab">
            <span className="fb-sr-tab__icon">
              <ChatIcon size={21} />
            </span>
            Messages
          </span>
          <span className="fb-sr-tab">
            <span className="fb-sr-tab__icon">
              <ProfileIcon size={21} />
            </span>
            Profile
          </span>
        </div>
      </nav>

      {/* HomeDeck is mounted off-screen so its mount-time effects are exercised
          (the reference chrome above is the visual one). */}
      <div className="pointer-events-none fixed left-[-9999px] top-0 opacity-0" aria-hidden>
        <HomeDeck />
      </div>
    </div>
  );
}
