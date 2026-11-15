/**
 * Whether a call screen (incoming ring or live call) is currently on top of the
 * member's view.
 *
 * WHY THIS EXISTS (owner report B11, "the call never reaches the other user"):
 * the notification-permission ask in notification-center.tsx renders at
 * `fixed bottom-24 z-[310]`, while the call overlay is `fixed inset-0 z-[200]` -
 * so the ask card paints directly on top of the incoming call's Answer/Decline
 * buttons and a live call's speaker/mute/end controls. Captured in
 * evidence/taskboard-2026-11-14/b11-callee-ringing.png: the member sees a
 * permission card where their thumbs need to be.
 *
 * A permission prompt is never urgent; a ringing call is. CallOverlay reports
 * its presence here and the ask stands down until the call is over.
 */
let callUiActive = false;
const subscribers = new Set<(active: boolean) => void>();

export function setCallUiActive(active: boolean): void {
  if (callUiActive === active) return;
  callUiActive = active;
  subscribers.forEach((fn) => fn(active));
}

export function isCallUiActive(): boolean {
  return callUiActive;
}

/** Returns an unsubscribe function. Does not fire immediately. */
export function subscribeCallUiActive(fn: (active: boolean) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
