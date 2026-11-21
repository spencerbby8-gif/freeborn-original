"use client";

import { PhotoImage } from "@/components/ui/photo-image";

import Link from "next/link";
import { formatDistance, useDistanceUnits } from "@/lib/device-prefs";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient, getAccessToken } from "@/lib/supabase/browser";
import { UnvaxBadge } from "@/components/unvax-badge";
import { VerifyBadge } from "@/components/verify-badge";
import { UnvaxTip } from "@/components/unvax-tip";
import { Wordmark } from "@/components/wordmark";
import { MixerCard } from "./settings-view";
import { ProfileView } from "./profile-view";
import { PhotoLightbox } from "./photo-lightbox";
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
  /** Raw facts the prototype card + detail grid render. All nullable/empty when
      the member has not answered; the UI omits an empty slot rather than
      inventing a value. */
  heightCm?: number | null;
  drinking?: string;
  zodiac?: string;
  language?: string;
  religion?: string;
  education?: string;
  smoking?: string;
  maritalStatus?: string;
  hasKids?: string;
  wantsKids?: string;
};

function joinedShort(iso: string | null) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "joined today";
  if (days < 31) return `joined ${days}d ago`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `joined ${months}mo ago`;
  return `joined ${Math.floor(months / 12)}y ago`;
}

/** 173 -> 5'8". Returns null when unset so the card omits the field entirely
    instead of printing a placeholder or, worse, an invented number. */
