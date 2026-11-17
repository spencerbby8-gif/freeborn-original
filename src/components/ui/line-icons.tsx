/**
 * Line icon set for the "Someone you'll remember" surface.
 *
 * One family, one stroke weight (1.7), one geometry (24×24, round caps), so the
 * discovery card, the profile screen and the tab bar cannot drift into three
 * different drawing styles. Every icon is decorative by default — the control
 * that wraps it carries the label — except where a name is supplied.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 8.6a6 6 0 1 0-12 0c0 5.3-2.2 6.8-2.2 6.8h16.4S18 13.9 18 8.6Z" />
      <path d="M13.7 19.2a2 2 0 0 1-3.4 0" />
    </Svg>
  );
}

export function HeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...props} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20.2c-.4 0-8-4.7-8-10.2a4.4 4.4 0 0 1 8-2.5 4.4 4.4 0 0 1 8 2.5c0 5.5-7.6 10.2-8 10.2Z" />
    </Svg>
  );
}

/**
 * The reference's heart: a rounded two-lobe heart with a small dot in its right
 * lobe — the "liked you" mark in the header disc and on the portrait. Drawn
 * separately from HeartIcon so the plain heart elsewhere keeps its old shape.
 */
export function HeartMarkIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.7}>
      <path d="M12 19.6c-.5 0-7.1-4.3-7.1-9.1a3.9 3.9 0 0 1 7.1-2.3 3.9 3.9 0 0 1 7.1 2.3c0 4.8-6.6 9.1-7.1 9.1Z" />
      <circle cx="13.6" cy="10.6" r="0.85" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6" />
    </Svg>
  );
}

export function BackArrowIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={0}>
      <circle cx="5.5" cy="12" r="1.9" fill="currentColor" />
      <circle cx="12" cy="12" r="1.9" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.9" fill="currentColor" />
    </Svg>
  );
}

export function HeightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5v17M8.6 6.9 12 3.5l3.4 3.4M8.6 17.1 12 20.5l3.4-3.4" />
    </Svg>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.8c2.6 3 5.6 5.9 5.6 9.6a5.6 5.6 0 1 1-11.2 0c0-2.2 1-3.9 2.4-5.4.3 1.5 1 2.4 1.9 2.9-.4-2.6.3-5 1.3-7.1Z" />
    </Svg>
  );
}

export function LeafIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 4c0 8.5-4.3 12.6-9.4 12.6A5.6 5.6 0 0 1 5 11c0-4.4 4.6-7 15-7Z" />
      <path d="M4 20c1.6-5.2 4.6-8.4 9.2-10.4" />
    </Svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 11.6c0 4.2-3.8 7.6-8.5 7.6a9.6 9.6 0 0 1-3.3-.6L4 20.4l1.4-4.5a7 7 0 0 1-1.4-4.3C4 7.4 7.8 4 12.5 4s8 3.4 8 7.6Z" />
    </Svg>
  );
}

export function CoupleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20.4S4.4 15.7 4.4 10.2a4.2 4.2 0 0 1 7.6-2.4 4.2 4.2 0 0 1 7.6 2.4c0 5.5-7.6 10.2-7.6 10.2Z" />
    </Svg>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.6 20.4c0-3.9 3.3-6.1 7.4-6.1s7.4 2.2 7.4 6.1" />
    </Svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.2l1.9 4.6 4.6 1.9-4.6 1.9-1.9 4.6-1.9-4.6L5.5 9.7l4.6-1.9L12 3.2Z" />
    </Svg>
  );
}

export function CompassIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2 5.2-2Z" />
    </Svg>
  );
}

export function BriefcaseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.2" y="7.4" width="17.6" height="12.4" rx="2.6" />
      <path d="M9 7.4V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8v1.6M3.2 12.6h17.6" />
    </Svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s-6.6-5.6-6.6-10.4A6.6 6.6 0 0 1 18.6 10.6C18.6 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10.2" r="2.4" />
    </Svg>
  );
}

/**
 * The "Looking for" heart: an unfilled outline drawn as a single stroked path
 * with a warm→violet gradient, so it glows rather than sits flat. Rendered at a
 * fixed 56px in the reference.
 */
