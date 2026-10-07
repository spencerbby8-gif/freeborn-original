"use client";

import { useEffect, useRef, useState } from "react";
import { VerifyBadge } from "@/components/verify-badge";
import { UnvaxBadge } from "@/components/unvax-badge";
import { PhotoLightbox } from "./photo-lightbox";
import { getAccessToken } from "@/lib/supabase/browser";

type FullProfile = {
  id: string;
  name: string;
  age: number | null;
  city: string;
  region: string;
  occupation: string;
  education: string;
  educationLevel: string;
  bio: string;
  language: string;
  religion: string;
  maritalStatus: string;
  hasKids: string;
  wantsKids: string;
  drinking: string;
  smoking: string;
  heightCm: number | null;
  values: string[];
  interests: string[];
  lifestyle: string[];
  relationshipGoals: string[];
  prompts: Array<{ prompt?: string; answer?: string }>;
  photos: string[];
  verified: boolean;
  vaccinationStatus: string;
  replyRate: number | null;
  matchRate: number | null;
  conversationCount: number;
  memberSince: string | null;
  birthMonthYear: string;
  distanceKm: number | null;
};

/** Instant re-open: full profiles are cached after first fetch. */
const profileCache = new Map<string, FullProfile>();

function joinedLabel(iso: string | null) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "Joined today";
  if (days < 31) return `Joined ${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `Joined ${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `Joined ${years} year${years === 1 ? "" : "s"} ago`;
}

const GOAL_LABELS: Record<string, string> = {
  long_term: "Long-term relationship",
  life_partner: "Life partner",
  meaningful_connection: "Meaningful connection",
  still_exploring: "Still exploring",
};

