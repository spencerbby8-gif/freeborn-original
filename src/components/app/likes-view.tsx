"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PhotoImage } from "@/components/ui/photo-image";
import { getAccessToken } from "@/lib/supabase/browser";
import { showToast } from "@/components/toast-host";
import { VerifyBadge } from "@/components/verify-badge";
import { SrCount, SrEmpty, SrLoading, SrPill, SrPillRow, SrScreen, SrTitle } from "./sr-ui";
import { HeartMarkIcon, MoreIcon } from "@/components/ui/line-icons";

/**
 * Likes — "People who like you".
 *
 * Structure taken from the reference's second screen: a serif two-line title with
 * a red count disc, a row of four filter pills, then one row per person — square
 * portrait on the left, name + verified seal, occupation, distance, and a glowing
 * heart disc on the right.
 *
 * The data is real: GET /api/likes returns everyone who liked this member and
 * everyone they liked, and POST /api/likes performs both the like-back and the
 * unlike. Only the presentation changed.
 */

type LikedProfile = {
  id: string;
  name: string;
  city: string;
  photo: string;
  verified: boolean;
  likedAt: string;
};

type IncomingLike = LikedProfile & {
  age?: number | null;
  occupation?: string | null;
  distanceKm?: number | null;
  superlike: boolean;
  matched: boolean;
  matchId: string | null;
};

type Filter = "All" | "New" | "Nearby" | "Similar";

function distance(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return null;
  return `${km} ${km === 1 ? "mile" : "miles"} away`;
}

function LikeRow({
  p,
  busy,
  onHeart,
  hearted,
}: {
  p: IncomingLike;
  busy: boolean;
  onHeart: () => void;
  hearted?: boolean;
}) {
  const meta = p.occupation ?? null;
  const dist = distance(p.distanceKm);
  return (
    <article className="fb-sr-likerow">
      <Link href="/app/profile" className="fb-sr-likerow__photo" aria-label={`Open ${p.name}'s profile`}>
        {p.photo ? (
          <PhotoImage src={p.photo} alt={p.name} className="h-full w-full" imgClassName="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[var(--gradient-ember-warm)] font-display text-2xl text-white">
            {p.name.charAt(0)}
          </span>
        )}
      </Link>

      <Link href="/app/profile" className="fb-sr-likerow__body">
        <span className="fb-sr-likerow__name">
          {p.name}
          {p.age ? <span className="fb-sr-likerow__age">, {p.age}</span> : null}
          {p.verified ? <VerifyBadge size={13} /> : null}
        </span>
        {meta ? <span className="fb-sr-likerow__role">{meta}</span> : null}
        {dist ? <span className="fb-sr-likerow__dist">{dist}</span> : null}
      </Link>

      <button
        type="button"
        onClick={onHeart}
        disabled={busy}
        aria-label={hearted ? `${p.name} already matched with you` : `Like ${p.name} back`}
        className="fb-sr-heartdisc"
        data-on={hearted ? "true" : "false"}
      >
        <HeartMarkIcon size={17} />
      </button>
    </article>
  );
}

/** one row: the fields a liker's row reads, in the endpoint's shape */
export type LikesPerson = IncomingLike;
export type LikesSeed = { likedYou: IncomingLike[]; liked: LikedProfile[] };

/**
 * `seed` renders the screen from supplied data instead of the endpoint. It is used
 * by /preview so the design can be walked without a session; the actions still
 * mutate the list in place, so every control behaves. Production passes nothing
 * and the screen is driven entirely by GET/POST /api/likes.
 */
