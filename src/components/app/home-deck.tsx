"use client";

import Link from "next/link";
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
  isOnline: boolean;
  vaccinationStatus: string;
  distanceKm: number | null;
  joinedAt: string | null;
  isNew?: boolean;
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
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; name: string; start: number } | null>(null);
  const [filters, setFilters] = useState<HomeFilters>({ ...DEFAULT_FILTERS });
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  /** Undo the last swipe — free everywhere else, free here too. */
  const [undoBusy, setUndoBusy] = useState(false);
  const [lastUndone, setLastUndone] = useState<string | null>(null);

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
      clearTimeout(profileTapTimer.current);
      profileTapTimer.current = null;
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
    // Bearer token lets the API exclude the viewer's own card from the deck.
    const token = await getAccessToken().catch(() => null);
    const res = await fetch(`/api/profiles?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const json = await res.json();
      setProfiles(json.profiles);
      setIndex(0);
      setSignedOut(false);
    } else if (res.status === 401) {
      setProfiles([]);
      setSignedOut(true);
    }
    setLoading(false);
  }, [filters, origin]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

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
        void loadProfiles();
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
      const onProfileButton = Boolean(
        (e.target as HTMLElement).closest?.("[data-profile-btn]")
      );
      if (onProfileButton) return;
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
        <div className="mb-5">
          <p className="eyebrow">Discover</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            The room is open.
          </h1>
        </div>
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
        <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.02] p-10 text-center">
          <p className="font-display text-xl font-semibold">The room is for members.</p>
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
        <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.02] p-10 text-center">
          <p className="font-display text-xl font-semibold">
            {profiles.length === 0 && hasActiveFilters(filters)
              ? "No one matches those filters yet."
              : "You've met everyone here today."}
          </p>
          <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-6 text-[var(--color-mist)]">
            {profiles.length === 0 && hasActiveFilters(filters)
              ? "Loosen a filter, or check back as the room grows."
              : "New members join daily. Come back tomorrow, or walk the room again."}
          </p>
          <button
            type="button"
            onClick={() => {
              if (profiles.length === 0 && hasActiveFilters(filters)) {
                setFilters({ ...DEFAULT_FILTERS });
                saveFilters({ ...DEFAULT_FILTERS });
              } else {
                setIndex(0);
              }
            }}
            className="btn-ghost mt-6 rounded-full px-7 py-3 text-sm font-bold"
          >
            {profiles.length === 0 && hasActiveFilters(filters) ? "Clear filters" : "Meet them again"}
          </button>
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

                <div className="relative aspect-[3/3.2] w-full overflow-hidden">
                  {profile.photos[0] ?? profile.photo ? (
                    <img
                      src={profile.photos[0] ?? profile.photo}
                      alt={`${profile.name}, ${profile.age}`}
                      draggable={false}
                      className="h-full w-full select-none object-cover"
                    />
                  ) : (
                    /* Placeholder card for a photoless profile (viewer allows them) */
                    <div
                      aria-hidden
                      className="flex h-full w-full select-none items-center justify-center bg-[var(--gradient-ember-warm)]"
                    >
                      <span className="font-display text-7xl font-bold text-white/90">
                        {(profile.name || "M").charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-abyss via-abyss/10 to-transparent" />

                  {/* Top-right badges: verification + unvaccinated stance.
                      The verified badge disappears when the member uploads a new
                      photo that a running identity check cannot confirm. */}
                  <div className="absolute right-4 top-8 z-10 flex flex-col items-end gap-2">
                    <div className="relative flex items-center gap-2">
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
                  </div>

                  {/* Photo count + open-viewer hint */}
                  {profile.photos.length > 1 ? (
                    <span className="absolute right-4 top-1/2 z-10 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold text-white/80 backdrop-blur-sm">
                      1/{profile.photos.length}
                    </span>
                  ) : null}

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
                    className="absolute inset-x-0 bottom-0 z-10 px-5 pb-3.5 pt-10 text-left"
                    aria-label={`View ${profile.name}'s full profile`}
                  >
                    <div className="flex items-baseline gap-2">
                      <h2 className="font-display text-[28px] font-semibold text-pearl">{profile.name}</h2>
                      <span className="font-display text-[22px] text-gold-300">{profile.age}</span>
                      {profile.isOnline && !profile.hideActiveStatus ? (
                        <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-teal-500)]/40 bg-[var(--color-teal-500)]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--color-teal-300)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-teal-300)]" />
                          Online
                        </span>
                      ) : null}
                      {profile.isNew ? (
                        <span className="rounded-full border border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--color-gold-300)]">
                          New here
                        </span>
                      ) : null}
                      <svg className="ml-auto h-4 w-4 text-white/70" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v4M12 16h.01" />
                      </svg>
                    </div>
                    <p className="text-[12px] tracking-wide text-sand">
                      {profile.occupation} · {profile.city}
                      {profile.distanceKm != null && !profile.hideDistance ? ` · ${profile.distanceKm} km` : ""}
                    </p>
                    {profile.joinedAt ? (
                      <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/45">
                        {joinedShort(profile.joinedAt)}
                      </p>
                    ) : null}
                  </button>
                </div>

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
                  className="block w-full space-y-3 p-5 text-left"
                >
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-gold-500">{profile.promptQuestion}</p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-ivory/90">{profile.promptAnswer}</p>
                    {profile.inCommon &&
                    (profile.inCommon.values.length > 0 ||
                      profile.inCommon.interests.length > 0 ||
                      profile.inCommon.goals.length > 0) ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="What you have in common">
                        {profile.inCommon.values.slice(0, 2).map((v) => (
                          <span key={`v-${v}`} className="fb-chip fb-chip-gold !text-[11px] !py-1">
                            {v}
                          </span>
                        ))}
                        {profile.inCommon.interests.slice(0, 2).map((i) => (
                          <span key={`i-${i}`} className="fb-chip fb-chip-teal !text-[11px] !py-1">
                            {i}
                          </span>
                        ))}
                        {profile.inCommon.goals.length > 0 ? (
                          <span className="fb-chip !text-[11px] !py-1">Same intentions</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.traits.map((trait) => (
                      <span
                        key={trait}
                        className="rounded-full border border-white/[0.07] bg-pearl/5 px-3 py-1 text-[11px] font-semibold tracking-wide text-sand"
                      >
                        {trait}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-ash)]">
                    Swipe to skip · tap for photos · double-tap to Super Like
                  </p>
                </button>
              </article>
            );
          })}

          {/* Actions: Undo · Skip · Super Like · Like */}
          <div className="mt-7 flex items-end justify-center gap-7">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => void undoLastSwipe()}
                disabled={undoBusy}
                aria-label="Undo last swipe"
                title="Undo your last swipe"
                className="btn-ghost flex h-[46px] w-[46px] items-center justify-center rounded-full transition active:scale-90 disabled:opacity-40"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 7v6h6" />
                  <path d="M21 17a9 9 0 00-15-6.7L3 13" />
                </svg>
              </button>
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-ash)]">
                {lastUndone ? "Undone ✓" : "Undo"}
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => act("pass")}
                aria-label="Skip (pass)"
                title="Skip"
                className="btn-ghost flex h-[62px] w-[62px] items-center justify-center rounded-full transition active:scale-90"
              >
                <svg width="24" height="24" viewBox="0 0 22 22" fill="none" aria-hidden>
                  <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-ash)]">Skip</span>
            </div>

            <div className="flex -translate-y-2 flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => onSuperLike(window.innerWidth / 2, window.innerHeight / 2)}
                aria-label="Super like"
                title="Super Like: stand out"
                className="superlike-btn relative flex h-[82px] w-[82px] items-center justify-center rounded-full text-white transition hover:scale-[1.04] active:scale-95"
              >
                <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2.5l2.1 4.9 5.3.5-4 3.6 1.2 5.2-4.6-2.8-4.6 2.8 1.2-5.2-4-3.6 5.3-.5L12 2.5z" />
                </svg>
              </button>
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-violet-300)]">Super Like</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => act("like")}
                aria-label="Like"
                title="Like"
                className="btn-ember btn-shine relative flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-full transition active:scale-90"
              >
                <svg width="26" height="26" viewBox="0 0 30 30" fill="none" aria-hidden>
                  <path
                    d="M15 25.5S3.9 18.6 3.9 11a5.6 5.6 0 0111.1-1.3A5.6 5.6 0 0126.1 11c0 7.6-11.1 14.5-11.1 14.5z"
                    fill="#fff7f2"
                  />
                </svg>
              </button>
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-ash)]">Like</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <p className="text-center text-[12px] tracking-wide text-[var(--color-ash)]">
              {index + 1} of {profiles.length} in the room
            </p>
            {!origin && navigator.geolocation ? (
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
          <div className="superlike-bubble flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] shadow-[0_18px_50px_-10px_rgba(239,94,94,0.7)]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff7f2" aria-hidden>
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