export function GlowHeart({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden focusable="false">
      <defs>
        <linearGradient id="fb-sr-glow-heart" x1="8" y1="8" x2="48" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffd3ad" />
          <stop offset="0.48" stopColor="#ffa8c0" />
          <stop offset="1" stopColor="#a892ff" />
        </linearGradient>
      </defs>
      <path
        d="M28 47.5S8.6 35.6 8.6 21.9A10.6 10.6 0 0 1 28 15.6a10.6 10.6 0 0 1 19.4 6.3C47.4 35.6 28 47.5 28 47.5Z"
        stroke="url(#fb-sr-glow-heart)"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The reference's height marker (a small stick figure) and the two gender
 *  glyphs it pairs with — Venus for a woman, Mars for a man, and the stick
 *  figure alone when the member's gender is neither. */
export function FemaleIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.6}>
      <circle cx="12" cy="8" r="4.4" />
      <path d="M12 12.4V21M8.6 17.4h6.8" />
    </Svg>
  );
}

/** A plain person mark for the height fact — the reference's silhouette, not a gender sign. */
/** A tumbler with a sprig — the "Drinks" tile. */
export function GlassIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.6}>
      <path d="M6.4 5.2h9.2l-1 13.2a1.6 1.6 0 0 1-1.6 1.5H9a1.6 1.6 0 0 1-1.6-1.5L6.4 5.2Z" />
      <path d="M6.9 10.6h8.2" />
      <path d="M14.6 3.2c1.7.4 2.6 1.5 2.6 3.2-1.7 0-2.6-.9-2.6-3.2Z" />
    </Svg>
  );
}

/** A globe — the "Languages" tile. */
export function GlobeIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.6}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.8 12h16.4M12 3.6c2.4 2.4 3.6 5.2 3.6 8.4s-1.2 6-3.6 8.4c-2.4-2.4-3.6-5.2-3.6-8.4S9.6 6 12 3.6Z" />
    </Svg>
  );
}

export function PersonMarkIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.7}>
      <circle cx="12" cy="5.4" r="2.5" />
      <path d="M8.4 21v-4.6a3.6 3.6 0 0 1 3.6-3.6 3.6 3.6 0 0 1 3.6 3.6V21" />
      <path d="M12 12.8V21" />
    </Svg>
  );
}

export function MaleIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.6}>
      <circle cx="10" cy="14" r="4.4" />
      <path d="M13.2 10.8 19.5 4.5M15.4 4.5h4.1v4.1" />
    </Svg>
  );
}

/**
 * The "Say hello" row's right-hand action, and the empty-state icon: a droplet
 * with a natural-health leaf inside, drawn as one stroked path so it reads at
 * 26px and at 14px. In Freeborn it is the vaccination-stance mark, so the
 * control it sits in opens that member's stated stance rather than inventing a
 * new one.
 */
export function DropletIcon({ size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      <path d="M12 2.8c3.1 3.6 6.2 6.9 6.2 10.4a6.2 6.2 0 0 1-12.4 0c0-3.5 3.1-6.8 6.2-10.4Z" />
      <path d="M12 17.4c-1.9-.6-2.9-2-2.9-3.8 1.9 0 3.1.8 3.8 2.1.7-1.3 1.9-2.1 3.8-2.1 0 1.8-1 3.2-2.9 3.8" />
    </svg>
  );
}

/**
 * The Discover tab mark, as the reference draws it: a warm disc with a crescent
 * bitten out of its trailing edge. The bite is a masked circle rather than a
 * hand-traced path, so the shape stays true at 20px and at 40px.
 */
/**
 * The Discover tab's mark: a cream disc with a warm floor, cut by a single dark
 * stroke that runs in from the left rim and forks — the "someone to aim at"
 * mark the reference uses. The active state is the disc itself; the inactive one
 * is the same shape as a hairline.
 */
export function DiscoverMark({ size = 26, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden focusable="false">
      {active ? (
        <>
          <defs>
            <linearGradient id="fb-discover-disc" x1="6" y1="3" x2="19" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fdf7ea" />
              <stop offset="0.55" stopColor="#f7e5c0" />
              <stop offset="1" stopColor="#eccf9c" />
            </linearGradient>
          </defs>
          <circle cx="13" cy="13" r="10.4" fill="url(#fb-discover-disc)" />
          <path
            d="M2.4 12.6h13.1M15.5 12.6l3.4 3.5M15.5 12.6l5.5-.6"
            stroke="#2a1c12"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="13" cy="13" r="10.4" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M3.6 12.6h12.9M15.2 12.6l3.2 3.3M15.2 12.6l5.1-.6"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
