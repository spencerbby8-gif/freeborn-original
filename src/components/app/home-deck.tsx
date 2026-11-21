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
          <h1 className="mt-2 font-display text-3xl font-normal tracking-tight sm:text-4xl">
            Someone you&rsquo;ll<br />remember.
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

                <div className="relative aspect-[3/3.2] max-h-[54dvh] w-full overflow-hidden">
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

                  {/* Comp: NEW HERE sits in the photo's top-left corner */}
                  {profile.isNew ? (
                    <span className="absolute left-4 top-4 z-10 text-[10px] font-black uppercase tracking-[0.3em] text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                      New here
                    </span>
                  ) : null}

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
                    className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-5 pb-4 pt-14 text-left"
                    aria-label={`View ${profile.name}'s full profile`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate font-display text-[30px] font-normal leading-none tracking-tight text-pearl">{profile.name}</h2>
                      {profile.verified ? <VerifyBadge size={22} /> : null}
                      <span className="shrink-0 font-display text-[20px] font-normal text-gold-300">{profile.age}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] font-medium tracking-wide text-[#ece8dd]">
                      {profile.occupation} · {profile.city}
                      {profile.distanceKm != null && !profile.hideDistance
                        ? ` · ${formatDistance(profile.distanceKm, units)}`
                        : ""}
                    </p>
                    {/* Presence: plain dot + tier label, no pill chrome (honest tiers only) */}
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                      {(() => {
                        const tier = profile.presence;
                        const dot =
                          tier === "now" ? "#57d38a" : tier === "today" ? "#57d38a" : "#a5a1b4";
                        const label =
                          tier === "now" ? "Online now" : tier === "today" ? "Active today" : tier === "week" ? "Active this week" : null;
                        if (!label) return null;
                        return (
                          <>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot, boxShadow: `0 0 6px ${dot}` }} />
                            {label}
                            {profile.joinedAt ? <span className="font-normal normal-case tracking-normal text-white/45"> · {joinedShort(profile.joinedAt)}</span> : null}
                          </>
                        );
                      })()}
                    </p>
                    {/* Comp chips: their interests when shared, else their traits — real fields only */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(profile.inCommon?.interests ?? []).slice(0, 3).map((i) => (
                        <span key={`i-${i}`} className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm">
                          {i}
                        </span>
                      ))}
                      {(profile.inCommon?.interests?.length ?? 0) === 0
                        ? profile.traits.slice(0, 3).map((t) => (
                            <span key={`t-${t}`} className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm">
                              {t}
                            </span>
                          ))
                        : null}
                    </div>
                    {profile.headline ? (
                      <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-white/85">{profile.headline}</p>
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
                  className="block max-h-[30dvh] w-full space-y-3 overflow-y-auto p-5 text-left"
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
                        {profile.inCommon.goals.length > 0 ? (
                          <span className="fb-chip !text-[11px] !py-1">Same intentions</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--color-ash)]">Their traits</p>
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
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-ash)]">
                    Swipe to skip · tap for photos · double-tap to Super Like
                  </p>
                </button>
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
          <div className="action-row mt-6 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => act("pass")}
              aria-label="Skip (pass)"
              title="Skip"
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[var(--color-abyss)] text-[var(--color-pearl)] transition hover:bg-[var(--color-slate)] active:scale-90"
            >
              <svg width="21" height="21" viewBox="0 0 22 22" fill="none" aria-hidden>
                <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => act("like")}
              aria-label="Like — say hello"
              title="Say hello"
              className="btn-ember btn-shine relative flex h-[52px] shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full px-7 transition active:scale-95"
            >
              <svg width="19" height="19" viewBox="0 0 30 30" fill="none" aria-hidden>
                <path
                  d="M15 25.5S3.9 18.6 3.9 11a5.6 5.6 0 0111.1-1.3A5.6 5.6 0 0126.1 11c0 7.6-11.1 14.5-11.1 14.5z"
                  fill="#2a1a10"
                />
              </svg>
              <span className="text-[15px] font-bold tracking-tight text-[#2a1a10]">Say hello</span>
            </button>

            <button
              type="button"
              onClick={() => onSuperLike(window.innerWidth / 2, window.innerHeight / 2)}
              aria-label="Super like"
              title="Super Like: stand out"
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[var(--color-abyss)] text-[var(--color-gold-500)] transition hover:bg-[var(--color-slate)] active:scale-90"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Undo keeps its capability but leaves the three-control row the mock draws. */}
          <div className="mt-3 flex items-center justify-center">
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
