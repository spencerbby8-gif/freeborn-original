"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient, getAccessToken } from "@/lib/supabase/browser";
import { VerifyBadge } from "@/components/verify-badge";
import { UnvaxBadge } from "@/components/unvax-badge";
import { Wordmark } from "@/components/wordmark";
import { ProfileView } from "./profile-view";
import { PhotoLightbox } from "./photo-lightbox";
import {
  buildProfileParams,
  DEFAULT_FILTERS,
  FILTERS_EVENT,
  hasActiveFilters,
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
  verified: boolean;
  isOnline: boolean;
  vaccinationStatus: string;
  distanceKm: number | null;
};

export function HomeDeck({ standalone = false }: { standalone?: boolean }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<"like" | "pass" | "superlike" | null>(null);
  const [entering, setEntering] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [matchToast, setMatchToast] = useState<string | null>(null);
  const [superToast, setSuperToast] = useState(false);
  const [bubble, setBubble] = useState<{ x: number; y: number; key: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; name: string; start: number } | null>(null);
  const [filters, setFilters] = useState<HomeFilters>({ ...DEFAULT_FILTERS });
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);

  const cardDrag = useRef<{ startX: number; startY: number; dx: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 });
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragState, setDragState] = useState({ dx: 0, dy: 0 });

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
    const res = await fetch(`/api/profiles?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setProfiles(json.profiles);
      setIndex(0);
    }
    setLoading(false);
  }, [filters, origin]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const current = profiles[index];

  const act = async (choice: "like" | "pass" | "superlike") => {
    if (!current || leaving) return;
    setLeaving(choice);
    const token = await getAccessToken().catch(() => null);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profileId: current.id, choice }),
      });
      if (res.status === 401) {
        window.location.href = "/auth?mode=sign-in";
        return;
      }
      if (res.ok) {
        const json = await res.json();
        if (json.matched) setMatchToast(current.name);
        if (choice === "superlike") {
          setSuperToast(true);
          setTimeout(() => setSuperToast(false), 2600);
        }
      }
    } finally {
      setTimeout(() => {
        setLeaving(null);
        setDragState({ dx: 0, dy: 0 });
        setEntering(true);
        setIndex((i) => i + 1);
        setTimeout(() => setEntering(false), 480);
      }, 340);
    }
  };

  const onSuperLike = (clientX: number, clientY: number) => {
    if (!current) return;
    setBubble({ x: clientX, y: clientY, key: Date.now() });
    setTimeout(() => setBubble(null), 1100);
    void act("superlike");
  };

  // Card pointer handling: horizontal drag = pass/like; tap = lightbox; double-tap = super like.
  const onCardPointerDown = (e: React.PointerEvent) => {
    cardDrag.current = { startX: e.clientX, startY: e.clientY, dx: 0, moved: false };
    // Capture the pointer so move/up keep firing on the card even if the
    // pointer started on a child (photo) or drifts outside while dragging.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onCardPointerMove = (e: React.PointerEvent) => {
    const d = cardDrag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 10 || Math.abs(e.clientY - d.startY) > 10) d.moved = true;
    d.dx = dx;
    setDragState({ dx, dy: Math.max(-24, Math.min(24, e.clientY - d.startY)) });
  };
  const onCardPointerUp = (e: React.PointerEvent) => {
    const d = cardDrag.current;
    cardDrag.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!d) return;

    // Horizontal drag → pass (left) / like (right)
    if (d.moved && Math.abs(d.dx) > 70) {
      setDragState({ dx: d.dx > 0 ? 500 : -500, dy: 0 });
      void act(d.dx < 0 ? "pass" : "like");
      return;
    }
    setDragState({ dx: 0, dy: 0 });

    // It was a tap (little/no movement) → detect single vs double tap.
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
      const tapX = e.clientX;
      const tapY = e.clientY;
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        if (current) setLightbox({ photos: current.photos, name: current.name, start: 0 });
      }, 260);
      void tapX;
      void tapY;
    }
  };

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
            It's mutual — {matchToast} liked you back.
          </p>
          <Link href="/app/chat" className="shrink-0 text-[12px] font-black text-[var(--color-pearl)] underline underline-offset-2">
            Say hello
          </Link>
        </div>
      ) : null}

      {superToast ? (
        <div className="animate-scale-in mb-4 rounded-2xl border border-[var(--color-violet-500)]/35 bg-[var(--color-violet-500)]/[0.09] px-4 py-3">
          <p className="text-[13px] font-bold text-[var(--color-violet-300)]">
            Super like sent — you'll stand out in their stack.
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="skeleton aspect-[3/4.6] rounded-[28px] border border-white/[0.07]" />
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
              : "New members join daily. Come back tomorrow — or walk the room again."}
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
        </div>
      ) : (
        <div className="relative">
          <article
            key={current.id}
            onPointerDown={onCardPointerDown}
            onPointerMove={onCardPointerMove}
            onPointerUp={onCardPointerUp}
            onPointerLeave={() => {
              cardDrag.current = null;
              setDragState({ dx: 0, dy: 0 });
            }}
            style={{ touchAction: "pan-y" }}
            className={`relative overflow-hidden rounded-[28px] border border-white/[0.09] bg-abyss shadow-[0_44px_100px_-26px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.08)_inset] ${
              leaving === "like"
                ? "translate-x-[60%] rotate-[10deg] opacity-0"
                : leaving === "pass"
                  ? "-translate-x-[60%] -rotate-[10deg] opacity-0"
                  : leaving === "superlike"
                    ? "-translate-y-[30%] scale-[1.04] opacity-0"
                    : ""
            } ${entering ? "card-rise-in" : ""}`}
          >
            {/* Drag hint overlays */}
            {dragState.dx < -40 ? (
              <span className="absolute left-5 top-6 z-20 rotate-[-8deg] rounded-xl border-2 border-red-400/80 px-3 py-1 text-sm font-black uppercase tracking-widest text-red-300">
                Skip
              </span>
            ) : null}
            {dragState.dx > 40 ? (
              <span className="absolute right-5 top-6 z-20 rotate-8 rounded-xl border-2 border-[var(--color-teal-300)] px-3 py-1 text-sm font-black uppercase tracking-widest text-[var(--color-teal-300)]">
                Like
              </span>
            ) : null}

            <div
              className="relative aspect-[3/3.4]"
              style={{
                transform:
                  leaving || entering
                    ? undefined
                    : `translate(${dragState.dx}px, ${dragState.dy * 0.15}px) rotate(${dragState.dx * 0.04}deg)`,
                transition: "transform 0.34s cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              <img
                src={current.photos[0] ?? current.photo}
                alt={`${current.name}, ${current.age}`}
                draggable={false}
                className="h-full w-full select-none object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-abyss via-transparent to-black/10" />

              {/* Top-right badges: unvaccinated + verified */}
              <div className="absolute right-4 top-8 z-10 flex flex-col items-end gap-2">
                {current.vaccinationStatus === "unvaccinated" ? <UnvaxBadge size={20} /> : null}
                {current.verified ? (
                  <span className="rounded-full bg-night/55 p-1.5 backdrop-blur-sm">
                    <VerifyBadge size={20} />
                  </span>
                ) : null}
              </div>

              {/* Photo count + open-viewer hint */}
              {current.photos.length > 1 ? (
                <span className="absolute right-4 top-1/2 z-10 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold text-white/80 backdrop-blur-sm">
                  1/{current.photos.length}
                </span>
              ) : null}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenProfile(current.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                className="absolute inset-x-0 bottom-0 z-10 px-5 pb-3.5 pt-10 text-left"
                aria-label={`View ${current.name}'s full profile`}
              >
                <div className="flex items-baseline gap-2">
                  <h2 className="font-display text-[28px] font-semibold text-pearl">{current.name}</h2>
                  <span className="font-display text-[22px] text-gold-300">{current.age}</span>
                  {current.isOnline ? (
                    <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-teal-500)]/40 bg-[var(--color-teal-500)]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--color-teal-300)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-teal-300)]" />
                      Online
                    </span>
                  ) : null}
                  <svg className="ml-auto h-4 w-4 text-white/70" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                </div>
                <p className="text-[12px] tracking-wide text-sand">
                  {current.occupation} · {current.city}
                  {current.distanceKm != null ? ` · ${current.distanceKm} km` : ""}
                </p>
              </button>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenProfile(current.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              className="block w-full space-y-3 p-5 text-left"
            >
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gold-500">{current.promptQuestion}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ivory/90">{current.promptAnswer}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {current.traits.map((trait) => (
                  <span
                    key={trait}
                    className="rounded-full border border-white/[0.07] bg-pearl/5 px-3 py-1 text-[11px] font-semibold tracking-wide text-sand"
                  >
                    {trait}
                  </span>
                ))}
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-ash)]">
                Swipe left to skip · tap photo to view · double-tap to Super Like
              </p>
            </button>
          </article>

          {/* Actions: Skip · Super Like · Like — moderate gap */}
          <div className="mt-7 flex items-end justify-center gap-7">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => void act("pass")}
                aria-label="Skip (pass)"
                title="Skip"
                className="btn-ghost flex h-[62px] w-[62px] items-center justify-center rounded-full"
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
                title="Super Like — stand out"
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
                onClick={() => void act("like")}
                aria-label="Like"
                title="Like"
                className="btn-ember btn-shine relative flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-full"
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
          <p className="mt-4 text-center text-[12px] tracking-wide text-[var(--color-ash)]">
            {index + 1} of {profiles.length} in the room
          </p>
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
