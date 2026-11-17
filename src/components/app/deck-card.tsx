"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PhotoImage } from "@/components/ui/photo-image";
import { VerifyBadge } from "@/components/verify-badge";
import { formatDistance, type DistanceUnits } from "@/lib/device-prefs";
import { deckBio, placeLabel } from "@/lib/profile-presentation";
import { CloseIcon, HeartIcon, HeightIcon } from "@/components/ui/line-icons";

/**
 * One card in Discover, drawn to the supplied reference:
 *
 *   NEW HERE            (top-left, upper case, wide tracking)
 *                     ♡  (top-right circular heart)
 *   [ photo dissolves into the card body ]
 *   Aria ✔
 *   27 · Graphic Designer · Brooklyn
 *   ↕ 5'6"   ● Active today
 *   [Hiking] [Ambient music] [Matcha lover]
 *   Two lines of the member's own words.
 *   ( × )      ( ♡ Say hello )      ( ♥ )
 *
 * Everything on it is a field the member filled in. The reference's "Matcha
 * lover" chip is a trait/interview answer; here the third chip is the member's
 * own first interest, and chips are only rendered when the data exists.
 */

export type DeckProfile = {
  id: string;
  name: string;
  age: number;
  city: string;
  occupation: string;
  headline: string;
  traits: string[];
  photo: string;
  photos: string[];
  hasPhoto?: boolean;
  verified: boolean;
  presence: string | null;
  distanceKm: number | null;
  heightCm?: number | null;
  isNew?: boolean;
  interests?: string[];
  likes?: number;
};

type Props = {
  profile: DeckProfile;
  isTop: boolean;
  depth: number;
  units: DistanceUnits;
  onOpen: () => void;
  onLike: () => void;
  onPass: () => void;
  onSayHello: () => void;
  /** The member's message rights under this card owner's privacy rules; the
   *  label follows what the action can actually do. */
  messageRestricted?: boolean;
  /** ref landings for the drag stamps and the animated top card */
  cardRef?: (el: HTMLElement | null) => void;
  likeStampRef?: (el: HTMLSpanElement | null) => void;
  passStampRef?: (el: HTMLSpanElement | null) => void;
  handlers?: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: () => void;
  };
};

