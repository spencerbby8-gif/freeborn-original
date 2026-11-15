/**
 * Whether a call screen (incoming ring or live call) is currently on top of the
 * member's view.
 *
 * WHY THIS EXISTS (owner report B11, "the call never reaches the other user"):
 * the notification-permission ask in notification-center.tsx renders at
 * `fixed bottom-24 z-[310]`, while call screens sit below it - the incoming ring
 * is plain JSX in call-listener.tsx and CallOverlay is `fixed inset-0 z-[200]` -
 * so the ask card paints directly on top of the incoming call's Answer/Decline
 * buttons and a live call's speaker/mute/end controls. Measured live and
 * captured in evidence/taskboard-2026-11-14/b11-callee-ringing.png: the member
 * sees a permission card where their thumbs need to be.
 *
 * A permission prompt is never urgent; a ringing call is. Each call screen takes
 * a hold while it is up and the ask stands down until the last hold is released.
 *
 * A refcount rather than a boolean because TWO components own call screens -
 * CallListener (the incoming ring, and the callee's live overlay) and ChatView
 * (the caller's live overlay) - and a plain boolean would let one owner's
 * cleanup clobber the other's hold depending on effect order.
 */
let holders = 0;
const subscribers = new Set<(active: boolean) => void>();

function emit(): void {
  const active = holders > 0;
  subscribers.forEach((fn) => fn(active));
}

/** Takes a hold; returns the release function. Safe to call once per effect. */
export function holdCallUi(): () => void {
  holders += 1;
  if (holders === 1) emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) emit();
  };
}

export function isCallUiActive(): boolean {
  return holders > 0;
}

/** Returns an unsubscribe function. Does not fire immediately. */
export function subscribeCallUiActive(fn: (active: boolean) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
