"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";
import { VerifyBadge } from "@/components/verify-badge";

type LikedProfile = {
  id: string;
  name: string;
  city: string;
  photo: string;
  verified: boolean;
  likedAt: string;
};

export function LikesView() {
  const [liked, setLiked] = useState<LikedProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/likes", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        setLiked(json.liked);
      }
      setLoading(false);
    })();
  }, []);

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
        Everyone you've liked — and who already liked you back.
      </p>

      {liked.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-white/[0.07] bg-white/[0.02] p-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-gold-500)]/15 text-[var(--color-gold-300)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.4 10.4-8.4 10.4z" />
            </svg>
          </span>
          <p className="mt-4 font-display text-xl font-semibold">No likes yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--color-mist)]">
            Head to Discover and tap the heart on people who feel right. They'll gather here.
          </p>
          <a
            href="/app"
            className="btn-ember btn-shine relative mt-6 inline-flex overflow-hidden rounded-full px-7 py-3 text-sm font-bold"
          >
            Start discovering
          </a>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {liked.map((p) => (
            <article
              key={p.id}
              className="overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.025] transition hover:border-white/[0.14]"
            >
              <div className="relative aspect-[4/5]">
                {p.photo ? (
                  <img src={p.photo} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-[var(--gradient-ember-warm)] font-display text-3xl font-bold text-white">
                    {p.name.charAt(0)}
                  </span>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1022] via-transparent to-transparent" />
                {p.verified ? (
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-night/55 p-1.5 backdrop-blur-sm">
                    <VerifyBadge size={18} />
                  </span>
                ) : null}
                <div className="absolute inset-x-3 bottom-2.5">
                  <p className="text-[15px] font-black text-[var(--color-pearl)]">{p.name}</p>
                  <p className="text-[11px] text-[var(--color-sand)]">{p.city}</p>
                </div>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-teal-300)]">
                  Liked
                </span>
                <span className="text-[11px] text-[var(--color-ash)]">
                  {new Date(p.likedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
