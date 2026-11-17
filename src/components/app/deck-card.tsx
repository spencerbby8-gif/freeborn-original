"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PhotoImage } from "@/components/ui/photo-image";
import { VerifyBadge } from "@/components/verify-badge";
import { deckBio, placeLabel } from "@/lib/profile-presentation";
import { CloseIcon, DropletIcon, HeartIcon, HeartMarkIcon, PersonMarkIcon } from "@/components/ui/line-icons";

/**
 * The discovery card.
 *
 * Two structural facts about it were wrong in earlier builds and are worth
 * stating, because they are what makes the composition read like the reference:
 *
 *  1. The portrait is the card's own backdrop. It fills the card, and the name,
 *     meta line, height, chips and bio are printed ON it — dissolved into dark
 *     only where the action row needs a floor. A photo that stops above the
 *     details leaves a hard edge the reference does not have.
 *  2. The block is bottom-anchored, not top-anchored: the action row sits a
 *     fixed 30px above the card's floor and everything else stacks upward from
 *     it, so a short bio does not pull the name into the middle of the photo.
 *
 * Card-relative measurements come from the close-up reference (the conversion
 * lives in the block comment above .fb-sr-card--deck in globals.css):
 *
 *   NEW HERE            y 31     9px, 0.2em
 *   photo heart         46px disc, 14 in from the photo's top-right
 *   name                35px display serif, top edge 296
 *   meta                top edge 338
 *   height / active     top edge 361, 9px green dot
 *   chips               28px tall, top edge 387
 *   bio                 13.5px/20, three lines, top edge 435
 *   actions             52px discs and a 58px cream pill, 27 above the details
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
  units: string;
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

function heightLabel(cm: number | null | undefined) {
  if (!cm || !Number.isFinite(cm)) return null;
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

export function DeckCard({
  profile,
  isTop,
  depth,
  units: _units,
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

  /* Three chips, de-duplicated, interests first. The reference shows three and
     the row is clipped rather than scrolled, so the cap is part of the design. */
  const chips = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of [...(profile.interests ?? []), ...(profile.traits ?? [])]) {
      const value = (raw ?? "").trim();
      if (!value) continue;
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length === 3) break;
    }
    return out;
  }, [profile.interests, profile.traits]);

  const bio = deckBio(profile.headline);
  const height = heightLabel(profile.heightCm);
  const meta = [profile.age ? String(profile.age) : null, profile.occupation, placeLabel(profile.city)]
    .filter(Boolean)
    .join(" · ");
  const activeLabel =
    profile.presence === "now" ? "Active now" : profile.presence === "today" ? "Active today" : null;

  return (
    <article
      ref={cardRef}
      {...(handlers ?? {})}
      style={{
        zIndex: 30 - depth * 10,
        transform: isTop ? undefined : `translateY(${-depth * 11}px) scale(${1 + depth * 0.03})`,
        opacity: depth > 1 ? 0 : 1,
        visibility: depth > 1 ? "hidden" : "visible",
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
            className="pointer-events-none absolute left-5 top-24 z-20 -rotate-[9deg] rounded-xl border-2 border-[#ff9a8a]/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#ffb3a4]"
            style={{ opacity: 0 }}
          >
            Skip
          </span>
          <span
            ref={likeStampRef}
            aria-hidden
            className="pointer-events-none absolute right-5 top-24 z-20 rotate-[9deg] rounded-xl border-2 border-[#ffc9a8] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#ffd3ad]"
            style={{ opacity: 0 }}
          >
            Like
          </span>
        </>
      ) : null}

      {/* the portrait, as the card's own surface */}
      <div className="fb-sr-photo">
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
            <span className="font-display text-[72px] font-medium text-white/85">
              {(profile.name || "M").charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="fb-sr-photo__shade" aria-hidden />
      </div>

      {profile.isNew ? (
        <p className="fb-sr-onphoto fb-sr-eyebrow fb-sr-eyebrow--onphoto" style={{ left: 16, top: 31 }}>
          New here
        </p>
      ) : null}

      <Link
        href="/app/likes"
        aria-label="See who likes you"
        onClick={(event) => event.stopPropagation()}
        className="fb-sr-onphoto fb-sr-disc fb-sr-photo-heart"
        style={{ right: 14, top: 14 }}
      >
        <HeartMarkIcon size={21} />
      </Link>

      {/* the details, bottom-anchored over the portrait */}
      <div className="fb-sr-deck-body">
        <button
          type="button"
          onClick={onOpen}
          data-profile-btn
          className="block w-full text-left"
          aria-label={`Open ${profile.name}'s full profile`}
        >
          <span className="flex items-center gap-[9px]">
            <span className="fb-sr-name">{profile.name}</span>
            {profile.verified ? <VerifyBadge size={15} /> : null}
          </span>
        </button>

        {meta ? <p className="fb-sr-meta">{meta}</p> : null}

        {height || activeLabel ? (
          <div className="fb-sr-factrow">
            {height ? (
              <span className="fb-sr-fact">
                <PersonMarkIcon size={12} />
                {height}
              </span>
            ) : null}
            {activeLabel ? (
              <span className="fb-sr-fact">
                <span className="fb-sr-fact__dot" aria-hidden />
                {activeLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        {chips.length ? (
          <div className="fb-sr-tagrow">
            {chips.map((chip) => (
              <span key={chip} className="fb-sr-tagline">
                {chip}
              </span>
            ))}
          </div>
        ) : null}

        {bio ? <p className="fb-sr-bio">{bio}</p> : null}

        {isTop ? (
          <div className="fb-sr-actions">
            <span className="fb-sr-actions-glow" aria-hidden />
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
              className="fb-sr-hello fb-sr-hello--deck"
              aria-label={
                messageRestricted
                  ? `You cannot message ${profile.name} under their privacy settings`
                  : `Say hello to ${profile.name}`
              }
              title={
                messageRestricted
                  ? "Their privacy settings stop a message from you"
                  : `Say hello to ${profile.name}`
              }
            >
              <HeartMarkIcon size={17} />
              Say hello
            </button>
            <button
              type="button"
              onClick={onLike}
              aria-label="Like this profile"
              title="Like"
              className="fb-sr-disc fb-sr-round fb-sr-round--natural"
            >
              <DropletIcon size={19} />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