function heightLabelOf(cm: number | null | undefined): string | null {
  if (!cm || cm < 120 || cm > 250) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}\u2019${inches}\u201d`;
}

/** Truthful presence wording, matching the prototype's card-meta vocabulary.
    The tier is already computed server-side; this only chooses words. */
function presenceLabelOf(tier: string | null): string | null {
  if (tier === "now") return "Online now";
  if (tier === "today") return "Active today";
  if (tier === "week") return "Active this week";
  return null;
}

type Choice = "like" | "pass" | "superlike";

/** Ease used for the fly-out: fast launch, soft exit. */
const FLY_EASE = "cubic-bezier(0.18, 0.9, 0.24, 1)";
/** Spring-back when a drag is released below the threshold. */
const SPRING_EASE = "cubic-bezier(0.2, 1.4, 0.4, 1)";

export function HomeDeck({ standalone = false }: { standalone?: boolean }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState<Choice | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [matchToast, setMatchToast] = useState<string | null>(null);
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

  /* ------------------------------------------------------------------------
     Header facts for the prototype Discover header.
     The mock hardcodes "TONIGHT IN BROOKLYN" and three intention chips. Those
     are this member's own words on a real surface, so they are read from the
     member's profile instead of being printed as decoration. Everything here
     degrades to the mock's framing when a member has stated nothing, which
     keeps the design intact for a brand-new account with an empty profile.
     ------------------------------------------------------------------------ */
  const [viewerCity, setViewerCity] = useState<string>("");
  const [viewerIntents, setViewerIntents] = useState<string[]>([]);

  useEffect(() => {
    if (signedIn !== true) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getAccessToken().catch(() => null);
        const res = await fetch("/api/profile/me", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        /* The payload is nested: { profile: { … }, completeness, … }.
           Reading city off the top level silently yielded "" and the eyebrow
           fell back to the mock's own "BROOKLYN" for a member whose real city
           is Enugu — measured, fixed. */
        const json = (await res.json()) as {
          profile?: {
            city?: string;
            relationshipGoals?: string[];
            values?: string[];
            lifestyle?: string[];
          };
        };
        const me = json.profile ?? {};
        if (cancelled) return;
        setViewerCity((me.city ?? "").trim());
        /* Chips, in the reference's own order: the member's primary intention
           first (rendered with .chip-rose), then two things they actually
           stated about themselves (rendered .chip-rose-dim), then the flame.
           Deduplicated, and only ever from fields the member filled in. */
        const goalLabel = (g: string) =>
          (
            {
              life_partner: "Long-term",
              marriage: "Marriage",
              long_term: "Long-term",
              still_exploring: "Still exploring",
              short_term: "Something casual",
              friends: "New friends",
            } as Record<string, string>
          )[g] ?? g.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
        const goal = (me.relationshipGoals ?? [])[0];
        const chips = [
          ...(goal ? [goalLabel(goal)] : []),
          ...(me.values ?? []),
          ...(me.lifestyle ?? []),
        ].filter(Boolean);
        setViewerIntents(Array.from(new Set(chips)).slice(0, 3));
      } catch {
        /* header falls back to the prototype's own wording */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  /* Live unread count for the header heart — same event the tab bar listens to,
     so the heart and the nav can never disagree. */
  const [heartCount, setHeartCount] = useState(0);
  useEffect(() => {
    const onUnread = (e: Event) => {
      const d = (e as CustomEvent<{ alerts?: number; chat?: number }>).detail;
      if (!d) return;
      setHeartCount((d.alerts ?? 0) + (d.chat ?? 0));
    };
    window.addEventListener("freeborn:unread", onUnread);
    return () => window.removeEventListener("freeborn:unread", onUnread);
  }, []);

  /* "TONIGHT IN <CITY>" — the mock's exact wording. Falls back to the mock's
     own city only while the member's profile has no city on it. */
  const discoverEyebrow = viewerCity
    ? `TONIGHT IN ${viewerCity.toUpperCase()}`
    : "TONIGHT IN BROOKLYN";
  const intentChips = viewerIntents.length > 0 ? viewerIntents : [];

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

  const loadProfiles = useCallback(async () => {
    const params = buildProfileParams(filters, origin);
    /* Bearer token lets the API exclude the viewer's own card from the deck.
       ---------------------------------------------------------------------
       RACE, measured on the preview deployment (393x852, signed in as a real
       member): this effect runs on mount, which can be BEFORE the Supabase
       client has hydrated the stored session. getAccessToken() then returns
       null, /api/profiles answers 401, and the deck latched into its
       "The room is for members" panel for a member who was in fact signed in —
       with no retry, because nothing re-ran once the session appeared. On the
       same page load /api/profile/me returned 200, which is how the
       inconsistency showed up.
       Fix: wait for the session to hydrate before the first attempt, and if the
       API still answers 401, retry once after getSession() has resolved. */
    let token = await getAccessToken().catch(() => null);
    if (!token) {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token ?? null;
      } catch {
        /* fall through to the 401 path below */
      }
    }
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

  const recordChoice = useCallback(
    async (profile: Profile, choice: Choice) => {
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
    },
    []
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
        Boolean(
          document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest("[data-profile-btn]")
        );
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

  /* --- Render -------------------------------------------------------------- */

  const stack = [profiles[index], profiles[index + 1], profiles[index + 2]];

  /* Values the prototype card body renders, derived once per render from real
     fields. Every one can be null/empty — the card omits the slot rather than
     filling it with mock copy. */
  const activeProfile = current ?? null;
  const heightLabel = activeProfile ? heightLabelOf(activeProfile.heightCm) : null;
  const presenceLabel = activeProfile ? presenceLabelOf(activeProfile.presence) : null;
  const cardTags = activeProfile
    ? (activeProfile.inCommon?.interests?.length
        ? activeProfile.inCommon.interests
        : activeProfile.traits
      ).slice(0, 3)
    : [];
  const cardBio = activeProfile?.headline?.trim() || null;

  return (
    <div className="mx-auto max-w-md">
      {standalone ? (
        <header className="mb-6 flex items-center justify-between">
          <Link href="/" className="transition hover:opacity-80">
            <Wordmark size="sm" />
          </Link>
          {signedIn === false ? (
            <Link
              href="/auth?mode=sign-in"
              className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[13px] font-bold text-[var(--color-pearl)] transition hover:bg-white/[0.08]"
            >
              Sign in
            </Link>
          ) : null}
        </header>
      ) : (
        /* ------------------------------------------------------------------
           Prototype Discover header, rebuilt element-for-element from
           prototype/index.html #screen-discover so nothing here is an
           approximation of the mock:

             .eyebrow       "TONIGHT IN BROOKLYN"  (was the bare word "Discover")
             .disc-heart    heart + .badge          (the mock's notification bell)
             .disc-headline .display                (Georgia serif, not sans)
             .intent-chips  chips + .chip-flame

           DATA INTEGRITY: the mock's chips read "Long-term / Natural health /
           Health autonomy", and the flame pill has a fixed title. Those are
           this member's own stated intentions, not decoration, so the chips are
           rendered from viewer values where they exist and fall back to the
           product's own framing only when the member has stated nothing. The
           eyebrow's city is likewise the member's real city, with the mock's
           wording kept as the default.

           The bell keeps the prototype's exact SVG path (the brief was to leave
           that icon alone). Its badge is no longer the literal "2": it carries
           the live unread count and disappears at zero.
           ------------------------------------------------------------------ */
        <>
        <div className="disc-head">
          <p className="eyebrow">{discoverEyebrow}</p>
          <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("freeborn:open-filters"))}
            aria-label="Open filters"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-sand)] transition hover:bg-white/[0.06] hover:text-[var(--color-pearl)]"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
          </button>
          <Link
            href="/app/notifications"
            className="disc-heart"
            aria-label={heartCount > 0 ? `Notifications, ${heartCount} unread` : "Notifications"}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 20s-6.8-4.5-9.2-9.3C1.6 7.7 4.2 4.9 7.2 4.9c1.8 0 3.3.9 4.8 2.4 1.5-1.5 3-2.4 4.8-2.4 3 0 5.6 2.8 4.4 5.8C18.8 15.5 12 20 12 20z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            {heartCount > 0 ? (
              <span className="badge">{heartCount > 9 ? "9+" : heartCount}</span>
            ) : null}
          </Link>
          </div>
        </div>
        <h1 className="display disc-headline">
          Someone you&rsquo;ll<br />remember.
        </h1>
        {intentChips.length > 0 ? (
          /* The reference lays these out in one non-wrapping row. Real member
             values ("Medical freedom", "Natural health") are longer than the
             mock's placeholders, so the row overflowed the viewport by 10px and
             clipped the flame chip. Scrolling the row keeps the single line the
             mock specifies without widening the document. */
          <div className="intent-chips overflow-x-auto pb-1">
            {intentChips.map((chip, i) => (
              <span key={chip} className={i === 0 ? "chip chip-rose" : "chip chip-rose-dim"}>
                {chip}
              </span>
            ))}
            {/* The flame is the product's standing statement about health
                autonomy, not a member value, so it is ordered FIRST and never
                scrolls out of view when a member's own chips are longer than
                the mock's placeholders. In the reference it is last because
                nothing there overflows. */}
            <span className="chip chip-flame order-first" title="Natural health">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 5z"
                  stroke="#e9c37c"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </div>
        ) : null}
        </>
      )}

      {matchToast ? (
        <div className="animate-scale-in mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-teal-500)]/30 bg-[var(--color-teal-500)]/[0.08] px-4 py-3">
          <p className="text-[13px] font-bold text-[var(--color-teal-300)]">
            It&apos;s mutual. {matchToast} liked you back.
          </p>
          <Link href="/app/chat" className="shrink-0 text-[12px] font-black text-[var(--color-pearl)] underline underline-offset-2">
            Say hello
          </Link>
        </div>
      ) : null}

      {superToast ? (
        <div className="animate-scale-in mb-4 rounded-2xl border border-[var(--color-violet-500)]/35 bg-[var(--color-violet-500)]/[0.09] px-4 py-3">
          <p className="text-[13px] font-bold text-[var(--color-violet-300)]">
            Super like sent. You&apos;ll stand out in their stack.
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="skeleton aspect-[3/4.6] rounded-[28px] border border-white/[0.07]" />
      ) : signedOut ? (
        <div className="rounded-[26px] border border-[var(--color-line)] bg-[var(--color-midnight)] p-10 text-center">
          <p className="font-display text-[26px] font-normal tracking-tight">The room is for members.</p>
          <p className="mx-auto mt-2 max-w-[36ch] text-sm leading-6 text-[var(--color-mist)]">
            Profiles are only shown to signed-in members, so no one&rsquo;s face, city or
            health views sit on a page the whole internet can read. Sign in to walk the
            room, or create an account first.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Link
              href="/auth?mode=sign-up"
              className="btn-ember rounded-full px-7 py-3 text-sm font-bold"
            >
              Create your account
            </Link>
            <Link
              href="/auth?mode=sign-in"
              className="btn-ghost rounded-full px-7 py-3 text-sm font-bold"
            >
              I already have one
            </Link>
          </div>
        </div>
      ) : !current ? (
        <div className="rounded-[26px] border border-[var(--color-line)] bg-[var(--color-midnight)] p-10 text-center">
          <p className="font-display text-[26px] font-normal tracking-tight">
            {filteredOut
              ? `${roomTotal} ${roomTotal === 1 ? "member is" : "members are"} in the room, and your filters leave none of them.`
              : panelFiltersOn
                ? "No one matches those filters yet."
                : filters.distance < 500
                  ? `No one within ${formatDistance(filters.distance, units)} right now.`
                  : "You've met everyone here today."}
          </p>
          <p className="mx-auto mt-2 max-w-[32ch] text-sm leading-6 text-[var(--color-mist)]">
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
          {filteredOut && !panelFiltersOn ? (
            <Link
              href="/app/settings"
              className="btn-ghost mt-6 inline-block rounded-full px-7 py-3 text-sm font-bold"
            >
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
              className="btn-ghost mt-6 rounded-full px-7 py-3 text-sm font-bold"
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
              className="btn-ember mt-3 rounded-full px-7 py-3 text-sm font-bold"
            >
              Search everywhere (remove distance cap)
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
              className="btn-ghost mt-3 rounded-full px-7 py-3 text-sm font-bold"
            >
              See people you passed again
            </button>
          ) : null}
          <div className="mt-8 text-left">
            <MixerCard defaultCity="" />
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* Stacked deck: card 0 is interactive; cards 1–2 wait underneath. */}
          {stack.map((profile, k) => {
            if (!profile) return null;
            const isTop = k === 0;
            return (
              <article
                key={profile.id}
                ref={isTop ? (el) => void (topRef.current = el) : undefined}
                onPointerDown={isTop ? onCardPointerDown : undefined}
                onPointerMove={isTop ? onCardPointerMove : undefined}
                onPointerUp={isTop ? onCardPointerUp : undefined}
                onPointerCancel={isTop ? onCardPointerCancel : undefined}
                style={{
                  position: isTop ? "relative" : "absolute",
                  inset: isTop ? undefined : "0 0 auto 0",
                  zIndex: 30 - k * 10,
                  transform: isTop ? undefined : `translateY(${k * 13}px) scale(${1 - k * 0.048})`,
                  opacity: isTop ? 1 : k === 1 ? 0.9 : 0.55,
                  transition: `transform 440ms cubic-bezier(0.22,1,0.36,1), opacity 440ms ease`,
                  pointerEvents: isTop ? "auto" : "none",
                  touchAction: isTop ? "pan-y" : undefined,
                  willChange: "transform",
                }}
                className="deck-card overflow-hidden rounded-[26px] border hairline bg-abyss shadow-[0_44px_100px_-26px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.08)_inset]"
              >
                {/* Drag / action stamps (top card only) */}
                {isTop ? (
                  <>
                    <span
                      ref={skipStampRef}
                      className="pointer-events-none absolute left-5 top-6 z-20 rotate-[-8deg] rounded-xl border-2 border-red-400/80 px-3 py-1 text-sm font-black uppercase tracking-widest text-red-300"
                      style={{ opacity: 0 }}
                    >
                      Skip
                    </span>
                    <span
                      ref={likeStampRef}
                      className="pointer-events-none absolute right-5 top-6 z-20 rotate-8 rounded-xl border-2 border-[var(--color-teal-300)] px-3 py-1 text-sm font-black uppercase tracking-widest text-[var(--color-teal-300)]"
                      style={{ opacity: 0 }}
                    >
                      Like
                    </span>
                  </>
                ) : null}

                {/* ------------------------------------------------------------------
                    PROTOTYPE CARD INTERIOR — rebuilt to prototype/index.html
                    .profile-card so the body sits INSIDE the photo, not in a
                    panel beneath it.

                    Before this change the card stacked two regions: a photo
                    box, then a separate scrollable panel holding the prompt,
                    common-ground chips and trait pills. That is the single
                    clearest divergence from the reference, and it also pushed
                    the action row off-screen. The reference has exactly one
                    surface: photo, shade, then .card-body pinned to the bottom
                    with name / sub / meta / tags / bio.

                    Nothing was discarded in the move:
                      · the prompt answer and the "in common" chips were real
                        content with no slot in the reference card, so they are
                        rendered by the profile-detail surface instead, which is
                        where the reference puts long-form material
                        (.about-panel / .pd-about);
                      · the verified and unvaccinated badges, the NEW HERE
                        marker, the photo counter and the Super-Like-on-double-
                        tap gesture are all preserved, just re-placed onto the
                        reference's own geometry.
                    ------------------------------------------------------------------ */}
                <div className="relative aspect-[3/3.4] max-h-[58dvh] w-full overflow-hidden">
                  {profile.photos[0] ?? profile.photo ? (
                    <PhotoImage
                      src={profile.photos[0] ?? profile.photo}
                      alt={`${profile.name}, ${profile.age}`}
                      className="h-full w-full"
                      priority
                    />
                  ) : (
                    /* Placeholder card for a photoless profile (viewer allows them) */
                    <div
                      aria-hidden
                      className="flex h-full w-full select-none items-center justify-center bg-[var(--gradient-ember-warm)]"
                    >
                      <span className="font-display text-7xl font-normal text-[#2a1a10]/85">
                        {(profile.name || "M").charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* NEW HERE — reference places it top-left over the photo. */}
                  {profile.isNew ? <span className="new-here">NEW HERE</span> : null}

                  {/* Verification + health-stance badges, top-right, above the
                      shade so they stay legible on a bright photo. */}
                  <div className="absolute right-4 top-3 z-10 flex items-center gap-2">
                    {profile.verified ? (
                      <span className="rounded-full bg-night/55 p-1.5 backdrop-blur-sm">
                        <VerifyBadge size={20} />
                      </span>
                    ) : null}
                    {profile.vaccinationStatus === "unvaccinated" ? (
                      <UnvaxBadge size={17} withLabel />
                    ) : null}
                    {isTop && profile.vaccinationStatus === "unvaccinated" ? (
                      <UnvaxTip key={profile.id} />
                    ) : null}
                  </div>

                  {/* Photo count stays visible on a multi-photo profile. */}
                  {profile.photos.length > 1 ? (
                    <span className="absolute right-4 top-1/2 z-10 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold text-white/80 backdrop-blur-sm">
                      1/{profile.photos.length}
                    </span>
                  ) : null}

                  {/* The reference's shade — a fixed gradient, not a Tailwind
                      approximation, so the text contrast matches the mock. */}
                  <div className="card-shade" />

                  {/* Whole-card tap target: opens the profile. Sits under the
                      body so the body's own text is not clipped by it. */}
                  <button
                    type="button"
                    data-profile-btn
                    onClick={(e) => {
                      e.stopPropagation();
                      if (draggedRef.current) return;
                      if (singleTapTimer.current) {
                        clearTimeout(singleTapTimer.current);
                        singleTapTimer.current = null;
                      }
                      openProfileTap(profile.id, Date.now());
                    }}
                    aria-label={`View ${profile.name}'s full profile`}
                    className="absolute inset-0 z-10"
                  />

                  {/* .card-body — inside the photo, pinned to the bottom. */}
                  <div className="card-body z-20">
                    <h2 className="card-name">
                      {profile.name}
                      {profile.verified ? (
                        <span className="verified ml-1.5">
                          <VerifyBadge size={20} />
                        </span>
                      ) : null}
                    </h2>
                    <p className="card-sub">
                      {[String(profile.age), profile.occupation, profile.city]
                        .filter(Boolean)
                        .join(" · ")}
                      {profile.distanceKm != null && !profile.hideDistance
                        ? ` · ${formatDistance(profile.distanceKm, units)}`
                        : ""}
                    </p>
                    <p className="card-meta">
                      {heightLabel ? (
                        <>
                          {heightLabel}
                          {presenceLabel ? <span className="sep">·</span> : null}
                        </>
                      ) : null}
                      {presenceLabel ? (
                        <>
                          <i className="pulse-dot" />
                          {presenceLabel}
                        </>
                      ) : null}
                      {profile.joinedAt && !presenceLabel ? joinedShort(profile.joinedAt) : null}
                    </p>
                    {cardTags.length > 0 ? (
                      <div className="card-tags">
                        {cardTags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    ) : null}
                    {cardBio ? <p className="card-bio">{cardBio}</p> : null}
                  </div>
                </div>
              </article>
            );
          })}

          {/* Actions — rebuilt to the approved mock (.action-row: 52px / pill / 52px, 24px gap).
              The previous row measured 463px of content inside a 393px viewport
              (undo 46 + pass 64 + super 64 + a 181px "Say hello" pill + 84px of gap-7
              + 24px padding), so both circles and the pill were visually clipped — the
              single worst defect on the Discover surface. Three causes, all removed:
                · the caption row under each control ("SUPER LIKE" at 10px/.16em is wider
                  than the 64px circle it sits under) — the mock has no captions;
                · Undo was a fourth control the mock does not have, competing for width —
                  it moves below the row, keeping the capability without the geometry;
                · the pill now sizes to its content instead of carrying px-8 on a fixed
                  h-16, and is clamped with max-w so a long label can never push it out.
              Labels stay in aria-label/title, so nothing is lost to a screen reader. */}
          {/* `sticky bottom-[72px]` is load-bearing: without an anchor the row renders at
              y=864 in an 852px viewport, i.e. entirely below the fold, and the member has to
              scroll to reach "Say hello". Measured, not assumed — the first attempt at this
              row dropped the anchor and did exactly that. */}
                    {/* ------------------------------------------------------------------
              ACTION ROW — the prototype's own markup.

              This is now literally prototype/index.html's .action-row:
                  circle-btn(pass) · say-hello · circle-btn(spark)
              driven by the skin's CSS (52px circles, 24px gap, gradient pill,
              no captions) rather than a hand-tuned Tailwind imitation of it.
              Every previous attempt diverged because it re-drew the row in
              utility classes and then had to be measured back into shape; using
              the reference classes removes that whole class of drift.

              The controls keep their real behaviour:
                  pass  -> act("pass")
                  pill  -> act("like")   (labelled "Say hello", as in the mock)
                  spark -> super like
              aria-labels carry the precise meaning, so a screen reader still
              hears "Skip" / "Super like" even though the mock shows only icons.

              `sticky` is kept for a measured reason: without an anchor this row
              renders below the fold on a 393x852 viewport and the member has to
              scroll to reach "Say hello". The mock is a fixed-height phone so it
              never hit this; a real scrolling page does.
              ------------------------------------------------------------------ */}
          <div className="action-row fixed inset-x-0 bottom-[72px] z-40 mx-auto mt-4 w-[calc(100%-32px)] max-w-[420px] rounded-[26px] border border-white/[0.06] bg-[#070a12]/92 py-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => act("pass")}
              aria-label="Skip (pass)"
              title="Skip"
              className="circle-btn shrink-0 active:scale-90"
            >
              <svg viewBox="0 0 24 24" fill="none" width="21" height="21" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => act("like")}
              aria-label="Like — say hello"
              title="Say hello"
              className="say-hello shrink-0 active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="none" width="19" height="19" aria-hidden>
                <path
                  d="M12 20s-6.8-4.6-9.1-9.5C1.9 7.4 4.6 4.7 7.4 4.7c1.8 0 3.3 1 4.6 2.3 1.3-1.3 2.8-2.3 4.6-2.3 2.8 0 5.5 2.7 4.5 5.8C18.8 15.4 12 20 12 20z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              Say hello
            </button>

            <button
              type="button"
              onClick={() => onSuperLike(window.innerWidth / 2, window.innerHeight / 2)}
              aria-label="Super like"
              title="Super Like: stand out"
              className="circle-btn shrink-0 active:scale-90"
            >
              <svg viewBox="0 0 24 24" fill="none" width="21" height="21" aria-hidden>
                <path
                  d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 5z"
                  stroke="#e9c37c"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Undo stays, below the row, because the reference draws exactly three
              controls and adding a fourth is what clipped the previous version.
              The capability is preserved rather than dropped. */}
          {/* Clearance for the fixed action row (71px) + tab bar (72px), so the
              bottom of the card is never hidden behind them. */}
          <div className="h-[92px]" aria-hidden />
          <div className="mt-3 flex items-center justify-center gap-2 pb-1">
            <button
              type="button"
              onClick={() => void undoLastSwipe()}
              disabled={undoBusy}
              aria-label="Undo last swipe"
              title="Undo your last swipe"
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-[var(--color-ash)] transition hover:text-[var(--color-pearl)] active:scale-95 disabled:opacity-40"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 00-15-6.7L3 13" />
              </svg>
              {lastUndone ? "Undone" : "Undo"}
            </button>
            <p className="text-center text-[12px] tracking-wide text-[var(--color-ash)]">
              {index + 1} of {profiles.length}
            </p>
            {!origin && typeof navigator !== "undefined" && navigator.geolocation ? (
              <button
                type="button"
                onClick={enableLocation}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10.5px] font-bold text-[var(--color-sand)] transition hover:text-[var(--color-pearl)]"
              >
                Show distances
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Super-like bubble */}
      {bubble ? (
        <div key={bubble.key} className="pointer-events-none fixed z-[90]" style={{ left: bubble.x - 30, top: bubble.y - 30 }}>
          <div className="superlike-bubble flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] shadow-[0_18px_50px_-10px_rgba(240,190,140,0.45)]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#2a1a10" aria-hidden>
              <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.4 10.4-8.4 10.4z" />
            </svg>
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
