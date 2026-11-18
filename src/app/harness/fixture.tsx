"use client";

import { useEffect, useState } from "react";
import { HomeDeck } from "@/components/app/home-deck";
import { ProfileView } from "@/components/app/profile-view";
import { DeckCard } from "@/components/app/deck-card";
import { ChatIcon, DiscoverMark, DropletIcon, HeartIcon, HeartMarkIcon, ProfileIcon } from "@/components/ui/line-icons";

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

const ROOM_FILTERS = ["Long-term", "Natural health", "Health autonomy"] as const;

export function HarnessFixture() {
  const [which, setWhich] = useState("deck");
  /* Every control in the reference is live in this fixture: the room filters
     toggle, the deck's pass / like advance nothing but DO respond, "Say hello"
     posts to the chat-requests endpoint and reports the answer, and the tab bar
     navigates. Previously onLike/onPass were `() => undefined` and the tabs were
     <span>s, which is why tapping anything on the card did nothing. */
  const [room, setRoom] = useState<string | null>("Natural health");
  const [verdict, setVerdict] = useState<null | "pass" | "like">(null);
  const [toast, setToast] = useState<{ text: string; tone: "good" | "warn" } | null>(null);
  const [helloBusy, setHelloBusy] = useState(false);
  const [helloDone, setHelloDone] = useState(false);
  const [tab, setTab] = useState("Discover");
  const [bellOpen, setBellOpen] = useState(false);

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
    /* Deferred by a microtask so this is not a synchronous setState inside an
       effect body (react-hooks/set-state-in-effect), which cascades renders. */
    const q = new URLSearchParams(window.location.search).get("as");
    if (q) queueMicrotask(() => setWhich(q));
  }, []);

  const sayHello = async () => {
    if (helloBusy) return;
    setHelloBusy(true);
    try {
      const res = await fetch("/api/chat/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: CARD.id, message: "Hi Aria — your sunset photos got me." }),
      });
      setHelloDone(true);
      setToast({
        tone: res.ok ? "good" : "warn",
        text: res.ok ? `Request sent to ${CARD.name}` : "Their privacy settings stop a message from you",
      });
    } catch {
      setToast({ tone: "warn", text: "Could not reach messages" });
    } finally {
      setHelloBusy(false);
    }
  };

  const tapTab = (label: string) => {
    setTab(label);
    if (label === "Profile") setWhich("profile");
    else if (label === "Discover") setWhich("deck");
    setToast({ tone: "good", text: label === "Discover" ? "You're on Discover" : `${label} — nothing new yet` });
  };

  return (
    <div className="fb-sr fb-sr-phone flex h-[100dvh] flex-col">
      {/* The shell's own chrome, reproduced exactly: no wordmark bar on
          Discover, a main that ends above the tab bar, and the screen's column. */}
      <main className="flex min-h-0 flex-1 flex-col pb-[117px]">
        <div className="fb-sr-phone mx-auto flex w-full max-w-[480px] flex-1 flex-col pb-0 pt-[42px]">
          <header className="fb-sr-header">
            <div className="min-w-0">
              <p className="fb-sr-eyebrow">Tonight in Brooklyn</p>
              <h1 className="fb-sr-header__title">Someone you&rsquo;ll remember.</h1>
            </div>
            <button
              type="button"
              onClick={() => setBellOpen((v) => !v)}
              aria-label="See who likes you"
              aria-expanded={bellOpen}
              className="fb-sr-disc fb-sr-bell"
            >
              <span className="relative flex">
                <HeartMarkIcon size={18} />
                <span className="fb-sr-dot">2</span>
              </span>
            </button>
          </header>

          <div className="fb-sr-chiprow mt-[18px]">
            {ROOM_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setRoom((cur) => (cur === f ? null : f))}
                aria-pressed={room === f}
                className="fb-sr-chip"
              >
                {f}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRoom((cur) => (cur === "Natural health" ? null : "Natural health"))}
              aria-label="Natural health stance"
              aria-pressed={room === "Natural health"}
              className="fb-sr-chip fb-sr-chip--gold"
            >
              <DropletIcon size={14} />
            </button>
          </div>

          {which === "deck" ? (
            <div className="fb-sr-deck">
              <div className="fb-sr-deck__card">
                {/* the card resting behind the top one, drawn as a rim band */}
                <span aria-hidden className="fb-sr-peek">
                  <span className="fb-sr-peek__handle" />
                </span>
                {verdict ? (
                  <span
                    className="fb-sr-harness-stamp"
                    data-tone={verdict}
                    aria-live="polite"
                  >
                    {verdict === "like" ? "Liked" : "Skipped"}
                  </span>
                ) : null}
                <DeckCard
                  profile={CARD}
                  isTop
                  depth={0}
                  units="mi"
                  onOpen={() => setWhich("profile")}
                  onLike={() => { setVerdict("like"); setToast({ tone: "good", text: `Liked ${CARD.name}` }); }}
                  onPass={() => { setVerdict("pass"); setToast({ tone: "warn", text: `Skipped ${CARD.name}` }); }}
                  onSayHello={sayHello}
                />
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ProfileView profileId="fixture-1" onClose={() => setWhich("deck")} />
            </div>
          )}
        </div>
      </main>

      {bellOpen ? (
        <div className="fb-sr-harness-panel" role="dialog" aria-label="Who likes you">
          <p className="font-semibold">2 people like you</p>
          <p className="mt-1 text-[12px] opacity-70">Aria and one other member nearby.</p>
          <button type="button" onClick={() => setBellOpen(false)} className="fb-sr-harness-panel__close">
            Close
          </button>
        </div>
      ) : null}

      {toast ? (
        <div className="fb-sr-harness-toast" data-tone={toast.tone} role="status">
          {toast.text}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      ) : null}

      <nav className="fb-sr-tabs">
        <div className="fb-sr-tabs__row">
          {[
            { label: "Discover", icon: <DiscoverMark size={26} active={tab === "Discover"} /> },
            { label: "Likes", icon: <HeartIcon size={25} /> },
            { label: "Messages", icon: <ChatIcon size={25} />, badge: "2" },
            { label: "Profile", icon: <ProfileIcon size={25} /> },
          ].map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => tapTab(t.label)}
              data-active={tab === t.label}
              aria-current={tab === t.label ? "page" : undefined}
              className="fb-sr-tab"
            >
              <span className="fb-sr-tab__icon">
                {t.icon}
                {t.badge ? <span className="fb-sr-tab__dot">{t.badge}</span> : null}
              </span>
              {t.label}
            </button>
          ))}
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
