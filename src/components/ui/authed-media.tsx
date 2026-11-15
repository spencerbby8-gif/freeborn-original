"use client";

import type { ComponentProps, ReactElement } from "react";
import { useAuthedMedia } from "@/lib/authed-media";

/**
 * `<img>` and `<video>` that can actually load Freeborn's participant-only
 * media. A bare src to /api/chat/media/:id is a 401, because a media element
 * sends no Authorization header and this app's session lives in localStorage,
 * not cookies — see src/lib/authed-media.ts for the whole story.
 *
 * While the bytes are fetched the src attribute is OMITTED rather than set to
 * "": an empty src makes the browser re-request the document URL and fire a
 * spurious error. If the authorised fetch itself fails (attachment deleted,
 * conversation ended) the original src is passed through, so the element errors
 * the way it always did and the caller's own failure UI applies — no silent
 * blank rectangle, and no regression against today's behaviour.
 */
export function AuthedImg({ src, alt = "", ...rest }: ComponentProps<"img">): ReactElement {
  const media = useAuthedMedia(typeof src === "string" ? src : null);
  const resolved =
    media.status === "direct"
      ? src
      : media.status === "failed"
        ? src
        : media.src || undefined;
  return <img {...rest} src={resolved} alt={alt} />;
}

export function AuthedVideo({ src, ...rest }: ComponentProps<"video">): ReactElement {
  const media = useAuthedMedia(typeof src === "string" ? src : null);
  const resolved =
    media.status === "direct" || media.status === "failed" ? src : media.src || undefined;
  return <video {...rest} src={resolved} />;
}
