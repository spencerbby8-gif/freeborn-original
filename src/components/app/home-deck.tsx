"use client";

import { PhotoImage } from "@/components/ui/photo-image";

import Link from "next/link";
import { formatDistance, useDistanceUnits } from "@/lib/device-prefs";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient, getAccessToken } from "@/lib/supabase/browser";
import { Wordmark } from "@/components/wordmark";
import { MixerCard } from "./settings-view";
import { ProfileView } from "./profile-view";
import { PhotoLightbox } from "./photo-lightbox";
import { DeckCard } from "./deck-card";
import { DropletIcon, HeartIcon, SparkIcon } from "@/components/ui/line-icons";
import {
  buildProfileParams,
  DEFAULT_FILTERS,
  FILTERS_EVENT,
  hasActiveFilters,
  hasSavedFilters,
  loadFilters,
  saveFilters,
  type HomeFilters,
  type RoomFacets,
} from "./filters";

type Profile = {
  id: string;
  name: string;
  age: number;
  city: string;
  occupation: string;
  headline: string;
  promptQuestion: string;
  promptAnswer: string;
  traits: string[];
  photo: string;
  photos: string[];
  hasPhoto?: boolean;
  hideDistance?: boolean;
  hideActiveStatus?: boolean;
  inCommon?: { values: string[]; interests: string[]; goals: string[] };
  verified: boolean;
  /** "now" | "today" | "week" | null. Replaces a boolean the card labelled
      "Online" while the window behind it was 24 hours. */
  presence: string | null;
  openToMixers?: boolean;
  vaccinationStatus: string;
  distanceKm: number | null;
  joinedAt: string | null;
  isNew?: boolean;
  interests?: string[];
  likes?: number;
};

type Choice = "like" | "pass" | "superlike";

/** Ease used for the fly-out: fast launch, soft exit. */
const FLY_EASE = "cubic-bezier(0.18, 0.9, 0.24, 1)";
/** Spring-back when a drag is released below the threshold. */
const SPRING_EASE = "cubic-bezier(0.2, 1.4, 0.4, 1)";

type Tone = "long-term" | "natural-health" | "health-autonomy";

/**
 * The three interest chips above the deck, drawn from the reference.
 *
 * They are not decoration: each one is a real, reversible filter that writes the
 * same saved-filters store the filter panel writes, so the chip and the panel can
 * never disagree — and the chips below the fold scroll, because the filter set is
 * larger than three and hiding the rest would make the panel the only way in.
 */
const ROOM_FILTERS: Array<{
  key: string;
  label: string;
  tone: Tone;
  apply: (f: HomeFilters) => HomeFilters;
  active: (f: HomeFilters) => boolean;
}> = [
  {
    key: "long-term",
    label: "Long-term",
    tone: "long-term",
    apply: (f) => ({
      ...f,
      intents: f.intents.includes("long_term") ? f.intents : [...f.intents, "long_term"],
    }),
    active: (f) => f.intents.includes("long_term"),
  },
  {
    key: "natural-health",
    label: "Natural health",
    tone: "natural-health",
    apply: (f) => ({
      ...f,
      lifestyle: f.lifestyle.includes("Natural wellness")
        ? f.lifestyle
        : [...f.lifestyle, "Natural wellness"],
    }),
    active: (f) => f.lifestyle.includes("Natural wellness"),
  },
  {
    key: "health-autonomy",
    label: "Health autonomy",
    tone: "health-autonomy",
    apply: (f) => ({
      ...f,
      lifestyle: f.lifestyle.includes("Health autonomy")
        ? f.lifestyle
        : [...f.lifestyle, "Health autonomy"],
    }),
    active: (f) => f.lifestyle.includes("Health autonomy"),
  },
];

