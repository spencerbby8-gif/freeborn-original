/**
 * Shown in place of the composer when a thread is visible but cannot be written to.
 *
 * Why a component rather than inline JSX: the read-only state is decided server-side
 * (`decideMatchAccess` with `send_message`, returned as `thread.canSend` from
 * `GET /api/chat/messages`) and the UI that consumes it is the one place a wrong assumption is
 * invisible — a disabled input that still says "Say something…" reads to a member like a broken
 * app, exactly like the delete-without-body bug this branch also fixed. Extracting it lets
 * `scripts/qa/dialog-check.mjs` mount and photograph the real thing instead of trusting a grep.
 *
 * It never says "connection". Nothing about this state is a network failure: the server
 * understood the request and declined it on purpose, so the copy explains what is still possible
 * (reading, reporting) rather than implying a retry might help.
 */
export function ReadOnlyThreadNotice({ notice, onReport }: { notice?: string | null; onReport?: () => void }) {
  return (
    <div
      data-readonly-thread=""
      className="mt-4 flex items-start gap-2.5 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-3.5"
    >
      <span
        aria-hidden
        className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/[0.14] text-[11px] font-black text-[var(--color-mist)]"
      >
        !
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] leading-[18px] text-[var(--color-mist)]">
          <span className="font-bold text-[var(--color-pearl)]">This conversation is read-only. </span>
          {notice ||
            "You can still read everything that was sent, and report it — but no new messages can be delivered here."}
        </p>
        {onReport ? (
          <button
            type="button"
            onClick={onReport}
            className="mt-2 rounded-full border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-[11.5px] font-bold text-[var(--color-pearl)] transition hover:bg-white/[0.09]"
          >
            Report this member
          </button>
        ) : null}
      </div>
    </div>
  );
}
