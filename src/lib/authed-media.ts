"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";

/**
 * Authenticated media srcs.
 *
 * WHY THIS EXISTS (owner report B10: voice notes unplayable, other media too)
 *   Chat attachments and member-uploaded profile photos are stored as
 *   `chat_media` blobs and served by `GET /api/chat/media/:id`. That route is
 *   participant-only and answers 401 without a session - correctly, and it was
 *   tightened deliberately in an earlier audit because private media must not be
 *   readable by anyone holding an id.
 *
 *   The problem is that a browser media element cannot carry a session. An
 *   `<img src>`, `<audio src>` or `<video src>` issues a bare GET with no
 *   Authorization header, and this app keeps its Supabase session in
 *   localStorage rather than in cookies - see src/lib/supabase/browser.ts, a
 *   deliberate choice so the app still authenticates inside a cross-site iframe
 *   where third-party cookies are blocked. The server's cookie fallback in
 *   src/lib/supabase/api-auth.ts therefore has nothing to read.
 *
 *   Measured live on a preview, in one signed-in session:
 *     GET /api/chat/messages?match=9f74f4ae…  -> 200   (fetch + Bearer)
 *     GET /api/chat/media/4b040160…           -> 401   (the element rendering it)
 *   So every voice note, video and chat photo was broken for BOTH participants
 *   on EVERY device, and member-uploaded profile photos were broken for everyone
 *   but their owner. No amount of player polish can fix a 401.
 *
 *   The fix that weakens nothing: fetch those bytes with the member's own Bearer
 *   token - the same credential every other call in this app uses - and hand the
 *   media element a local `blob:` URL.
 *     - no token in a URL. URLs leak through history, Referer, shared links and
 *       proxy logs, which is exactly what the media route's own comments warn
 *       about; a session token in a query string would have been a serious
 *       regression.
 *     - no session cookie reintroduced, so the cross-site-iframe auth story and
 *       the SameSite=Lax CSRF posture are untouched.
 *     - no new secret, no env var, no schema change, no migration.
 *     - the route still does all the authorising: this only changes how an
 *       already-authorised member's browser presents its credential.
 *
 *   Cost, stated plainly: the element plays from memory, so the attachment is
 *   fetched whole before playback starts instead of streaming progressively. The
 *   upload caps bound that (8 MB photos and voice notes, 20 MB video), and a
 *   blob URL is fully seekable - which is more than a range-less HTTP response
 *   ever was.
 */

const AUTHED_PATH = /^\/api\/chat\/media\//;

/** True when a src points at the participant-only media route and so needs the
 *  member's own credential. Public Supabase storage objects, data URLs and blob
 *  URLs are not authed and must stay exactly as they are. */
export function isAuthedMediaSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  if (AUTHED_PATH.test(src)) return true;
  if (typeof window !== "undefined" && src.startsWith(window.location.origin)) {
    return AUTHED_PATH.test(src.slice(window.location.origin.length));
  }
  return false;
}

type Entry = { objectUrl: string | null; promise: Promise<string | null>; refs: number };

/* One fetch per attachment however many places render it (a thread and the
   lightbox, a card and the profile), revoked only when the last one closes. */
const cache = new Map<string, Entry>();

async function fetchObjectUrl(key: string): Promise<string | null> {
  try {
    const token = await getAccessToken().catch(() => null);
    const res = await fetch(key, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

function acquire(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit) {
    hit.refs += 1;
    return hit.promise;
  }
  const promise = fetchObjectUrl(key);
  cache.set(key, { objectUrl: null, promise, refs: 1 });
  void promise.then((objectUrl) => {
    const entry = cache.get(key);
    /* Released while the fetch was still in flight: nobody will use this blob,
       so it is revoked here rather than leaked for the life of the tab. */
    if (!entry) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      return;
    }
    entry.objectUrl = objectUrl;
  });
  return promise;
}

function release(key: string) {
  const entry = cache.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  cache.delete(key);
  if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
}

export type AuthedMediaStatus = "direct" | "pending" | "ready" | "failed";
export type AuthedMedia = { src: string; status: AuthedMediaStatus };

/**
 * Resolves a media src into something an element can actually load.
 *
 * Anything that is not a participant-only media URL passes straight through, so
 * this is safe in front of every image in the app - public storage photos, data
 * URLs from the camera, blob URLs from the recorder all come back unchanged.
 *
 * While the bytes are in flight `src` is "" and `status` is "pending": callers
 * must omit the src attribute rather than set it to "", because an empty src
 * makes the browser re-request the document URL and fires a spurious error -
 * which is how a loading photo used to look like a broken one.
 */
export function useAuthedMedia(src: string | null | undefined): AuthedMedia {
  const key = isAuthedMediaSrc(src) ? (src as string) : null;
  const [state, setState] = useState<{
    forKey: string | null;
    objectUrl: string | null;
    failed: boolean;
  }>({ forKey: null, objectUrl: null, failed: false });

  /* A new key is a new question, so the previous attachment's result is dropped
     during render rather than in an effect. An effect would paint one frame of
     the old attachment onto the new src, and setting state synchronously inside
     an effect body cascades renders. This is React's documented "adjust state
     when a prop changes" shape - the same one PhotoImage uses. */
  if (state.forKey !== key) {
    setState({ forKey: key, objectUrl: null, failed: false });
  }

  useEffect(() => {
    if (!key) return;
    let alive = true;
    void acquire(key).then((objectUrl) => {
      if (!alive) return;
      setState((prev) =>
        prev.forKey === key ? { ...prev, objectUrl, failed: !objectUrl } : prev
      );
    });
    return () => {
      alive = false;
      release(key);
    };
  }, [key]);

  if (!key) return { src: src ?? "", status: "direct" };
  if (state.objectUrl) return { src: state.objectUrl, status: "ready" };
  if (state.failed) return { src: "", status: "failed" };
  return { src: "", status: "pending" };
}
