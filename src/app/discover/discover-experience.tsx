"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { VerifyBadge } from "@/components/verify-badge";

export type SessionAccount = { email: string; displayName: string };

type Profile = {
  id: number;
  name: string;
  age: number;
  city: string;
  occupation: string;
  headline: string;
  promptQuestion: string;
  promptAnswer: string;
  traits: string[];
  photo: string;
  verified: boolean;
  likes: number;
};

export function DiscoverExperience({
  account,
  embedded = false,
}: {
  account: SessionAccount | null;
  embedded?: boolean;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<"like" | "pass" | null>(null);
  const [heartsGiven, setHeartsGiven] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profiles")
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load the discovery room.");
        return res.json();
      })
      .then((json) => setProfiles(json.profiles as Profile[]))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const current = profiles[index];

  const act = useCallback(
    async (choice: "like" | "pass") => {
      if (!current || leaving) return;
      setLeaving(choice);
      try {
        await fetch("/api/likes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: current.id, choice }),
        });
        if (choice === "like") {
          setHeartsGiven((n) => n + 1);
          setProfiles((rows) =>
            rows.map((p) => (p.id === current.id ? { ...p, likes: p.likes + 1 } : p))
          );
        }
      } finally {
        setTimeout(() => {
          setIndex((i) => i + 1);
          setLeaving(null);
        }, 320);
      }
    },
    [current, leaving]
  );

  const signOut = () => {
    // Native POST navigation follows the route's redirect to /auth.
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/auth/signout";
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div className={embedded ? "" : "min-h-screen"}>
      {!embedded ? (
      <header className="mx-auto flex min-h-[88px] max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="transition hover:opacity-80">
          <Wordmark size="sm" />
        </Link>
        {account ? (
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2.5 rounded-full border hairline bg-white/[0.04] py-1.5 pl-2 pr-4 sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] text-[11px] font-black text-white">
                {account.displayName.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-[160px] truncate text-[12px] font-semibold text-[var(--color-sand)]">
                {account.email}
              </span>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="btn-ghost rounded-full px-5 py-2 text-[13px] font-bold"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link
              href="/auth?mode=sign-in"
              className="hidden text-[13px] font-bold text-[var(--color-mist)] transition-colors hover:text-[var(--color-pearl)] sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/auth?mode=sign-up"
              className="btn-ember rounded-full px-5 py-2 text-[13px] font-bold"
            >
              Create account
            </Link>
          </div>
        )}
      </header>
      ) : null}

      <main className={embedded ? "mx-auto max-w-md px-1 pt-2" : "mx-auto max-w-md px-5 pb-24 pt-4"}>
        <p className="eyebrow text-center">
          {account ? "The discovery room" : "Discovery preview"}
        </p>
        <h1 className="mt-4 text-center font-display text-3xl font-semibold tracking-tight text-pearl">
          {account ? (
            <>
              Welcome back,{" "}
              <em className="font-medium italic text-gold-300">
                {account.displayName.split(" ")[0]}.
              </em>
            </>
          ) : (
            <>
              The room, <em className="font-medium italic text-gold-300">before it opens.</em>
            </>
          )}
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-center text-[14px] leading-relaxed text-mist">
          {account
            ? "Read the whole person before you decide. Likes are saved to your ledger."
            : "A working preview seeded with founding-member profiles. Like or pass — the ledger below each card is live, stored in the database."}
        </p>

        {loading && (
          <div className="skeleton mt-10 aspect-[3/4.4] rounded-[28px] border hairline" />
        )}

        {error && (
          <div className="mt-10 rounded-[24px] border border-[rgba(255,107,122,0.2)] bg-[rgba(255,107,122,0.05)] px-5 py-4 text-[14px] font-medium text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {!loading && !error && !current && (
          <div className="surface magic-border mt-10 rounded-[28px] px-8 py-14 text-center">
            <p className="font-display text-2xl font-semibold text-pearl">
              You've met everyone in the room today.
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-mist">
              You gave {heartsGiven} {heartsGiven === 1 ? "heart" : "hearts"}. New members
              arrive daily — come back tomorrow, or finish shaping your own profile.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              {account ? null : (
                <Link
                  href="/auth?mode=sign-up"
                  className="btn-ember btn-shine relative overflow-hidden rounded-full px-7 py-3 text-[14px] font-bold"
                >
                  Create your Freeborn account
                </Link>
              )}
              <button
                type="button"
                onClick={() => setIndex(0)}
                className="btn-ghost rounded-full px-6 py-2.5 text-[13px] font-bold"
              >
                Meet them again
              </button>
            </div>
          </div>
        )}

        {current && (
          <div className="relative mt-10">
            {profiles[index + 1] && (
              <div className="absolute inset-x-4 -top-2 h-full rounded-[28px] border hairline bg-abyss/70" aria-hidden />
            )}
            {profiles[index + 2] && (
              <div className="absolute inset-x-9 -top-4 h-full rounded-[28px] border hairline bg-abyss/40" aria-hidden />
            )}

            <article
              className={`luminous-card relative overflow-hidden rounded-[28px] border hairline bg-abyss transition-all duration-300 ${
                leaving === "like"
                  ? "translate-x-24 rotate-6 opacity-0"
                  : leaving === "pass"
                    ? "-translate-x-24 -rotate-6 opacity-0"
                    : ""
              }`}
            >
              <div className="relative aspect-[3/3.1]">
                <img
                  src={current.photo}
                  alt={`${current.name}, ${current.age} — ${current.occupation}`}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-abyss via-transparent to-transparent" />
                <div className="absolute left-5 top-5 flex items-center gap-2">
                  {current.verified && (
                    <span className="rounded-full bg-night/60 p-1.5 backdrop-blur-sm">
                      <VerifyBadge size={22} />
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full border hairline bg-night/60 px-2.5 py-1 text-[11px] font-semibold text-sand backdrop-blur-sm">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M8 13.6S2.1 9.9 2.1 5.9a3 3 0 015.9-.7A3 3 0 0113.9 5.9c0 4-5.9 7.7-5.9 7.7z" fill="#ef5e5e" />
                    </svg>
                    {current.likes} {current.likes === 1 ? "heart" : "hearts"}
                  </span>
                </div>
                <div className="absolute inset-x-5 bottom-4">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="font-display text-3xl font-semibold text-pearl">{current.name}</h2>
                    <span className="font-display text-2xl text-gold-300">{current.age}</span>
                  </div>
                  <p className="mt-1 text-[13px] tracking-wide text-sand">
                    {current.occupation} · {current.city}
                  </p>
                </div>
              </div>
              <div className="space-y-4 p-6">
                <p className="font-display text-[16px] italic leading-snug text-ivory">
                  “{current.headline}”
                </p>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-500">
                    {current.promptQuestion}
                  </p>
                  <p className="mt-2 text-[14px] leading-[1.75] text-mist">{current.promptAnswer}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {current.traits.map((trait) => (
                    <span
                      key={trait}
                      className="rounded-full border hairline bg-pearl/5 px-3 py-1 text-[11px] font-semibold tracking-wide text-sand"
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            </article>

            <div className="mt-7 flex items-center justify-center gap-8">
              <button
                type="button"
                onClick={() => act("pass")}
                aria-label="Pass"
                className="btn-ghost flex h-16 w-16 items-center justify-center rounded-full"
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
                  <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => act("like")}
                aria-label="Like"
                className="btn-ember btn-shine relative flex h-[74px] w-[74px] items-center justify-center overflow-hidden rounded-full"
              >
                <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
                  <path
                    d="M15 25.5S3.9 18.6 3.9 11a5.6 5.6 0 0111.1-1.3A5.6 5.6 0 0126.1 11c0 7.6-11.1 14.5-11.1 14.5z"
                    fill="#fff7f2"
                  />
                </svg>
              </button>
            </div>
            <p className="mt-4 text-center text-[12px] tracking-wide text-ash">
              {index + 1} of {profiles.length} in today's room
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
