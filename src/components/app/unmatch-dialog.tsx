"use client";

/**
 * END-CONVERSATION CONFIRMATION — 2026-10-30.
 *
 * Why this exists: `/api/chat/unmatch` and `DELETE /api/chat/messages` both require
 * `destructive: true`, because both are irreversible. The API was hardened first and the sheet
 * was not built yet — so `profile-view` sent `destructive: true` unconditionally (a tap in the
 * overflow menu destroyed a shared history with no second look) while its "Delete conversation"
 * item sent nothing at all and therefore always failed with a 409 the UI reported as
 * "Try again in a moment." A confirmation that is auto-answered is not a confirmation, and a
 * confirmation the client cannot satisfy is just a broken button. This is the missing half.
 *
 * The copy is the DECIDED behaviour from docs/research/2026-10-30/UNMATCH-EVIDENCE.md, not
 * decoration. Every sentence here is something the code actually does:
 *   · "can't be undone"            — Hinge: "We are unable to restore a Match on our end"; we
 *                                    do not offer an undo for a severed thread with history;
 *   · "they keep a read-only copy" — Bumble: the recipient keeps the conversation "so you can
 *                                    still report them if their behavior was inappropriate";
 *   · "you can't match again"      — our own rule (a severed pair is permanently ended);
 *   · reason chips                 — Hinge asks for one, Bumble offers one, we make it
 *                                    optional and never a verdict about the other member;
 *   · the report nudge            — because ending a conversation is not moderation, and a
 *                                    member who was hurt needs to be told those are different.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { UNMATCH_REASONS, type UnmatchReason } from "@/lib/match-lifecycle";

export type EndConversationKind = "unmatch" | "delete";

const REASON_LABELS: Record<UnmatchReason, string> = {
  not_interested: "Not interested",
  met_someone: "I met someone",
  moved_off_app: "We matched elsewhere",
  inappropriate: "They were inappropriate",
  safety: "I don't feel safe",
  other: "Something else",
};

const TITLES: Record<EndConversationKind, string> = {
  unmatch: "End this conversation?",
  delete: "Delete every message?",
};

const CONFIRM_LABEL: Record<EndConversationKind, string> = {
  unmatch: "End conversation",
  delete: "Delete messages",
};

function bullets(kind: EndConversationKind, name: string): string[] {
  if (kind === "unmatch") {
    return [
      "This can’t be undone — not by you, and not by us.",
      `You’ll lose this conversation, including its photos and voice notes.`,
      `${name} keeps a read-only copy, so they can still show us what was sent to them.`,
      `You won’t be able to message ${name} or match with them again.`,
    ];
  }
  return [
    `Every message in this conversation is removed for both of you — including photos and voice notes.`,
    `You stay matched, so ${name} can still message you. To stop that, unmatch or block instead.`,
    "This can’t be undone.",
  ];
}

export function EndConversationDialog({
  kind,
  name,
  busy,
  onCancel,
  onConfirm,
  onReport,
}: {
  kind: EndConversationKind;
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: UnmatchReason | null) => void;
  /** Only rendered when the member says this was about behaviour, not preference. */
  onReport?: () => void;
}) {
  /* Keyed by the ACT, not a single slot that gets reset. A `kind`-change effect would have to
     remember to clear the previous choice (and `react-hooks/set-state-in-effect` rightly
     rejects that shape); keying it makes leakage structurally impossible — and a
     "delete every message" confirmation can only ever carry `null`, because no reason is ever
     stored for that kind. */
  const [reasons, setReasons] = useState<Partial<Record<"unmatch" | "delete", UnmatchReason | null>>>({});
  const reason = reasons[kind] ?? null;
  const setReason = (next: UnmatchReason | null) =>
    setReasons((prev) => ({ ...prev, [kind]: next }));
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const sheetRef = useRef<HTMLDivElement | null>(null);

  /* Escape closes; the destructive action is never the keyboard default here. */
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!busy) onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      /* Without this, Tab past the last control lands on the page BEHIND the sheet — visible
         still as a blurred backdrop — so a member can activate something they could not see,
         and Shift+Tab from the first control escapes backwards. The sheet is modal to a screen
         reader via aria-modal; this makes it modal to a keyboard too. Disabled controls are
         skipped because the whole sheet is disabled while a request is in flight, and wrapping
         onto an inert control would look like a focus trap that eats Tab. */
      const sheet = sheetRef.current;
      if (!sheet) return;
      const items = [
        ...sheet.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !sheet.contains(active))) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && (active === last || !sheet.contains(active))) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  const flaggedReason = reason === "inappropriate" || reason === "safety";

  return (
    <div
      className="fixed inset-0 z-[180] flex items-end justify-center bg-black/72 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fb-end-conv-title"
      onClick={() => !busy && onCancel()}
    >
      <div
        ref={sheetRef}
        className="animate-scale-in w-full max-w-[420px] rounded-[24px] border border-white/[0.09] bg-[#0c101d] p-5 shadow-[0_50px_120px_-24px_rgba(0,0,0,0.95)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="fb-end-conv-title" className="font-display text-[19px] font-semibold text-[var(--color-pearl)]">
          {TITLES[kind]}
        </p>

        <ul className="mt-3 space-y-2">
          {bullets(kind, name).map((b) => (
            <li key={b} className="flex gap-2 text-[12.5px] leading-[18px] text-[var(--color-mist)]">
              <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--color-ember-400)]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        {kind === "unmatch" ? (
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-mist)]">
              Reason — optional
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {UNMATCH_REASONS.map((r) => {
                const on = reason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() => setReason(on ? null : r)}
                    /* No focus utility here on purpose: `src/app/globals.css` sets
                       `:where(a, button, select, [role="button"]):focus-visible { outline: none; box-shadow: 0 0 0 2px … }`,
                       which owns outline-style app-wide, so `outline-2` on the chip only ever moved
                       the width and left the style `none`. The chips already carry a visible ring from
                       that rule — measured in Chromium on 2026-10-30 (gold box-shadow, where the
                       shared Button uses an ember outline; a cosmetic inconsistency in the design
                       layer, noted rather than silently "fixed" by overriding an app-wide focus rule
                       from inside one dialog). */
                    className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition ${
                      on
                        ? "border-[var(--color-ember-400)] bg-[var(--color-ember-500)]/18 text-[var(--color-pearl)]"
                        : "border-white/[0.1] bg-white/[0.04] text-[var(--color-mist)] hover:bg-white/[0.08]"
                    } disabled:opacity-50`}
                  >
                    {REASON_LABELS[r]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-[var(--color-mist)]/80">
              This never goes to {name}. It only helps the people who review reports.
            </p>
          </div>
        ) : null}

        {flaggedReason && onReport ? (
          <div className="mt-4 rounded-2xl border border-amber-400/35 bg-amber-500/10 p-3">
            <p className="text-[12px] leading-[17px] text-amber-100">
              Ending a conversation does not tell our moderators anything. If {name} hurt or
              scammed you, report them — that is the part that can act.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              disabled={busy}
              onClick={onReport}
            >
              Report {name} instead
            </Button>
          </div>
        ) : null}

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" size="md" className="flex-1" disabled={busy} onClick={onCancel} ref={cancelRef}>
            Keep it
          </Button>
          <Button
            variant="danger"
            size="md"
            className="flex-1"
            loading={busy}
            disabled={busy}
            onClick={() => onConfirm(reason)}
          >
            {CONFIRM_LABEL[kind]}
          </Button>
        </div>
      </div>
    </div>
  );
}