export function HomeDeck({ standalone = false }: { standalone?: boolean }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState<Choice | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [matchToast, setMatchToast] = useState<string | null>(null);
  /** Confirmation that a hello was queued as a message request. Its own state,
   *  because reusing the match toast made it read "It's mutual… liked you back". */
  const [helloToast, setHelloToast] = useState<string | null>(null);
  const [superToast, setSuperToast] = useState(false);
  const [bubble, setBubble] = useState<{ x: number; y: number; key: number } | null>(null);
  const [loading, setLoading] = useState(true);
  /* B6. /api/profiles now requires a signed-in member and answers 401 otherwise.
     Without this flag a signed-out visitor fell into the "You've met everyone
     here today" empty state, which told them something untrue about the room. */
  const [signedOut, setSignedOut] = useState(false);
  /* What the room contains before this member's own filters. Without it an empty
     deck cannot tell the difference between "nobody is here" and "your filters
     removed everybody", and those need completely different sentences. */
  const [facets, setFacets] = useState<RoomFacets | null>(null);
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; name: string; start: number } | null>(null);
  const [filters, setFilters] = useState<HomeFilters>({ ...DEFAULT_FILTERS });
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  /** Undo the last swipe — free everywhere else, free here too. */
  const [undoBusy, setUndoBusy] = useState(false);
  const [lastUndone, setLastUndone] = useState<string | null>(null);
  /** Likes the member has not opened yet — the count on the header heart. */
  const [unreadLikes, setUnreadLikes] = useState(0);

  /* --- Gesture state lives in refs: zero React re-renders per frame ------- */

  const topRef = useRef<HTMLElement | null>(null);
  const likeStampRef = useRef<HTMLSpanElement | null>(null);
  const skipStampRef = useRef<HTMLSpanElement | null>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    dx: number;
    moved: boolean;
    lastX: number;
    lastT: number;
    vx: number;
  } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 });
  const draggedRef = useRef(false);
  /** First decisive movement wins: "h" = swipe the card, "v" = scroll page. */
  const axisRef = useRef<"h" | "v" | null>(null);
  /** Delays profile opens so a second tap becomes a Super Like instead. */
  const profileTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDoubleAt = useRef(0);

  const openProfileTap = (id: string, now: number) => {
    if (now - lastDoubleAt.current < 500) return; // it was a super-like
    if (profileTapTimer.current) {
      /* Already opening. Pointer-captured taps fire here twice (pointerup on
         the card + click on the label); the second call must not cancel the
         first the way a genuine double-tap does. */
      return;
    }
    profileTapTimer.current = setTimeout(() => {
      profileTapTimer.current = null;
      setOpenProfile(id);
    }, 260);
  };
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken().catch(() => null);
      setSignedIn(Boolean(token));
      if (standalone && token) {
        window.location.replace("/app");
        return;
      }
      setFilters(loadFilters());
      /* Seed the panel with the member's standing preferences (Settings →
         Discovery) when they haven't saved session filters on this device —
         the panel then displays exactly what the deck applies. Saving any
         panel filter afterwards persists it as the session override. */
      if (token && !hasSavedFilters()) {
        try {
          const res = await fetch("/api/settings", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = (await res.json()) as {
              discovery?: {
                ageMin?: number;
                ageMax?: number;
                distanceKm?: number;
                showGenders?: string[];
                verifiedOnly?: boolean;
                vaccinationPreference?: string;
              };
            };
            const d = json.discovery;
            if (d) {
              setFilters((prev) => ({
                ...prev,
                ageMin: d.ageMin ?? prev.ageMin,
                ageMax: d.ageMax ?? prev.ageMax,
                distance: d.distanceKm ?? prev.distance,
                genders: Array.isArray(d.showGenders) ? d.showGenders : prev.genders,
                verifiedOnly: d.verifiedOnly ?? prev.verifiedOnly,
                vax: d.vaccinationPreference ?? prev.vax,
              }));
            }
          }
        } catch {
          /* panel keeps its defaults */
        }
      }
      // Cached browser location (permission already granted earlier).
      try {
        const cached = window.sessionStorage.getItem("freeborn.origin");
        if (cached) {
          const { lat, lng } = JSON.parse(cached) as { lat: number; lng: number };
          if (Number.isFinite(lat) && Number.isFinite(lng)) setOrigin({ lat, lng });
        }
      } catch {
        /* ignore */
      }
      if (token) {
        try {
          const supabase = createSupabaseBrowserClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from("user_private_locations")
              .select("latitude, longitude")
              .eq("user_id", user.id)
              .maybeSingle();
            const loc = data as { latitude?: number; longitude?: number } | null;
            if (loc?.latitude != null && loc?.longitude != null) {
              setOrigin({ lat: loc.latitude, lng: loc.longitude });
            }
          }
        } catch {
          /* filters still work without origin */
        }
      }
    })();
    const onFilters = () => setFilters(loadFilters());
    window.addEventListener(FILTERS_EVENT, onFilters);
    return () => window.removeEventListener(FILTERS_EVENT, onFilters);
  }, [standalone]);

  /* --- the bell's unread count, published by NotificationCenter ---------- */
  useEffect(() => {
    const onUnread = (e: Event) => {
      const d = (e as CustomEvent<{ likes?: number }>).detail;
      const n = d?.likes;
      if (typeof n === "number") {
        /* The shell publishes "you are looking at this tab, its dot is zero";
           every other publish carries a real count that must not be lowered by
           a stale read from a merge event. */
        setUnreadLikes((prev) => (n === 0 ? 0 : Math.max(prev, n)));
      }
    };
    window.addEventListener("freeborn:unread", onUnread);
    return () => window.removeEventListener("freeborn:unread", onUnread);
  }, []);

  const loadProfiles = useCallback(async () => {
    const params = buildProfileParams(filters, origin);
    // Bearer token lets the API exclude the viewer's own card from the deck.
    const token = await getAccessToken().catch(() => null);
    const res = await fetch(`/api/profiles?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const json = await res.json();
      setProfiles(json.profiles);
      setFacets(json.facets ?? null);
      setIndex(0);
      setSignedOut(false);
      setLoading(false);
      return json.profiles as typeof profiles;
    } else if (res.status === 401) {
      setProfiles([]);
      setFacets(null);
      setSignedOut(true);
    }
    setLoading(false);
    return [];
  }, [filters, origin]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const units = useDistanceUnits();
  const roomTotal = facets?.total ?? 0;
  /* The room has people in it and the deck does not, so a filter removed all of
     them. This includes the age window, distance and photo preference saved in
     Settings, which hasActiveFilters cannot see because it only reads the filter
     panel's own store. Before facets existed this case fell through to "You've
     met everyone here today", which was simply not true: three members were in
     the room while the deck said nobody was. */
  const filteredOut = profiles.length === 0 && roomTotal > 0;
  const panelFiltersOn = profiles.length === 0 && hasActiveFilters(filters);

  /** Undo the last swipe: deletes it (and any match it created), then the
     profile re-enters the deck — explicit recourse, never silent. */
  const undoLastSwipe = async () => {
    if (undoBusy) return;
    setUndoBusy(true);
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "undo" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setLastUndone(json.undone ?? "swipe");
        window.setTimeout(() => setLastUndone(null), 2600);
        if (json.unmatched) setMatchToast(null);
        /* The undone member re-enters the deck ON TOP: the room order is not
           stable across fetches, so a bare refetch could bury them mid-deck and
           the member would never see the choice they just took back. */
        const list = await loadProfiles();
        const undoneId = typeof json.undone === "string" ? json.undone : null;
        const u = undoneId ? (list ?? []).find((x) => x.id === undoneId) : undefined;
        if (u) {
          setProfiles([u, ...(list ?? []).filter((x) => x.id !== undoneId)]);
          setIndex(0);
        }
      }
    } catch {
      /* deck stays as-is */
    } finally {
      setUndoBusy(false);
    }
  };

  const current = profiles[index];

  /** Ask the browser for the member's position → real distances everywhere. */
  const enableLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const o = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          window.sessionStorage.setItem("freeborn.origin", JSON.stringify(o));
        } catch {
          /* ignore */
        }
        setOrigin(o);
        // Persist it so member-to-member distances stay accurate across
        // sessions (the deck and full profiles both read this row).
        void (async () => {
          try {
            const token = await getAccessToken().catch(() => null);
            await fetch("/api/location", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                lat: o.lat,
                lng: o.lng,
                accuracyM: pos.coords.accuracy ?? null,
              }),
            });
          } catch {
            /* distances still work for this session via sessionStorage */
          }
        })();
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  };

  /* Preload + decode the photos of the next three cards so promotion is
     instant — no blank frame, no decode jank. */
  useEffect(() => {
    for (const k of [1, 2, 3]) {
      const p = profiles[index + k];
      const src = p?.photos?.[0] ?? p?.photo;
      if (src) {
        const img = new Image();
        img.src = src;
        img.decode().catch(() => undefined);
      }
    }
  }, [index, profiles]);

  const setStamp = (choice: Choice, opacity: number) => {
    const target =
      choice === "like" ? likeStampRef.current : choice === "pass" ? skipStampRef.current : null;
    if (target) target.style.opacity = String(opacity);
  };

  /**
   * Fly the top card off-screen, then advance the deck. The next card is
   * already mounted (and decoded) underneath, so there is no blank frame.
   */
  const flyOut = useCallback((choice: Choice) => {
    const el = topRef.current;
    setAnimating(choice);
    if (el) {
      const w = window.innerWidth || 420;
      const h = window.innerHeight || 800;
      let transform = "";
      if (choice === "like") transform = `translate3d(${w * 0.8 + 180}px, -24px, 0) rotate(22deg)`;
      else if (choice === "pass") transform = `translate3d(${-(w * 0.8 + 180)}px, -24px, 0) rotate(-22deg)`;
      else transform = `translate3d(0, ${-(h * 0.85)}px, 0) rotate(-4deg) scale(1.04)`;
      el.style.transition = `transform 460ms ${FLY_EASE}, opacity 400ms ease-out`;
      el.style.transform = transform;
      el.style.opacity = "0";
    }
    if (choice === "like") setStamp("like", 1);
    if (choice === "pass") setStamp("pass", 1);
  }, []);

  const recordChoice = useCallback(async (profile: Profile, choice: Choice) => {
    const token = await getAccessToken().catch(() => null);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profileId: profile.id, choice }),
      });
      if (res.status === 401) {
        window.location.href = "/auth?mode=sign-in";
        return;
      }
      if (res.ok) {
        const json = await res.json();
        if (json.matched) setMatchToast(profile.name);
        if (choice === "superlike") {
          setSuperToast(true);
          setTimeout(() => setSuperToast(false), 2600);
        }
      }
    } catch {
      /* network hiccup — the deck already moved on */
    }
  }, []);

  /**
   * "Say hello" — the reference's primary action, wired to the message-request
   * route rather than to a silent like.
   *
   * Until this existed the only way to reach a member from Discover was a
   * double-tap Super Like or the like button, and /api/chat/requests requires a
   * body with the recipient. The request lands in THEIR Messages, which is where
   * the route already tells both parties to look, and if a conversation already
   * exists it opens it. Nothing is sent without the member seeing the card that
   * names who it goes to.
   */
  const sayHello = useCallback(
    async (profile: Profile) => {
      if (animating) return;
      const token = await getAccessToken().catch(() => null);
      if (!token) {
        window.location.href = "/auth?mode=sign-in";
        return;
      }
      try {
        const res = await fetch("/api/chat/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: profile.id }),
        });
        const json = (await res.json().catch(() => null)) as
          | { matchId?: string; requestId?: string; incomingId?: string; error?: string }
          | null;
        if (res.ok && json?.matchId) {
          window.location.assign(`/app/chat?match=${json.matchId}`);
          return;
        }
        if (res.ok && json?.requestId) {
          setHelloToast(`${profile.name} has your hello in Messages.`);
          window.setTimeout(() => setHelloToast(null), 4000);
        }
      } catch {
        /* the card stays where it is; nothing was claimed */
      }
    },
    [animating]
  );

  const act = useCallback(
    (choice: Choice) => {
      if (!current || animating) return;
      const profile = current;
      flyOut(choice);
      void recordChoice(profile, choice);
      // Advance right as the card clears the frame; the under-card rises.
      setTimeout(() => {
        setAnimating(null);
        setIndex((i) => i + 1);
      }, 420);
    },
    [current, animating, flyOut, recordChoice]
  );

  const onSuperLike = (clientX: number, clientY: number) => {
    if (!current || animating) return;
    lastDoubleAt.current = Date.now();
    if (profileTapTimer.current) {
      clearTimeout(profileTapTimer.current);
      profileTapTimer.current = null;
    }
    setBubble({ x: clientX, y: clientY, key: Date.now() });
    setTimeout(() => setBubble(null), 1100);
    act("superlike");
  };

  /* --- Pointer handling: transforms written straight to the DOM ----------- */

  const onCardPointerDown = (e: React.PointerEvent) => {
    if (animating) return;
    draggedRef.current = false;
    axisRef.current = null;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      moved: false,
      lastX: e.clientX,
      lastT: performance.now(),
      vx: 0,
    };
    const el = topRef.current;
    if (el) el.style.transition = "none";
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onCardPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || animating) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    // Axis lock: the first decisive movement picks the gesture. Vertical
    // motion belongs to page scroll (touch-action: pan-y handles it);
    // horizontal motion belongs to the swipe.
    if (!axisRef.current) {
      if (Math.abs(dx) < 9 && Math.abs(dy) < 9) return;
      axisRef.current = Math.abs(dx) > Math.abs(dy) * 1.1 ? "h" : "v";
      if (axisRef.current === "v") {
        drag.current = null;
        const el = topRef.current;
        if (el) {
          el.style.transition = "transform 240ms ease";
          el.style.transform = "";
        }
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* native scroll takes over */
        }
        return;
      }
    }
    if (axisRef.current === "v") return;

    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      d.moved = true;
      draggedRef.current = true;
    }
    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) d.vx = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = now;
    d.dx = dx;

    const el = topRef.current;
    if (el) {
      const clampedDy = Math.max(-30, Math.min(30, dy));
      el.style.transform = `translate3d(${dx}px, ${clampedDy * 0.18}px, 0) rotate(${dx * 0.045}deg)`;
    }
    const strength = Math.min(1, Math.max(0, (Math.abs(dx) - 20) / 90));
    setStamp(dx > 0 ? "like" : "pass", dx > 0 || dx < 0 ? (Math.abs(dx) > 20 ? strength : 0) : 0);
  };

  const onCardPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    axisRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!d || animating) return;

    const flick = Math.abs(d.vx) > 0.55 && Math.abs(d.dx) > 36;
    if (d.moved && (Math.abs(d.dx) > 88 || flick)) {
      act(d.dx < 0 ? "pass" : "like");
      return;
    }

    // Spring back home.
    const el = topRef.current;
    if (el) {
      el.style.transition = `transform 380ms ${SPRING_EASE}`;
      el.style.transform = "";
    }
    setStamp("like", 0);
    setStamp("pass", 0);

    if (!d.moved) {
      const now = Date.now();
      const last = lastTap.current;
      const isDouble =
        now - last.t < 320 && Math.abs(e.clientX - last.x) < 70 && Math.abs(e.clientY - last.y) < 70;

      if (isDouble) {
        lastTap.current = { t: 0, x: 0, y: 0 };
        if (singleTapTimer.current) {
          clearTimeout(singleTapTimer.current);
          singleTapTimer.current = null;
        }
        onSuperLike(e.clientX, e.clientY);
        return;
      }

      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      // Taps that started on the name/bio button open the profile (the button
      // handles it); taps on the photo open the lightbox.
      /* The card setPointerCapture()s on pointerdown, so pointerup retargets
         to the card and e.target can no longer see the label button. Hit-test
         the coordinates as well, and open the profile from here so captured
         (mouse/pen) taps behave exactly like touch taps. */
      const onProfileButton =
        Boolean((e.target as HTMLElement).closest?.("[data-profile-btn]")) ||
        Boolean(document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-profile-btn]"));
      if (onProfileButton) {
        const tapped = profiles[index];
        if (tapped) openProfileTap(tapped.id, now);
        return;
      }
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        const p = profiles[index];
        if (p) setLightbox({ photos: p.photos, name: p.name, start: 0 });
      }, 240);
    }
  };

  const onCardPointerCancel = () => {
    drag.current = null;
    axisRef.current = null;
    const el = topRef.current;
    if (el) {
      el.style.transition = `transform 380ms ${SPRING_EASE}`;
      el.style.transform = "";
    }
    setStamp("like", 0);
    setStamp("pass", 0);
  };

  /* --- Room filters (the chips above the deck) ---------------------------- */

  const toggleRoomFilter = (key: string) => {
    const def = ROOM_FILTERS.find((f) => f.key === key);
    if (!def) return;
    const next = def.active(filters)
      ? /* turning a chip off removes exactly the term it added */ {
          ...filters,
          intents: filters.intents.filter((i) => i !== "long_term"),
          lifestyle: filters.lifestyle.filter(
            (l) => l !== "Natural wellness" && l !== "Health autonomy"
          ),
        }
      : def.apply(filters);
    setFilters(next);
    saveFilters(next);
  };

  /* --- Render -------------------------------------------------------------- */

  const stack = [profiles[index], profiles[index + 1], profiles[index + 2]];
  const roomCity = current?.city || profiles.find((p) => p.city)?.city || "";

  if (standalone) {
    /* /discover: the signed-out front door. It keeps its own honest copy and is
       not part of the member surface, so the shell around it stays minimal. */
    return (
      <div className="fb-sr mx-auto max-w-md px-5 py-6">
        <header className="mb-6 flex items-center justify-between">
          <Link href="/" className="transition hover:opacity-80">
            <Wordmark size="sm" />
          </Link>
          {signedIn === false ? (
            <Link
              href="/auth?mode=sign-in"
              className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[13px] font-bold text-[var(--sr-pearl)] transition hover:bg-white/[0.08]"
            >
              Sign in
            </Link>
          ) : null}
        </header>
        {loading ? (
          <div className="fb-skeleton aspect-[3/4.2] rounded-[28px]" />
        ) : signedOut || !current ? (
          <div className="fb-sr-card p-9 text-center">
            <p className="fb-sr-title text-[22px]">The room is for members.</p>
            <p className="mx-auto mt-3 max-w-[36ch] text-[13px] leading-6 text-[var(--sr-mist)]">
              Profiles are only shown to signed-in members, so no one&rsquo;s face, city or health
              views sit on a page the whole internet can read. Sign in to walk the room, or create
              an account first.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Link href="/auth?mode=sign-up" className="fb-sr-hello w-full">
                Create your account
              </Link>
              <Link
                href="/auth?mode=sign-in"
                className="text-[13px] font-bold text-[var(--sr-sand)] underline-offset-4 hover:underline"
              >
                I already have one
              </Link>
            </div>
          </div>
        ) : null}
        {openProfile ? (
          <ProfileView profileId={openProfile} onClose={() => setOpenProfile(null)} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[480px] lg:max-w-[520px]">
      {/* --- header -------------------------------------------------------
          Reference grid: eyebrow at y 89 (11px, 0.26em), title two lines at
          40px/1.06 with the first baseline at 150, bell 48px disc at x 452,
          coral count disc 24px riding its top-right corner. */}
      <header className="fb-sr-header pt-[4px]">
        <div className="min-w-0">
          <p className="fb-sr-eyebrow">{roomCity ? `Tonight in ${roomCity}` : "Tonight on Freeborn"}</p>
          <h1 className="fb-sr-header__title">Someone you&rsquo;ll remember.</h1>
        </div>
        {/* The reference's header disc holds a heart, not a bell: it is the
            "who liked you" count, and it opens Likes. Alerts keep their own
            door — the banners this screen already shows, and the Alerts row in
            the desktop sidebar. */}
        <Link
          href="/app/likes"
          aria-label={unreadLikes > 0 ? `Likes, ${unreadLikes} new` : "Likes"}
          className="fb-sr-disc fb-sr-bell mt-[10px]"
        >
          <span className="relative flex">
            <HeartIcon size={21} />
            {unreadLikes > 0 ? <span className="fb-sr-dot">{unreadLikes > 9 ? "9+" : unreadLikes}</span> : null}
          </span>
        </Link>
      </header>

      {/* --- room filters: the three chips in the reference, and a fourth
              scrollable slice of the same store so the panel is never the only
              way in. Each chip writes the saved filters the panel reads. ---- */}
      <div className="fb-sr-chiprow mt-[22px]">
        {ROOM_FILTERS.map((f) => {
          const on = f.active(filters);
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggleRoomFilter(f.key)}
              className="fb-sr-chip"
              style={
                on
                  ? undefined
                  : { borderColor: "rgba(238,168,152,0.26)", background: "linear-gradient(180deg,rgba(150,84,84,0.40),rgba(112,58,64,0.48))" }
              }
            >
              {f.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="Natural health stance"
          title="Natural health stance"
          onClick={() => toggleRoomFilter("natural-health")}
          className="fb-sr-chip fb-sr-chip--gold"
        >
          <DropletIcon size={19} />
        </button>
      </div>

      {/* --- match / super-like notices ----------------------------------- */}
      {matchToast ? (
        <div className="animate-scale-in mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#7ee2b0]/30 bg-[#7ee2b0]/[0.08] px-4 py-3">
          <p className="text-[12.5px] font-bold text-[#b9f2d2]">
            It&rsquo;s mutual. {matchToast} liked you back.
          </p>
          <Link
            href="/app/chat"
            className="shrink-0 text-[12px] font-black text-[var(--sr-pearl)] underline underline-offset-2"
          >
            Say hello
          </Link>
        </div>
      ) : null}

      {helloToast ? (
        <div className="animate-scale-in mt-4 rounded-2xl border border-[#ffd3ad]/30 bg-[#ffd3ad]/[0.08] px-4 py-3">
          <p className="text-[12.5px] font-bold text-[#ffe0c6]">{helloToast}</p>
        </div>
      ) : null}

      {superToast ? (
        <div className="animate-scale-in mt-4 rounded-2xl border border-[#a892ff]/35 bg-[#a892ff]/[0.09] px-4 py-3">
          <p className="text-[12.5px] font-bold text-[#cfc4ff]">
            Super like sent. You&rsquo;ll stand out in their stack.
          </p>
        </div>
      ) : null}

      {/* --- the deck ----------------------------------------------------- */}
      {loading ? (
        <div className="fb-skeleton mt-5 aspect-[3/4.1] rounded-[28px]" />
      ) : signedOut ? (
        <div className="fb-sr-card mt-5 p-8 text-center">
          <p className="fb-sr-title text-[21px]">The room is for members.</p>
          <p className="mx-auto mt-2.5 max-w-[36ch] text-[13px] leading-6 text-[var(--sr-mist)]">
            Profiles are only shown to signed-in members, so no one&rsquo;s face, city or health
            views sit on a page the whole internet can read. Sign in to walk the room, or create an
            account first.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Link href="/auth?mode=sign-up" className="fb-sr-hello w-full">
              Create your account
            </Link>
            <Link
              href="/auth?mode=sign-in"
              className="text-[13px] font-bold text-[var(--sr-sand)] underline-offset-4 hover:underline"
            >
              I already have one
            </Link>
          </div>
        </div>
      ) : !current ? (
        <div className="fb-sr-card mt-5 p-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.05] text-[var(--sr-warm-200)]">
            <SparkIcon size={22} />
          </span>
          <p className="fb-sr-title text-[21px]">
            {filteredOut
              ? `${roomTotal} ${roomTotal === 1 ? "member is" : "members are"} in the room, and your filters leave none of them.`
              : panelFiltersOn
                ? "No one matches those filters yet."
                : filters.distance < 500
                  ? `No one within ${formatDistance(filters.distance, units)} right now.`
                  : "You've met everyone here today."}
          </p>
          <p className="mx-auto mt-2.5 max-w-[34ch] text-[13px] leading-6 text-[var(--sr-mist)]">
            {filteredOut
              ? panelFiltersOn
                ? "Loosen a filter and they come back. The counts beside each option tell you how many members have actually answered it."
                : "Not the filter panel this time. The age window, distance and photo preference you saved in Settings narrow this deck too, and one of them is narrower than the room."
              : panelFiltersOn
                ? "Loosen a filter, or check back as the room grows."
                : filters.distance < 500
                  ? "The room is small and honest, so a tight radius can come up empty. Search everywhere below, or check back as your area grows."
                  : "New members join daily. Come back tomorrow, or walk the room again."}
          </p>
          <div className="mt-6 flex flex-col items-stretch gap-2.5">
            {filteredOut && !panelFiltersOn ? (
              <Link href="/app/settings" className="fb-sr-hello">
                Open discovery settings
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (panelFiltersOn) {
                    setFilters({ ...DEFAULT_FILTERS });
                    saveFilters({ ...DEFAULT_FILTERS });
                  } else {
                    setIndex(0);
                  }
                }}
                className="fb-sr-hello"
              >
                {panelFiltersOn ? "Clear filters" : "Meet them again"}
              </button>
            )}
            {profiles.length === 0 && filters.distance < 500 ? (
              <button
                type="button"
                onClick={() => {
                  const wider = { ...filters, distance: 500 };
                  setFilters(wider);
                  saveFilters(wider);
                }}
                className="rounded-full border border-white/10 px-6 py-3 text-[13px] font-bold text-[var(--sr-sand)] transition hover:text-[var(--sr-pearl)]"
              >
                Search everywhere
              </button>
            ) : null}
            {profiles.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const token = await getAccessToken().catch(() => null);
                    await fetch("/api/likes", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                      },
                      body: JSON.stringify({ action: "reset-passes" }),
                    }).catch(() => undefined);
                    void loadProfiles();
                  })();
                }}
                className="rounded-full border border-white/10 px-6 py-3 text-[13px] font-bold text-[var(--sr-sand)] transition hover:text-[var(--sr-pearl)]"
              >
                See people you passed again
              </button>
            ) : null}
          </div>
          <div className="mt-8 text-left">
            <MixerCard defaultCity="" />
          </div>
        </div>
      ) : (
        <>
          <div className="fb-sr-stage mt-[36px]">
            {stack.map((profile, k) => {
              if (!profile) return null;
              const isTop = k === 0;
              return (
                <DeckCard
                  key={profile.id}
                  profile={profile}
                  isTop={isTop}
                  depth={k}
                  units={units}
                  cardRef={isTop ? (el) => void (topRef.current = el) : undefined}
                  likeStampRef={isTop ? (el) => void (likeStampRef.current = el) : undefined}
                  passStampRef={isTop ? (el) => void (skipStampRef.current = el) : undefined}
                  handlers={
                    isTop
                      ? {
                          onPointerDown: onCardPointerDown,
                          onPointerMove: onCardPointerMove,
                          onPointerUp: onCardPointerUp,
                          onPointerCancel: onCardPointerCancel,
                        }
                      : undefined
                  }
                  onOpen={() => {
                    if (draggedRef.current) return;
                    if (singleTapTimer.current) {
                      clearTimeout(singleTapTimer.current);
                      singleTapTimer.current = null;
                    }
                    openProfileTap(profile.id, Date.now());
                  }}
                  onLike={() => act("like")}
                  onPass={() => act("pass")}
                  onSayHello={() => void sayHello(profile)}
                />
              );
            })}
          </div>

          {/* Position, undo, and the honest hint — quiet, below the card. */}
          <div className="mt-4 flex items-center justify-between gap-3 px-1">
            <button
              type="button"
              onClick={() => void undoLastSwipe()}
              disabled={undoBusy}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--sr-ash)] transition hover:text-[var(--sr-sand)] disabled:opacity-40"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
              </svg>
              {lastUndone ? "Undone" : "Undo"}
            </button>
            <p className="text-[11.5px] font-medium text-[var(--sr-ash)]">
              {index + 1} of {profiles.length} in the room
            </p>
            {!origin && typeof navigator !== "undefined" && navigator.geolocation ? (
              <button
                type="button"
                onClick={enableLocation}
                className="text-[11.5px] font-bold text-[var(--sr-ash)] transition hover:text-[var(--sr-sand)]"
              >
                Show distances
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--sr-ash)] opacity-0" aria-hidden>
                Show distances
              </span>
            )}
          </div>

          <p className="mt-2 flex items-center justify-center gap-1.5 text-[10.5px] font-medium text-[var(--sr-ash)]/80">
            <HeartIcon size={11} />
            Swipe to choose · tap the photo to enlarge · double-tap to Super Like
          </p>
        </>
      )}

      {/* Super-like bubble */}
      {bubble ? (
        <div
          key={bubble.key}
          className="pointer-events-none fixed z-[90]"
          style={{ left: bubble.x - 30, top: bubble.y - 30 }}
        >
          <div className="superlike-bubble flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#ffd3ad,#f0906a)] shadow-[0_18px_50px_-10px_rgba(240,144,106,0.7)]">
            <HeartIcon size={26} filled className="text-[#3a2418]" />
          </div>
        </div>
      ) : null}

      {lightbox ? (
        <PhotoLightbox
          photos={lightbox.photos}
          name={lightbox.name}
          startIndex={lightbox.start}
          onClose={() => setLightbox(null)}
        />
      ) : null}

      {openProfile ? <ProfileView profileId={openProfile} onClose={() => setOpenProfile(null)} /> : null}
    </div>
  );
}