const VAX_LABELS: Record<string, { label: string; cls: string }> = {
  unvaccinated: { label: "Unvaccinated", cls: "border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/10 text-[var(--color-gold-300)]" },
  vaccinated: { label: "Vaccinated", cls: "border-white/15 bg-white/[0.05] text-[var(--color-sand)]" },
  prefer_not_to_say: { label: "Private on vaccines", cls: "border-white/10 bg-white/[0.03] text-[var(--color-mist)]" },
};

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--color-sand)]">
          {item}
        </span>
      ))}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--color-gold-500)]">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function ProfileView({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const dragRef = useRef<{ startX: number; moved: boolean } | null>(null);

  useEffect(() => {
    setPhotoIdx(0);
    // Real distance: pass the viewer's (already-consented, cached) location.
    let qs = "";
    try {
      const raw = window.sessionStorage.getItem("freeborn.origin");
      if (raw) {
        const { lat, lng } = JSON.parse(raw) as { lat: number; lng: number };
        if (Number.isFinite(lat) && Number.isFinite(lng)) qs = `?lat=${lat}&lng=${lng}`;
      }
    } catch {
      /* no location → no distance */
    }
    setProfile(null);
    (async () => {
      const res = await fetch(`/api/profile/${profileId}${qs}`);
      if (res.ok) {
        const json = await res.json();
        profileCache.set(profileId, json.profile);
        setProfile(json.profile);
      } else {
        setFailed(true);
      }
    })();
  }, [profileId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const photos = profile?.photos ?? [];
  const clampIdx = (i: number) => Math.max(0, Math.min(photos.length - 1, i));
  const vax = profile ? VAX_LABELS[profile.vaccinationStatus] ?? VAX_LABELS.prefer_not_to_say : null;
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const [msgBusy, setMsgBusy] = useState(false);
  const handleMessage = async () => {
    if (!profile || msgBusy) return;
    setMsgBusy(true);
    try {
      const token = await getAccessToken().catch(() => null);
      if (!token) {
        window.location.href = "/auth?mode=sign-in";
        return;
      }
      const res = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ with: profile.id }),
      });
      if (res.ok) {
        const json = (await res.json()) as { matchId?: string };
        if (json.matchId) {
          window.location.assign(`/app/chat?match=${json.matchId}`);
          return;
        }
      }
    } finally {
      setMsgBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#070a14]/97 backdrop-blur-md">
      <div className="mx-auto max-w-[560px] px-4 pb-20 pt-4 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[var(--color-pearl)] transition hover:bg-white/[0.1]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <span className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--color-mist)]">
            Full profile
          </span>
          <span className="h-10 w-10" />
        </div>

        {!profile && !failed ? (
          <div className="flex justify-center py-28">
            <span className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
          </div>
        ) : failed || !profile ? (
          <p className="py-28 text-center text-sm text-[var(--color-mist)]">Couldn't load this profile.</p>
        ) : (
          <div className="animate-scale-in space-y-6">
            {/* Photos */}
            {photos.length > 0 ? (
              <div
                className="relative overflow-hidden rounded-[28px] border border-white/[0.08]"
                style={{ touchAction: "pan-y" }}
                onPointerDown={(e) => {
                  dragRef.current = { startX: e.clientX, moved: false };
                }}
                onPointerMove={(e) => {
                  if (dragRef.current && Math.abs(e.clientX - dragRef.current.startX) > 8) dragRef.current.moved = true;
                }}
                onPointerUp={(e) => {
                  const d = dragRef.current;
                  dragRef.current = null;
                  if (!d) return;
                  const dx = e.clientX - d.startX;
                  if (d.moved && Math.abs(dx) > 50) {
                    setPhotoIdx((i) => clampIdx(dx < 0 ? i + 1 : i - 1));
                  } else if (!d.moved) {
                    setLightboxIdx(photoIdx);
                  }
                }}
              >
                <div
                  className="flex"
                  style={{
                    transform: `translateX(${-photoIdx * 100}%)`,
                    transition: "transform 0.4s cubic-bezier(0.22,1,0.36,1)",
                  }}
                >
                  {photos.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`${profile.name} — photo ${i + 1}`}
                      draggable={false}
                      className="aspect-[3/3.6] w-full shrink-0 select-none object-cover"
                    />
                  ))}
                </div>
                {photos.length > 1 ? (
                  <>
                    <button type="button" aria-label="Previous photo" onClick={() => setPhotoIdx((i) => clampIdx(i - 1))} className="absolute inset-y-0 left-0 w-1/3" />
                    <button type="button" aria-label="Next photo" onClick={() => setPhotoIdx((i) => clampIdx(i + 1))} className="absolute inset-y-0 right-0 w-1/3" />
                    <div className="absolute inset-x-0 top-3 flex justify-center gap-1.5">
                      {photos.map((_, i) => (
                        <span key={i} className={`h-[4px] rounded-full transition-all duration-300 ${i === photoIdx ? "w-6 bg-white" : "w-3 bg-white/40"}`} />
                      ))}
                    </div>
                  </>
                ) : null}

                {/* Top-right badges: unvaccinated + verified */}
                <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
                  {profile.vaccinationStatus === "unvaccinated" ? <UnvaxBadge size={20} /> : null}
                  {profile.verified ? (
                    <span className="rounded-full bg-night/55 p-1.5 backdrop-blur-sm">
                      <VerifyBadge size={20} />
                    </span>
                  ) : null}
                </div>

                {/* Tap-to-enlarge hint */}
                <span className="absolute bottom-16 right-3 z-10 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-bold text-white/70 backdrop-blur-sm">
                  Tap to enlarge
                </span>

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#070a14] via-transparent to-transparent" />
                <div className="pointer-events-none absolute inset-x-5 bottom-4">
                  <div className="flex items-center gap-2.5">
                    <h1 className="font-display text-[32px] font-semibold leading-none text-[var(--color-pearl)]">
                      {profile.name}{profile.age ? `, ${profile.age}` : ""}
                    </h1>
                    {profile.verified ? <VerifyBadge size={22} /> : null}
                  </div>
                  <p className="mt-1.5 text-[13px] tracking-wide text-[var(--color-sand)]">
                    {profile.occupation ? `${profile.occupation} · ` : ""}{profile.city}{profile.region ? `, ${profile.region}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {profile.memberSince ? (
                      <p className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white/70 backdrop-blur-sm">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                        {joinedLabel(profile.memberSince)}
                      </p>
                    ) : null}
                    {profile.distanceKm != null ? (
                      <p className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white/70 backdrop-blur-sm">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M12 21s-7-5.6-7-11a7 7 0 0114 0c0 5.4-7 11-7 11z" />
                          <circle cx="12" cy="10" r="2.5" />
                        </svg>
                        {profile.distanceKm} km away
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Trust row */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 text-center">
                <p className="font-display text-[22px] font-semibold text-[var(--color-pearl)]">
                  {profile.replyRate === null ? "New" : `${profile.replyRate}%`}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-mist)]">Reply rate</p>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 text-center">
                <p className="font-display text-[22px] font-semibold text-[var(--color-pearl)]">
                  {profile.matchRate === null ? "New" : `${profile.matchRate}%`}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-mist)]">Match rate</p>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 text-center">
                <p className="font-display text-[22px] font-semibold text-[var(--color-pearl)]">
                  {profile.verified ? "Yes" : "Not yet"}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-mist)]">Verified</p>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 text-center">
                <p className="font-display text-[22px] font-semibold text-[var(--color-pearl)]">
                  {profile.conversationCount > 0 ? "Active" : "Quiet"}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-mist)]">In the room</p>
              </div>
            </div>

            {/* Stances */}
            <div className="flex flex-wrap gap-2">
              {vax ? (
                <span className={`rounded-full border px-3.5 py-1.5 text-[12px] font-bold ${vax.cls}`}>{vax.label}</span>
              ) : null}
              {profile.relationshipGoals.map((g) => (
                <span key={g} className="rounded-full border border-[var(--color-ember-500)]/30 bg-[var(--color-ember-500)]/[0.07] px-3.5 py-1.5 text-[12px] font-bold text-[#ffb4a6]">
                  {GOAL_LABELS[g] ?? g}
                </span>
              ))}
            </div>

            {profile.bio ? (
              <Block title="Their story">
                <p className="text-[15px] leading-[1.85] text-[var(--color-ivory)]">{profile.bio}</p>
              </Block>
            ) : null}

            {profile.prompts.filter((p) => p.answer).map((p, i) => (
              <Block key={i} title={p.prompt ?? "A prompt"}>
                <p className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-[14px] leading-[1.8] text-[var(--color-ivory)]">
                  “{p.answer}”
                </p>
              </Block>
            ))}

            {profile.values.length > 0 ? (
              <Block title="Values they stand on">
                <Chips items={profile.values} />
              </Block>
            ) : null}

            {profile.lifestyle.length > 0 ? (
              <Block title="How they live">
                <Chips items={profile.lifestyle} />
              </Block>
            ) : null}

            {profile.interests.length > 0 ? (
              <Block title="Start a conversation with">
                <Chips items={profile.interests} />
              </Block>
            ) : null}

            {/* The details */}
            {(() => {
              const details = [
                { label: "Born", value: profile.birthMonthYear },
                { label: "Height", value: profile.heightCm ? `${profile.heightCm} cm` : "" },
                { label: "Language", value: profile.language },
                { label: "Religion", value: profile.religion },
                { label: "Marital status", value: profile.maritalStatus },
                { label: "Kids", value: profile.hasKids },
                { label: "Wants kids", value: profile.wantsKids },
                { label: "Drinking", value: profile.drinking },
                { label: "Smoking", value: profile.smoking },
                { label: "Education", value: profile.educationLevel || profile.education },
              ].filter((d) => d.value);
              if (!details.length) return null;
              return (
                <Block title="The details">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {details.map((d) => (
                      <div key={d.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ash)]">{d.label}</p>
                        <p className="mt-1 text-[13px] font-semibold text-[var(--color-ivory)]">{d.value}</p>
                      </div>
                    ))}
                  </div>
                </Block>
              );
            })()}

            {/* Start a conversation */}
            <div className="sticky bottom-0 -mx-4 border-t border-white/[0.06] bg-[#070a14]/95 px-4 pb-4 pt-3 backdrop-blur-md sm:-mx-6 sm:px-6">
              <button
                type="button"
                onClick={() => void handleMessage()}
                disabled={msgBusy}
                className="btn-ember btn-shine relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-full px-6 py-3.5 text-[15px] font-bold disabled:opacity-60"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 11.5a8.4 8.4 0 01-8.5 8.3 8.8 8.8 0 01-3.7-.8L3 20.5l1.5-5.2a8.1 8.1 0 01-1-3.9A8.4 8.4 0 0112 3.2a8.4 8.4 0 019 8.3z" />
                </svg>
                {msgBusy ? "Opening…" : `Message ${profile.name}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {lightboxIdx !== null && profile && photos.length > 0 ? (
        <PhotoLightbox
          photos={photos}
          name={profile.name}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      ) : null}
    </div>
  );
}
