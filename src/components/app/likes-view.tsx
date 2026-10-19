"use client";

import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";
import { showToast } from "@/components/toast-host";
import { VerifyBadge } from "@/components/verify-badge";

type LikedProfile = {
  id: string;
  name: string;
  city: string;
  photo: string;
  verified: boolean;
  likedAt: string;
};

type IncomingLike = LikedProfile & {
  superlike: boolean;
  matched: boolean;
  matchId: string | null;
};

function Card({ p, badge, action }: { p: LikedProfile; badge: string; action?: React.ReactNode }) {
  return (
    <article className="group overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.025] transition hover:-translate-y-0.5 hover:border-white/[0.16] hover:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]">
      <div className="relative aspect-[4/5]">
        {p.photo ? (
          <img src={p.photo} alt={p.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[var(--gradient-ember-warm)] font-display text-3xl font-bold text-white">
            {p.name.charAt(0)}
          </span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1022] via-transparent to-transparent" />
        {p.verified ? (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-night/55 p-1 backdrop-blur-sm">
            <VerifyBadge size={18} />
          </span>
        ) : null}
        <div className="absolute inset-x-3 bottom-2.5">
          <p className="text-[15px] font-black text-[var(--color-pearl)]">{p.name}</p>
          <p className="text-[11px] text-[var(--color-sand)]">{p.city}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-teal-300)]">{badge}</span>
        {action ?? (
          <span className="text-[11px] text-[var(--color-ash)]">
            {new Date(p.likedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
          </span>
        )}
      </div>
    </article>
  );
}

export function LikesView() {
  const [liked, setLiked] = useState<LikedProfile[]>([]);
  const [likedYou, setLikedYou] = useState<IncomingLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getAccessToken().catch(() => null);
    const res = await fetch("/api/likes", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const json = await res.json();
      setLiked(json.liked ?? []);
      setLikedYou(json.likedYou ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Like back → a real match if they still mean it. */
  /** Unlike — full recourse for an accidental tap. */
  const unlike = async (p: LikedProfile) => {
    if (busyId) return;
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

  const likeBack = async (p: IncomingLike) => {
    if (busyId) return;
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
          title: `It's mutual — you and ${p.name} matched`,
          body: "The conversation is open. Say hello.",
        });
        await load();
        setTimeout(() => window.location.assign("/app/chat"), 900);
        return;
      }
      showToast({ tone: "success", title: "Like sent", body: `${p.name} will see it in their Likes tab.` });
      await load();
    } catch {
      showToast({ tone: "error", title: "Couldn't send the like", body: "Check your connection and try again." });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[880px]">
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Likes</h1>
      <p className="mt-1.5 text-sm text-[var(--color-mist)]">
        See exactly who liked you — and everyone you&apos;ve liked.
      </p>

      {/* --- Who liked YOU (the feature the competitors never built) ---------- */}
      <h2 className="mt-8 flex items-center gap-2.5 text-[12px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-300)]">
        Liked you
        {likedYou.length > 0 ? (
          <span className="rounded-full bg-[var(--color-gold-500)]/15 px-2 py-0.5 text-[10.5px] tabular-nums text-[var(--color-gold-300)]">{likedYou.length}</span>
        ) : null}
      </h2>
      {likedYou.length === 0 ? (
        <div className="mt-3 rounded-[24px] border border-white/[0.07] bg-white/[0.02] p-7 text-center">
          <p className="text-[14px] font-bold text-[var(--color-pearl)]">No likes yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-5 text-[var(--color-mist)]">
            When someone likes you, you&apos;ll see exactly who it is here — no mystery
            notifications, no paywall to peek.
          </p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {likedYou.map((p) => (
            <Card
              key={`in-${p.id}`}
              p={p}
              badge={p.superlike ? "Super-liked you" : "Liked you"}
              action={
                p.matched ? (
                  <a
                    href={p.matchId ? `/app/chat?match=${p.matchId}` : "/app/chat"}
                    className="rounded-full bg-[var(--gradient-ember-warm)] px-3 py-1.5 text-[11px] font-black text-white transition active:scale-95"
                  >
                    Open chat
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => void likeBack(p)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gradient-ember-warm)] px-3.5 py-1.5 text-[11px] font-black text-white shadow-[0_8px_20px_-8px_rgba(239,94,94,0.7)] transition hover:brightness-110 active:scale-95 disabled:opacity-50"
                  >
                    {busyId === p.id ? (
                      "…"
                    ) : (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.4 10.4-8.4 10.4z" />
                        </svg>
                        Like back
                      </>
                    )}
                  </button>
                )
              }
            />
          ))}
        </div>
      )}

      {/* --- Who YOU liked ------------------------------------------------------ */}
      <h2 className="mt-9 flex items-center gap-2.5 text-[12px] font-black uppercase tracking-[0.2em] text-[var(--color-sand)]">
        You liked
        {liked.length > 0 ? (
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] tabular-nums text-[var(--color-sand)]">{liked.length}</span>
        ) : null}
      </h2>
      {liked.length === 0 ? (
        <div className="mt-3 rounded-[24px] border border-white/[0.07] bg-white/[0.02] p-7 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-gold-500)]/15 text-[var(--color-gold-300)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.4 10.4-8.4 10.4z" />
            </svg>
          </span>
          <p className="mt-3 text-[14px] font-bold text-[var(--color-pearl)]">You haven&apos;t liked anyone yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-5 text-[var(--color-mist)]">
            Head to Discover and tap the heart on people who feel right. They&apos;ll gather here.
          </p>
          <a
            href="/app"
            className="btn-ember btn-shine relative mt-5 inline-flex overflow-hidden rounded-full px-7 py-3 text-sm font-bold"
          >
            Start discovering
          </a>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {liked.map((p) => (
            <Card
              key={`out-${p.id}`}
              p={p}
              badge="Liked"
              action={
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => void unlike(p)}
                  aria-label={`Unlike ${p.name}`}
                  title="Remove your like"
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10.5px] font-black uppercase tracking-wider text-[var(--color-mist)] transition hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
                >
                  {busyId === p.id ? "…" : "Unlike"}
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
