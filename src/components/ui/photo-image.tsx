"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { retrySrcFor } from "@/lib/api-response";
import { useAuthedMedia } from "@/lib/authed-media";

/**
 * An <img> that says what happened.
 *
 * Why this exists: every media defect fixed this month was *experienced* as a silently
 * broken image. The rows were healthy, the bytes existed, and the member saw a browser
 * glyph or a black rectangle with no reason and no way out. A missing photo is a product
 * failure, not a styling detail — and a retry is the difference between a transient edge
 * failure and "my photos disappeared".
 *
 * The shape is taken from what the competitors' clients demonstrably do, not from their
 * look: a placeholder while loading, a bounded retry with backoff (Hinge's image layer
 * retries with `maxRetries||5` and a `shouldRetry` predicate —
 * 132-4be892819dbac6b1.js@35202, offsets recorded in
 * docs/research/2026-10-30/MINING-API-STATE.json), and an explicit failure state the
 * member can act on. Rendering retries cap at 3 even though the transport policy allows 5,
 * because a broken <img> is user-visible and must not grind at the member.
 */
export type PhotoImageProps = {
  src: string;
  alt: string;
  /** Classes for the WRAPPER — put sizing/rounding here. */
  className?: string;
  /** For surfaces that size an avatar from data (chat rows pass width/height). */
  style?: CSSProperties;
  /** Small tiles (avatars, chips) cannot carry a sentence. Render the glyph only — the
   *  explanation still exists for assistive tech via aria-label. Chosen per call site rather
   *  than by container query because a 44px circle is a decision, not a breakpoint. */
  compact?: boolean;
  /** Classes for the <img> itself, for the cases the default `object-cover` is wrong
   *  (a lightbox wants `object-contain`, a circular avatar wants `rounded-full`). */
  imgClassName?: string;
  /** Deck avatars above the fold want priority; a lightbox photo does not. */
  priority?: boolean;
  /** Max re-requests after a failure. 0 disables retry. */
  maxRetries?: number;
  onError?: (info: { attempts: number }) => void;
};

export function PhotoImage({ src, alt, className = "", imgClassName = "object-cover", style, compact = false, priority = false, maxRetries = 3, onError }: PhotoImageProps) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new src is a new question: drop any failure state so the deck never stays red.
  // This is React's documented "adjust state when a prop changes" shape — a render-time
  // comparison, not an effect. An effect here would paint one frame of the PREVIOUS
  // photo's state onto the new src, which is exactly the flash that made the old bug look
  // like the media vanishing on navigation rather than on load.
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    setState("loading");
    setAttempt(0);
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const fail = useCallback(() => {
    setAttempt((prev) => {
      const next = prev + 1;
      if (next > maxRetries) {
        setState("failed");
        onError?.({ attempts: next });
        return prev;
      }
      // 300ms, 600ms, 1200ms: small, capped, and long enough that a hiccup has passed.
      const delay = 300 * 2 ** (next - 1);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("loading"), delay);
      return next;
    });
  }, [maxRetries, onError]);

  const retryNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setAttempt(0);
    setState("loading");
  }, []);

  const activeSrc = attempt === 0 ? src : (retrySrcFor(src, attempt) ?? src);

  /* Participant-only media cannot be loaded by a bare <img>. The element sends
     no Authorization header and this app keeps its session in localStorage, not
     cookies, so /api/chat/media/:id answers 401 and the member sees a broken
     photo. useAuthedMedia fetches those bytes with the member's own token and
     hands back a local blob URL; public storage objects pass straight through,
     so every existing call site keeps behaving exactly as before. */
  const media = useAuthedMedia(activeSrc);


  if (state === "failed") {
    return (
      <button
        type="button"
        onClick={retryNow}
        /* The tile's aspect ratio is owned by the caller, so this must fit inside it instead
           of growing past it: h-full + min-h-0 + centred content + a two-line clamp. The first
           version clipped "again." off the bottom of a 3:3.2 card, which is exactly the
           "silent broken image" this component exists to end. */
        className={`flex h-full w-full min-h-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-card border border-white/12 bg-white/6 px-3 py-2 text-center leading-snug text-mist transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-300 ${
          compact ? "" : "hover:bg-white/10"
        } ${className}`}
        aria-label={`Photo of ${alt} failed to load. Activate to try again.`}
      >
        <span aria-hidden="true" className={compact ? "text-ui-sm" : "text-ui-lg"}>
          &#9676;
        </span>
        {compact ? null : (
          /* Short enough to survive two lines at 13px inside a 3:3.2 tile. The first wording
             ellipsised mid-sentence in a real browser render, which is a smaller version of
             the problem this component was written to fix. */
          <span className="line-clamp-2 text-ui-xs">Didn&rsquo;t load &mdash; tap to retry</span>
        )}
      </button>
    );
  }

  return (
    <span className={`relative block overflow-hidden bg-white/5 ${className}`} style={style}>
      {state === "loading" ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/10 via-white/20 to-white/10 motion-reduce:animate-none"
        />
      ) : null}
      <img
        /* If the authorised fetch failed, fall back to the plain src so the
           element's own onError fires and the existing retry ladder runs -
           bounded by maxRetries, ending in the "Didn't load" tile. */
        src={media.status === "failed" ? activeSrc : media.src || undefined}
        alt={alt}
        draggable={false}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        /* A CACHED PHOTO NEVER FIRES onLoad.
           This was measured on the discovery deck: a returned-to page (or any
           image already in the HTTP cache) completed before React attached its
           handler, so `state` stayed "loading" forever and the element sat at
           `opacity: 0`. The card rendered, the name and every control worked, and
           the member's face was a dark rectangle — the exact "silent broken
           image" this component exists to prevent, arriving from the opposite
           direction. The ref callback runs on mount whether or not a load event
           ever will, so it is the place to notice "this is already decoded". */
        ref={(el) => {
          if (!el) return;
          if (el.complete && el.naturalWidth > 0) setState("loaded");
          else if (el.complete) fail();
        }}
        onLoad={() => setState("loaded")}
        onError={fail}
        className={`h-full w-full select-none transition-opacity duration-300 motion-reduce:transition-none ${imgClassName} ${
          state === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
  );
}

export default PhotoImage;