export function LikesView({ seed }: { seed?: LikesSeed } = {}) {
  const [liked, setLiked] = useState<LikedProfile[]>(seed?.liked ?? []);
  const [likedYou, setLikedYou] = useState<IncomingLike[]>(seed?.likedYou ?? []);
  const [loading, setLoading] = useState(!seed);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");

  const load = useCallback(async () => {
    if (seed) return;
    const token = await getAccessToken().catch(() => null);
    const res = await fetch("/api/likes", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      setLiked(json.liked ?? []);
      setLikedYou(json.likedYou ?? []);
    }
    setLoading(false);
  }, [seed]);

  useEffect(() => {
    void load();
  }, [load]);

  const likeBack = async (p: IncomingLike) => {
    if (busyId) return;
    if (seed) {
      setLikedYou((prev) => prev.map((x) => (x.id === p.id ? { ...x, matched: true } : x)));
      setLiked((prev) =>
        prev.some((x) => x.id === p.id)
          ? prev
          : [{ id: p.id, name: p.name, city: p.city, photo: p.photo, verified: p.verified, likedAt: new Date().toISOString() }, ...prev],
      );
      setNote(`It's mutual. You and ${p.name} matched`);
      return;
    }
    setBusyId(p.id);
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profileId: p.id, choice: "like" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.matched) {
        showToast({
          tone: "success",
          title: `It's mutual. You and ${p.name} matched`,
          body: "The conversation is open. Say hello.",
        });
        await load();
        return;
      }
      if (res.ok) {
        showToast({ tone: "success", title: "Like sent", body: `${p.name} will see it in their Likes tab.` });
        await load();
      } else {
        showToast({ tone: "error", title: "Couldn't send the like", body: "Try again in a moment." });
      }
    } catch {
      showToast({ tone: "error", title: "Couldn't send the like", body: "Check your connection." });
    } finally {
      setBusyId(null);
    }
  };

  const unlike = async (p: LikedProfile) => {
    if (busyId) return;
    if (seed) {
      setLiked((prev) => prev.filter((x) => x.id !== p.id));
      setNote(`Removed your like on ${p.name}`);
      return;
    }
    setBusyId(p.id);
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "unlike", profileId: p.id }),
      });
      if (res.ok) {
        showToast({ tone: "success", title: "Like removed", body: `${p.name} will no longer see your like.` });
        await load();
      } else {
        showToast({ tone: "error", title: "Couldn't remove the like", body: "Try again in a moment." });
      }
    } catch {
      showToast({ tone: "error", title: "Couldn't remove the like", body: "Check your connection." });
    } finally {
      setBusyId(null);
    }
  };

  /* The four pills filter the same list — All shows everyone who liked you,
     New is the unmatched (unseen) arrivals, Nearby sorts by distance, Similar
     keeps the people a like has already been returned to. */
  const rows = useMemo(() => {
    const base = [...likedYou];
    if (filter === "New") return base.filter((p) => !p.matched && !p.superlike);
    if (filter === "Nearby") {
      return base.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    }
    if (filter === "Similar") return base.filter((p) => p.matched);
    return base;
  }, [likedYou, filter]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2400);
    return () => clearTimeout(t);
  }, [note]);

  const newCount = likedYou.filter((p) => !p.matched && !p.superlike).length;

  return (
    <SrScreen>
      <SrTitle
        right={
          <button type="button" className="fb-sr-iconbtn" aria-label="Likes options" onClick={() => showToast({ tone: "info", title: "Likes", body: "Everyone who liked you, newest first." })}>
            <MoreIcon size={18} />
          </button>
        }
      >
        <span className="block">People who</span>
        <span className="block">
          like you <SrCount value={likedYou.length} />
        </span>
      </SrTitle>

      <SrPillRow>
        <SrPill active={filter === "All"} onClick={() => setFilter("All")}>All</SrPill>
        <SrPill active={filter === "New"} onClick={() => setFilter("New")} badge={newCount || null}>New</SrPill>
        <SrPill active={filter === "Nearby"} onClick={() => setFilter("Nearby")}>Nearby</SrPill>
        <SrPill active={filter === "Similar"} onClick={() => setFilter("Similar")}>Similar</SrPill>
      </SrPillRow>

      <div className="fb-sr-list">
        {loading ? <SrLoading rows={4} /> : null}

        {!loading && rows.length === 0 ? (
          <SrEmpty
            title={filter === "All" ? "No likes yet" : `Nobody in ${filter}`}
            body={
              filter === "All"
                ? "When someone likes your profile they appear here, free to see. There is no paywall on this tab."
                : "Try another filter — everyone who liked you is still under All."
            }
            action={
              <Link href="/app" className="fb-sr-pill" style={{ height: 38, padding: "0 18px" }}>
                Back to Discover
              </Link>
            }
          />
        ) : null}

        {!loading
          ? rows.map((p) => (
              <LikeRow
                key={p.id}
                p={p}
                busy={busyId === p.id}
                hearted={p.matched}
                onHeart={() => (p.matched ? undefined : likeBack(p))}
              />
            ))
          : null}

        {!loading && filter === "All" && liked.length > 0 ? (
          <>
            <p className="fb-sr-listhead">
              You liked <span>{liked.length}</span>
            </p>
            {liked.map((p) => (
              <article key={p.id} className="fb-sr-likerow">
                <Link href="/app/profile" className="fb-sr-likerow__photo" aria-label={`Open ${p.name}'s profile`}>
                  {p.photo ? (
                    <PhotoImage src={p.photo} alt={p.name} className="h-full w-full" imgClassName="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-[var(--gradient-ember-warm)] font-display text-2xl text-white">
                      {p.name.charAt(0)}
                    </span>
                  )}
                </Link>
                <div className="fb-sr-likerow__body">
                  <span className="fb-sr-likerow__name">
                    {p.name}
                    {p.verified ? <VerifyBadge size={13} /> : null}
                  </span>
                  <span className="fb-sr-likerow__dist">Liked {new Date(p.likedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                </div>
                <button
                  type="button"
                  onClick={() => unlike(p)}
                  disabled={busyId === p.id}
                  className="fb-sr-undo"
                >
                  Undo
                </button>
              </article>
            ))}
          </>
        ) : null}
      </div>

      {note ? (
        <div className="fb-sr-harness-toast" data-tone="good" role="status">
          {note}
          <button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button>
        </div>
      ) : null}
    </SrScreen>
  );
}
