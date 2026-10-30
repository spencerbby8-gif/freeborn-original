"use client";


/**
 * /admin — read-only operator view of the review queue.
 *
 * WHY THIS PAGE EXISTS. The queue has lived at `GET /api/admin/review-queue` since
 * REVIEW-SURFACE-DESIGN.md §2, deliberately read-only and deliberately without a write panel.
 * But it was JSON-only and unlinked, so an operator who typed the obvious address got the
 * branded not-found page and reasonably concluded the admin route was broken in production. It
 * was not — measured 2026-10-30 on `1163414d7`: the route handler answers its own
 * `text/plain` "Not found" for the real path, a bogus sibling path gets Next's HTML page, and
 * `POST` to the real path gets 405 because the module exports only `GET`. That is a matched,
 * deployed route. The gap was a human-reachable surface, not a broken manifest.
 *
 * HOW IT GETS THE DATA. It fetches the existing endpoint with `credentials: "same-origin"`, so
 * authentication is the member's own Supabase session cookie — the same path `getMember()`
 * already resolves in every other route (it prefers a `Bearer` token and falls back to the SSR
 * cookie client). This page adds no authority check of its own, no second session mechanism, and
 * no way to reach the queue that the API route would not already have answered. Whatever the
 * gate decides, this page shows: 200 renders the queue, 403/401/404 render the reason.
 *
 * READ-ONLY BY CONSTRUCTION. There is no form, no mutation, no write button, and no fetch with a
 * method other than GET. Every operator action still happens in the SQL runbook, which records
 * its own `moderation_actions` row. Nothing here can change a member's account.
 *
 * PRERENDER SAFETY. As a client component the build emits an empty shell, which is why no route
 * segment config is exported here: the shell contains no member data, and every byte of data
 * arrives from the operator's own authenticated request in their own browser. Nothing
 * queue-shaped can be cached on a CDN.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type View =
  | { kind: "loading" }
  | { kind: "error"; status: number | null; note: string }
  | { kind: "ready"; data: Record<string, unknown> };

/** Anything the endpoint returns is rendered as text through React, never as HTML. Report
 *  reasons, case details and appeal bodies are member-submitted strings; an admin surface that
 *  interpolated them into markup would be a stored-XSS hole in the one place that must not have
 *  one. `JSON.stringify` plus a text node is the whole rendering strategy here for that reason. */
function asRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

export default function AdminQueuePage() {
  const [view, setView] = useState<View>({ kind: "loading" });

  /* Everything that touches state happens after an await. The mount effect below therefore
     performs no synchronous setState (react-hooks/set-state-in-effect), and the "loading" reset
     lives in the click handler, which is a user event. */
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/review-queue", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* Not JSON: a proxy error page, or the gate's plain-text "Not found". */
      }
      if (res.ok && parsed && typeof parsed === "object") {
        setView({ kind: "ready", data: parsed as Record<string, unknown> });
        return;
      }
      setView({ kind: "error", status: res.status, note: explain(res.status, text) });
    } catch (e) {
      setView({
        kind: "error",
        status: null,
        note: `The request itself failed: ${String((e as Error)?.message ?? e)}. That is a network or runtime problem, not an authorization decision.`,
      });
    }
  }, []);

  /* Same shape the app's own camera step uses (src/components/app/verify-modal.tsx): an async
     IIFE, so the effect body itself only hands work to the microtask queue. */
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const sections = useMemo(() => {
    if (view.kind !== "ready") return [];
    return Object.entries(view.data).map(([key, value]) => ({
      key,
      count: asRows(value).length,
      isList: Array.isArray(value),
    }));
  }, [view]);

  return (
    <main className="mx-auto max-w-5xl p-6 font-sans text-sm">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Review queue — read only</h1>
        <button
          type="button"
          onClick={() => {
            setView({ kind: "loading" });
            void load();
          }}
          className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Reload
        </button>
      </header>

      <p className="mb-6 text-xs text-neutral-500">
        Source: <code>GET /api/admin/review-queue</code>, fetched with this browser&apos;s session
        cookie. The endpoint is the only authority check; this page renders whatever it decides to
        return. There is no write path here by design — see{" "}
        <code>REVIEW-SURFACE-DESIGN.md</code> §2.
      </p>

      {view.kind === "loading" ? <p className="text-neutral-500">Loading…</p> : null}

      {view.kind === "error" ? (
        <section className="rounded border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
          <p className="mb-1 font-medium">
            Not showing the queue{view.status === null ? "" : ` (HTTP ${view.status})`}.
          </p>
          <p className="text-xs">{view.note}</p>
        </section>
      ) : null}

      {view.kind === "ready" ? (
        <>
          {typeof view.data.note === "string" ? (
            <p className="mb-4 rounded border border-neutral-200 p-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
              {view.data.note}
            </p>
          ) : null}
          <ul className="mb-6 flex flex-wrap gap-3">
            {sections.map((s) => (
              <li
                key={s.key}
                className="rounded border border-neutral-200 px-3 py-2 dark:border-neutral-800"
              >
                <span className="font-mono text-xs text-neutral-500">{s.key}</span>{" "}
                <span className="font-semibold">{s.isList ? s.count : "—"}</span>
              </li>
            ))}
          </ul>
          <pre className="overflow-auto rounded border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs leading-relaxed dark:border-neutral-800 dark:bg-neutral-950">
            {JSON.stringify(view.data, null, 2)}
          </pre>
        </>
      ) : null}
    </main>
  );
}

/** Status codes translated into what the operator can act on. Nothing here is derived from the
 *  queue contents, so an unauthorized reader gains only the meaning of a code they already hold. */
function explain(status: number, body: string): string {
  const trimmed = body.trim().slice(0, 120);
  if (status === 403) {
    return (
      "Signed in, but this address is not in FREEBORN_ADMIN_EMAILS. The route's runtime log line " +
      "carries the entry count plus a short hash of both the session address and each configured " +
      "entry, so the two can be compared without an address being written into a shared log. " +
      "The variable is assigned to Production and Preview; Development intentionally has no allowlist."
    );
  }
  if (status === 401) {
    return "Not signed in on this deployment. Sign in with the operator account, then Reload.";
  }
  if (status === 404) {
    /* Two states share this answer on purpose: production refuses anonymous callers with the same
       bare 404 it uses when the allowlist is empty, so an unauthenticated probe can never tell
       "no such route" from "route exists, you are not on the list". Do not claim a cause the
       status code does not establish. */
    return (
      "The endpoint answered with its own plain-text 404 (body: " +
      (trimmed || "empty") +
      "), which means the route ran — a missing route would return Next's HTML not-found page " +
      "instead. In production this is what any request without a session gets, and it is also what " +
      "you get when FREEBORN_ADMIN_EMAILS is empty for this environment. If you are signed in as " +
      "the operator and still see it, the allowlist did not reach this deployment; if you are not " +
      "signed in, sign in and Reload."
    );
  }
  return `Endpoint answered HTTP ${status}${trimmed ? `: ${trimmed}` : ""}.`;
}
