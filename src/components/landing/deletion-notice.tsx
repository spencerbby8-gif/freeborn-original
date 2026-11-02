"use client";

import { useEffect, useState } from "react";

type NoticeState = "idle" | "pending" | "completed" | "failed";

/**
 * Honest post-deletion notice. A 202 deletion is NOT a completed deletion: the
 * banner stays pending until the durable cleanup worker marks every owned
 * storage prefix complete. The random token travels in the URL fragment, not the
 * query string, so it is not sent to the server or written to access logs.
 */
export function DeletionNotice() {
  const [state, setState] = useState<NoticeState>("idle");

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let attempts = 0;

    const poll = async (token: string) => {
      attempts += 1;
      try {
        const res = await fetch(`/api/account/deletion-status?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as { status?: string };
          if (!cancelled && json.status === "completed") setState("completed");
          else if (!cancelled && json.status === "cleanup_failed") setState("failed");
        }
      } catch {
        /* keep polling; never upgrade to completed on a network error */
      }
      if (!cancelled && attempts < 24) timer = window.setTimeout(() => void poll(token), 5000);
    };

    timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const status = params.get("status");
      if (status === "account-deleted") {
        setState("completed");
        return;
      }
      if (status !== "account-deletion-pending") return;
      setState("pending");
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const token = hash.get("deletion");
      if (token) timer = window.setTimeout(() => void poll(token), 1500);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (state === "idle") return null;
  const copy =
    state === "completed"
      ? "Your account and data have been permanently deleted."
      : state === "failed"
        ? "Your sign-in and profile data were removed, but file cleanup needs attention. Please contact support."
        : "Your sign-in and profile data were removed. File cleanup is still in progress.";
  const tone =
    state === "completed"
      ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/[0.08] text-[var(--color-ink)]"
      : state === "failed"
        ? "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/[0.08] text-[var(--color-ink)]"
        : "border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink)]";

  return (
    <div role="status" aria-live="polite" className={`border-b px-4 py-3 text-center text-[13px] ${tone}`}>
      {copy}
    </div>
  );
}