export function DeckCard({
  profile,
  isTop,
  depth,
  units,
  onOpen,
  onLike,
  onPass,
  onSayHello,
  messageRestricted = false,
  cardRef,
  likeStampRef,
  passStampRef,
  handlers,
}: Props) {
  const photo = profile.photos[0] ?? profile.photo ?? "";
  /* Three chips maximum, as in the reference. Interests come first because they
     are the member's own answer to "what would you talk about", then traits. */
  const chips = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of [...(profile.interests ?? []), ...(profile.traits ?? [])]) {
      const v = (raw ?? "").trim();
      if (!v) continue;
      const key = v.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
      if (out.length === 3) break;
    }
    return out;
  }, [profile.interests, profile.traits]);

  const bio = deckBio(profile.headline);
  const height =
    profile.heightCm && Number.isFinite(profile.heightCm)
      ? `${Math.floor(Math.round(profile.heightCm / 2.54) / 12)}'${Math.round(profile.heightCm / 2.54) % 12}"`
      : null;
  const meta = [profile.age ? String(profile.age) : null, profile.occupation, placeLabel(profile.city)].filter(Boolean);
  const activeToday = profile.presence === "now" || profile.presence === "today";

  return (
    <article
      ref={cardRef}
      {...(handlers ?? {})}
      style={{
        position: isTop ? "relative" : "absolute",
        inset: isTop ? undefined : "0 0 auto 0",
        zIndex: 30 - depth * 10,
        transform: isTop ? undefined : `translateY(${depth * 12}px) scale(${1 - depth * 0.045})`,
        opacity: isTop ? 1 : depth === 1 ? 0.92 : 0.6,
        transition: "transform 440ms cubic-bezier(0.22,1,0.36,1), opacity 440ms ease",
        pointerEvents: isTop ? "auto" : "none",
        willChange: "transform",
      }}
      className="fb-sr-card fb-sr-card--deck"
      aria-label={`${profile.name}, ${profile.age}. ${profile.occupation} in ${profile.city}.`}
    >
      {isTop ? (
        <>
          <span
            ref={passStampRef}
            aria-hidden
            className="pointer-events-none absolute left-5 top-24 z-20 -rotate-[9deg] rounded-xl border-2 border-[#ff9a8a]/80 px-3 py-1 text-[12px] font-black uppercase tracking-[0.18em] text-[#ffb3a4]"
            style={{ opacity: 0 }}
          >
            Skip
          </span>
          <span
            ref={likeStampRef}
            aria-hidden
            className="pointer-events-none absolute right-5 top-24 z-20 rotate-[9deg] rounded-xl border-2 border-[#ffc9a8] px-3 py-1 text-[12px] font-black uppercase tracking-[0.18em] text-[#ffd3ad]"
            style={{ opacity: 0 }}
          >
            Like
          </span>
        </>
      ) : null}

      {/* --- photo band ------------------------------------------------------ */}
      <div className="fb-sr-photo" style={{ aspectRatio: "1 / 1.02" }}>
        {photo ? (
          <PhotoImage
            src={photo}
            alt={`${profile.name}, ${profile.age}`}
            className="h-full w-full"
            imgClassName="object-cover object-center"
            priority={isTop}
          />
        ) : (
          <div
            aria-hidden
            className="flex h-full w-full items-center justify-center"
            style={{ background: "linear-gradient(160deg,#2a2140 0%,#3a2430 55%,#241d33 100%)" }}
          >
            <span className="font-display text-[76px] font-medium text-white/85">
              {(profile.name || "M").charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="fb-sr-photo__shade" aria-hidden />

        <div className="fb-sr-onphoto left-5 top-5 space-y-2.5">
          {profile.isNew ? (
            <p className="fb-sr-eyebrow text-[#e9e3dc]">New here</p>
          ) : null}
          {(profile.likes ?? 0) > 0 ? (
            <div className="fb-sr-likebars" title={`${profile.likes} ${profile.likes === 1 ? "person has" : "people have"} liked them`}>
              {Array.from({ length: Math.min(3, Math.max(1, profile.likes ?? 0)) }).map((_, i) => (
                <span key={i} />
              ))}
            </div>
          ) : null}
        </div>

        <Link
          href="/app/likes"
          aria-label="See who likes you"
          onClick={(e) => e.stopPropagation()}
          className="fb-sr-onphoto fb-sr-disc fb-sr-heart right-4 top-4"
        >
          <HeartIcon size={18} />
          {profile.likes && profile.likes > 0 ? (
            <span className="fb-sr-dot">{profile.likes > 9 ? "9+" : profile.likes}</span>
          ) : null}
        </Link>

        {/* photo count, bottom right of the photo band */}
        {profile.photos.length > 1 ? (
          <span
            className="fb-sr-onphoto right-4 rounded-full bg-black/45 px-2 py-[3px] text-[10.5px] font-bold text-white/80 backdrop-blur-sm"
            style={{ bottom: 18 }}
          >
            1/{profile.photos.length}
          </span>
        ) : null}
      </div>

      {/* --- body ----------------------------------------------------------- */}
      <div className="px-5 pb-5" style={{ marginTop: -44 }}>
        <div className="relative z-10">
          <button
            type="button"
            onClick={onOpen}
            data-profile-btn
            className="block text-left"
            aria-label={`Open ${profile.name}'s full profile`}
          >
            <span className="flex items-center gap-2">
              <h2 className="fb-sr-title text-[31px] text-[var(--sr-pearl)]">{profile.name}</h2>
              {profile.verified ? <VerifyBadge size={19} /> : null}
            </span>
          </button>

          <p className="mt-1.5 text-[12.5px] font-medium text-[var(--sr-sand)]">
            {meta.join(" · ")}
            {profile.distanceKm != null ? ` · ${formatDistance(profile.distanceKm, units)} away` : ""}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {height ? (
              <span className="fb-sr-fact">
                <HeightIcon size={14} />
                {height}
              </span>
            ) : null}
            {activeToday ? (
              <span className="fb-sr-fact" style={{ color: "var(--sr-green-400)" }}>
                <span className="fb-sr-active__dot" />
                {profile.presence === "now" ? "Active now" : "Active today"}
              </span>
            ) : null}
          </div>

          {chips.length ? (
            <div className="fb-sr-chiprow mt-3.5">
              {chips.map((chip) => (
                /* Neutral on the card, warm above it — this is how the reference
                   separates "what this person is into" from "what you are
                   filtering for". A JSX comment cannot open an arrow body, so it
                   is a block comment above the element. */
                <span key={chip} className="fb-sr-chip fb-sr-chip--onphoto">
                  {chip}
                </span>
              ))}
            </div>
          ) : null}

          {bio ? <p className="fb-sr-bio mt-3.5">{bio}</p> : null}
        </div>

        {/* --- actions ------------------------------------------------------- */}
        {isTop ? (
          <div className="mt-5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onPass}
              aria-label="Skip this profile"
              title="Skip"
              className="fb-sr-disc fb-sr-round"
            >
              <CloseIcon size={19} />
            </button>
            <button
              type="button"
              onClick={onSayHello}
              className="fb-sr-hello flex-1"
              aria-label={
                messageRestricted
                  ? `You cannot message ${profile.name} under their privacy settings`
                  : `Message ${profile.name}`
              }
              title={messageRestricted ? "Their privacy settings stop a message from you" : `Message ${profile.name}`}
            >
              <HeartIcon size={17} />
              Say hello
            </button>
            <button
              type="button"
              onClick={onLike}
              aria-label="Like this profile"
              title="Like"
              className="fb-sr-disc fb-sr-round"
              style={{ color: "var(--sr-warm-200)" }}
            >
              <HeartIcon size={19} filled />
            </button>
          </div>
        ) : (
          /* Under-cards are inert; this keeps their height identical to the top
             card so the stack does not visibly resize on promotion. */
          <div className="mt-5 flex items-center gap-2.5 opacity-0" aria-hidden>
            <span className="fb-sr-round" style={{ display: "block" }} />
            <span className="fb-sr-hello flex-1" />
            <span className="fb-sr-round" style={{ display: "block" }} />
          </div>
        )}
      </div>
    </article>
  );
}
