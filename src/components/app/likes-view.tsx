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

const HEART_PATH = "M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.4 10.4-8.4 10.4z";

/** Screen 05 row: photo thumb, name + verified, meta line, one clear action. */
function Row({ p, tag, action }: { p: LikedProfile; tag?: string; action: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-[20px] border border-[var(--color-line)] bg-[var(--color-midnight)] p-3 transition hover:border-[var(--color-line-strong)]">
      <div className="relative h-[74px] w-[60px] shrink-0 overflow-hidden rounded-[14px]">
        {p.photo ? (
          <PhotoImage src={p.photo} alt={p.name} className="h-full w-full" imgClassName="object-cover object-[50%_18%]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[var(--gradient-ember-warm)] font-display text-2xl text-[#2a1a10]/85">
            {p.name.charAt(0)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[15px] font-bold leading-tight text-[var(--color-pearl)]">
          <span className="truncate">{p.name}</span>
          {p.verified ? <VerifyBadge size={14} /> : null}
        </p>
        <p className="mt-1 truncate text-[12px] text-[var(--color-mist)]">
          {p.city}
          <span className="text-[var(--color-ash)]"> · {new Date(p.likedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
        </p>
        {tag ? (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#e0685f]/35 bg-[#e0685f]/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#f0998a]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d={HEART_PATH} />
            </svg>
            {tag}
          </span>
        ) : null}
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

/** Filled rose heart in a maroon circle — the reference's like-back affordance. */
function LikeBackButton({ busy, onClick, name }: { busy: boolean; onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      aria-label={`Like ${name} back`}
      title="Like back"
      className="flex h-12 w-12 items-center justify-center rounded-full border border-[#e0685f]/30 bg-[#43303c] text-[#e0685f] transition hover:bg-[#4e3745] active:scale-95 disabled:opacity-50"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d={HEART_PATH} />
      </svg>
    </button>
  );
}

/** Outline heart — quiet, removable state for likes you've sent. */
function UnlikeButton({ busy, onClick, name }: { busy: boolean; onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      aria-label={`Unlike ${name}`}
      title="Unlike"
      className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-abyss)] text-[var(--color-mist)] transition hover:text-[var(--color-pearl)] active:scale-95 disabled:opacity-50"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={HEART_PATH} />
      </svg>
    </button>
  );
}

function SectionHead({ title, count, desc }: { title: string; count: number; desc: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="flex items-center gap-2.5 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--color-ember-500)]">
        {title}
        <span className="rounded-full bg-[var(--color-abyss)] px-2 py-0.5 text-[10.5px] tabular-nums text-[var(--color-sand)]">
          {count}
        </span>
      </h2>
      <p className="text-[12px] leading-4 text-[var(--color-mist)]">{desc}</p>
    </div>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-[22px] border border-[var(--color-line)] bg-[var(--color-midnight)] px-6 py-9 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#43303c] text-[#e0685f]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d={HEART_PATH} />
        </svg>
      </span>
      <p className="mt-3 font-display text-[20px] font-normal tracking-tight text-[var(--color-pearl)]">{title}</p>
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
        <p className="eyebrow">THE ROOM LIKED YOU</p>
        <h1 className="fb-h-title">People who like you</h1>
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
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {mutual.map((p) => (
              <Row
                key={`mutual-${p.id}`}
                p={p}
                tag="Say hello"
                action={
                  <a
                    href={p.matchId ? `/app/chat?match=${p.matchId}` : "/app/chat"}
                    className="fb-btn fb-btn-primary fb-btn-sm !min-h-0 !px-4 !py-2 !text-[12px] whitespace-nowrap"
                  >
                    Open chat
                  </a>
                }
              />
            ))}
          </ul>
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
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {pending.map((p) => (
              <Row
                key={`in-${p.id}`}
                p={p}
                tag={p.superlike ? "Super-liked you" : "Liked you"}
                action={<LikeBackButton busy={busyId === p.id} onClick={() => void likeBack(p)} name={p.name} />}
              />
            ))}
          </ul>
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
            title="You haven't liked anyone yet"
            body="Head to Discover and tap the heart on people who feel right. They gather here."
            action={
              <a href="/app" className="fb-btn fb-btn-primary fb-btn-sm">
                Start discovering
              </a>
            }
          />
        ) : (
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {liked.map((p) => (
              <Row
                key={`out-${p.id}`}
                p={p}
                action={<UnlikeButton busy={busyId === p.id} onClick={() => void unlike(p)} name={p.name} />}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
