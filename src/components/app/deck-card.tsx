"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PhotoImage } from "@/components/ui/photo-image";
import { VerifyBadge } from "@/components/verify-badge";
import { formatDistance, type DistanceUnits } from "@/lib/device-prefs";
import { deckBio, placeLabel } from "@/lib/profile-presentation";
import { CloseIcon, DropletIcon, FemaleIcon, HeartIcon, MaleIcon } from "@/components/ui/line-icons";

/**
 * The discover card, built to the reference's measurements.
 *
 * The reference is a 1058×1487 image whose left phone has a 436px-wide screen
 * (x 67→503), so one reference pixel is one CSS pixel at a 436px viewport.
 * Everything below is that pixel grid, top to bottom:
 *
 *   y  333  "NEW HERE"        11px, 0.26em tracking, white
 *   y  347  heart disc        63px, at the top right
 *   y  553  photo ends        (258px tall, last 150px dissolving into the card)
 *   y  968  "Aria"            38px display serif + the blue seal
 *   y  723  "27 · Graphic Designer · Brooklyn"   15px
 *   y  754  ↕ 5'6"   ● Active today              14px, 23px apart
 *   y  790  chips             32px tall, 13px label
 *   y  843  bio               15.5px / 25px leading, 3 lines
 *   y  940  actions           78px discs, 78px cream pill, 216px wide
 *   y 1058  card ends         27px radius, 1px warm rim
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
  gender?: string;
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
  messageRestricted?: boolean;
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
  /* The reference draws a feminine glyph because its member is a woman. The
     glyph follows the member's own gender field rather than the reference. */
  const marker = profile.gender === "woman" || profile.gender === "man" ? profile.gender : null;

  return (
    <article
      ref={cardRef}
      {...(handlers ?? {})}
      style={{
        position: isTop ? "relative" : "absolute",
        inset: isTop ? undefined : "0 0 auto 0",
        zIndex: 30 - depth * 10,
        transform: isTop ? undefined : `translateY(${-depth * 14}px) scale(${1 + depth * 0.028})`,
        opacity: isTop ? 1 : depth === 1 ? 1 : 0,
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

      {isTop ? (
        <span aria-hidden className="fb-sr-peek">
          <span className="fb-sr-peek__handle" />
        </span>
      ) : null}

      {/* --- photo band: 372px, edge to edge, dissolving into the card ------ */}
      <div className="fb-sr-photo">
        {photo ? (
          <PhotoImage
            src={photo}
            alt={`${profile.name}, ${profile.age}`}
            className="h-full w-full"
            imgClassName="object-cover object-top"
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

        {profile.isNew ? (
          <p className="fb-sr-onphoto fb-sr-eyebrow fb-sr-eyebrow--onphoto left-[15px] top-[38px]">
            New here
          </p>
        ) : null}

        <Link
          href="/app/likes"
          aria-label="See who likes you"
          onClick={(e) => e.stopPropagation()}
          className="fb-sr-onphoto fb-sr-disc fb-sr-photo-heart right-[13px] top-[14px]"
        >
          <HeartIcon size={26} />
          {profile.likes && profile.likes > 0 ? (
            <span className="fb-sr-dot">{profile.likes > 9 ? "9+" : profile.likes}</span>
          ) : null}
        </Link>
      </div>

      {/* --- body ---------------------------------------------------------- */}
      <div className="px-[15px] pb-[19px] pt-[24px]">
        <button
          type="button"
          onClick={onOpen}
          data-profile-btn
          className="block w-full text-left"
          aria-label={`Open ${profile.name}'s full profile`}
        >
          <span className="flex items-center gap-[10px]">
            <span className="fb-sr-name">{profile.name}</span>
            {profile.verified ? <VerifyBadge size={22} /> : null}
          </span>
        </button>

        <p className="fb-sr-meta mt-[10px]">{meta.join(" · ")}</p>

        <div className="mt-[11px] flex items-center gap-[23px]">
          {height ? (
            <span className="fb-sr-fact">
              {marker === "man" ? <MaleIcon size={15} /> : <FemaleIcon size={15} />}
              {height}
            </span>
          ) : null}
          {activeToday ? (
            <span className="fb-sr-fact">
              <span className="fb-sr-active__dot" />
              {profile.presence === "now" ? "Active now" : "Active today"}
            </span>
          ) : null}
        </div>

        {chips.length ? (
          <div className="fb-sr-chiprow mt-[12px] gap-[9px]">
            {chips.map((chip) => (
              <span key={chip} className="fb-sr-tag">
                {chip}
              </span>
            ))}
          </div>
        ) : null}

        {bio ? <p className="fb-sr-bio mt-[15px]">{bio}</p> : null}

        {/* --- actions: 78px discs, 78px cream pill ---------------------- */}
        {isTop ? (
          <div className="relative mt-[22px]">
            <span className="fb-sr-actions-glow" aria-hidden />
            <div className="fb-sr-actions relative">
              <button
                type="button"
                onClick={onPass}
                aria-label="Skip this profile"
                title="Skip"
                className="fb-sr-disc fb-sr-round"
              >
                <CloseIcon size={24} />
              </button>
              <button
                type="button"
                onClick={onSayHello}
                className="fb-sr-hello"
                aria-label={
                  messageRestricted
                    ? `You cannot message ${profile.name} under their privacy settings`
                    : `Say hello to ${profile.name}`
                }
                title={messageRestricted ? "Their privacy settings stop a message from you" : `Say hello to ${profile.name}`}
              >
                <HeartIcon size={24} />
                Say hello
              </button>
              <button
                type="button"
                onClick={onLike}
                aria-label="Like this profile"
                title="Like"
                className="fb-sr-disc fb-sr-round fb-sr-round--natural"
              >
                <DropletIcon size={24} />
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-[24px] flex items-center gap-3 opacity-0" aria-hidden>
            <span className="fb-sr-round" style={{ display: "block" }} />
            <span className="fb-sr-hello" />
            <span className="fb-sr-round" style={{ display: "block" }} />
          </div>
        )}
      </div>
    </article>
  );
}
