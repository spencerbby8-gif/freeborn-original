"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { getAccessToken } from "@/lib/supabase/browser";
import { showToast } from "@/components/toast-host";

type AppealState = {
  status: string;
  verdict: string | null;
  dueAt: string;
  ready: boolean;
} | null;

export function AppealExperience() {
  const [state, setState] = useState<"loading" | "form" | "filed" | "checking">("loading");
  const [appeal, setAppeal] = useState<AppealState>(null);
  const [plea, setPlea] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const token = await getAccessToken().catch(() => null);
    if (!token) {
      window.location.replace("/auth?mode=sign-in");
      return;
    }
    try {
      const res = await fetch("/api/appeals", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const json = await res.json();
        if (json.appeal) {
          setAppeal(json.appeal);
          setState(json.appeal.status === "under_review" ? "checking" : "filed");
          return;
        }
      }
    } catch {
      /* fall through to form */
    }
    setState("form");
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (busy || plea.trim().length < 10) return;
    setBusy(true);
    const token = await getAccessToken().catch(() => null);
    try {
      const res = await fetch("/api/appeals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ detail: plea.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast({
          tone: "success",
          title: "Appeal received",
          body: "Your appeal is with us. Check back here for the result.",
        });
        void load();
      } else {
        showToast({ tone: "error", title: "Couldn't file the appeal", body: json.error ?? "Try again." });
      }
    } catch {
      showToast({ tone: "error", title: "Couldn't file the appeal", body: "Check your connection." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] bg-[var(--color-night)] text-[var(--color-pearl)]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[640px] flex-col px-5 py-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="transition hover:opacity-80">
            <Wordmark size="sm" />
          </Link>
          <Link
            href="/auth?mode=sign-in"
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[12px] font-bold text-[var(--color-sand)] transition hover:text-[var(--color-pearl)]"
          >
            Sign in
          </Link>
        </div>

        <div className="my-auto py-10">
          {state === "loading" ? (
            <div className="flex justify-center py-20">
              <span className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
            </div>
          ) : state === "checking" ? (
            <div className="rounded-[28px] border border-[var(--color-gold-500)]/30 bg-white/[0.02] p-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-gold-500)]/15 text-[var(--color-gold-300)]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </span>
              <h1 className="mt-5 font-display text-2xl font-semibold">Your appeal is under investigation</h1>
              <p className="mx-auto mt-3 max-w-[40ch] text-[14px] leading-6 text-[var(--color-mist)]">
                Your appeal is recorded alongside your account&apos;s security record,
                and a person reads it. Check back here for the result.
              </p>
              <p className="mx-auto mt-3 max-w-[42ch] text-[12.5px] leading-5 text-[var(--color-ash)]">
                We deliberately do not print a date. Reinstatement is decided by the
                operator rather than by the product, so a deadline shown here would be
                a promise nothing in the system enforces.
              </p>
              <p className="mt-4 text-[12px] text-[var(--color-ash)]">
                Suspensions come from automated and datacenter traffic. Never from an opinion, and never from a report on its own.
              </p>
            </div>
          ) : state === "filed" && appeal ? (
            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.02] p-8 text-center">
              <h1 className="font-display text-2xl font-semibold">Appeal decision</h1>
              <p
                className={`mt-4 text-[15px] font-black ${
                  appeal.verdict === "cleared" ? "text-[var(--color-teal-300)]" : "text-red-300"
                }`}
              >
                {appeal.verdict === "cleared"
                  ? "Your account has been cleared. Welcome back."
                  : appeal.verdict
                    ? "The suspension stands after investigation."
                    : "Your appeal is still being processed."}
              </p>
              {appeal.verdict === "cleared" ? (
                <Link
                  href="/auth?mode=sign-in"
                  className="btn-ember mt-6 inline-flex rounded-full px-7 py-3 text-[14px] font-bold"
                >
                  Sign back in
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.02] p-8">
              <h1 className="font-display text-2xl font-semibold">Appeal your suspension</h1>
              <p className="mt-3 text-[13.5px] leading-6 text-[var(--color-mist)]">
                Suspensions come from automated and datacenter traffic. Never from an opinion, and never from a report on its own.
                Tell us your side. Your appeal is read together with your account&apos;s security
                record, and a person decides it.
              </p>
              <textarea
                value={plea}
                onChange={(e) => setPlea(e.target.value)}
                placeholder="What happened? Why do you believe this is a mistake?"
                className="mt-5 min-h-[140px] w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-[14px] leading-6 text-[var(--color-pearl)] outline-none transition placeholder:text-[var(--color-ash)] focus:border-[var(--color-gold-500)]"
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || plea.trim().length < 10}
                className="btn-ember btn-shine relative mt-4 w-full overflow-hidden rounded-full py-3.5 text-[15px] font-bold disabled:opacity-50"
              >
                {busy ? "Filing…" : "Submit appeal"}
              </button>
              <p className="mt-3 text-center text-[11.5px] text-[var(--color-ash)]">
                Check back here for your result.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
