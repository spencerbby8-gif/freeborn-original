"use client";

import { PhotoImage } from "@/components/ui/photo-image";
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
          <PhotoImage src={p.photo} alt={p.name} className="h-full w-full" imgClassName="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
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

function SectionHead({ title, count, desc }: { title: string; count: number; desc: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="flex items-center gap-2.5 text-[12px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-300)]">
        {title}
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] tabular-nums text-[var(--color-sand)]">
          {count}
        </span>
      </h2>
      <p className="text-[12px] leading-4 text-[var(--color-mist)]">{desc}</p>
    </div>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-gold-500)]/15 text-[var(--color-gold-300)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.4 10.4-8.4 10.4z" />
        </svg>
      </span>
      <p className="mt-3 text-[14px] font-bold text-[var(--color-pearl)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-5 text-[var(--color-mist)]">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
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
          title: `It's mutual. You and ${p.name} matched`,
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

  const mutual = likedYou.filter((p) => p.matched);
  const pending = likedYou.filter((p) => !p.matched);

  return (
    <div className="mx-auto max-w-[880px]">
      <div className="fb-section-head">
        <h1 className="fb-h-title">Likes</h1>
        <p className="fb-meta">
          Everyone who liked you, visible for free, and everyone you have liked.
          No mystery notifications and no paywall to peek.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" data-search="likes summary counts mutual">
        <span className="fb-chip">
          Liked you
          <span className="tabular-nums text-[var(--color-pearl)]">{likedYou.length}</span>
        </span>
        <span className="fb-chip fb-chip-gold">
          Mutual
          <span className="tabular-nums">{mutual.length}</span>
        </span>
        <span className="fb-chip">
          You liked
          <span className="tabular-nums text-[var(--color-pearl)]">{liked.length}</span>
        </span>
      </div>

      {mutual.length > 0 ? (
        <section className="fb-card-lg mt-6" data-search="mutual matches open chat">
          <SectionHead
            title="Mutual"
            count={mutual.length}
            desc="You both said yes. The conversation is already open."
          />
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {mutual.map((p) => (
              <Card
                key={`mutual-${p.id}`}
                p={p}
                badge="Matched"
                action={
                  <a
                    href={p.matchId ? `/app/chat?match=${p.matchId}` : "/app/chat"}
                    className="fb-btn fb-btn-primary fb-btn-sm !min-h-0 !px-3.5 !py-1.5 !text-[11px]"
                  >
                    Open chat
                  </a>
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="fb-card-lg mt-6" data-search="people who liked you like back">
        <SectionHead
          title="Liked you"
          count={pending.length}
          desc="People who liked your profile. Liking back makes it a match."
        />
        {pending.length === 0 ? (
          <Empty
            title={likedYou.length > 0 ? "No new likes right now" : "No likes yet"}
            body={
              likedYou.length > 0
                ? "Everyone who liked you is already a match. New likes land here the moment they arrive."
                : "When someone likes you, you will see exactly who it is here, for free."
            }
          />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {pending.map((p) => (
              <Card
                key={`in-${p.id}`}
                p={p}
                badge={p.superlike ? "Super-liked you" : "Liked you"}
                action={
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => void likeBack(p)}
                    className="fb-btn fb-btn-primary fb-btn-sm !min-h-0 !px-3.5 !py-1.5 !text-[11px] disabled:opacity-50"
                  >
                    {busyId === p.id ? "\u2026" : "Like back"}
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="fb-card-lg mt-6" data-search="likes you sent unlike remove">
        <SectionHead
          title="You liked"
          count={liked.length}
          desc="Likes you have sent. Remove one any time if it was a mis-tap."
        />
        {liked.length === 0 ? (
          <Empty
            title="You haven&apos;t liked anyone yet"
            body="Head to Discover and tap the heart on people who feel right. They gather here."
            action={
              <a href="/app" className="fb-btn fb-btn-primary fb-btn-sm">
                Start discovering
              </a>
            }
          />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
                    className="fb-btn fb-btn-ghost fb-btn-sm !min-h-0 !px-3 !py-1.5 !text-[10.5px] disabled:opacity-50"
                  >
                    {busyId === p.id ? "\u2026" : "Unlike"}
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
