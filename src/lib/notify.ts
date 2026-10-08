/**
 * FREEBORN SOUND ENGINE — generated in-browser, zero assets, instant.
 * A distinct two-tone ember chime for notifications, and a warm repeating
 * ring for incoming calls.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, freq: number, at: number, dur: number, gainPeak = 0.16) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(gainPeak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** The Freeborn notification chime — short, warm, unmistakable. */
export function playChime() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  tone(ac, 880, t, 0.14);
  tone(ac, 1174.66, t + 0.11, 0.22); // D6 — the lift
  tone(ac, 1567.98, t + 0.24, 0.3, 0.1); // G6 shimmer
}

/* --- Incoming-call ring loop ---------------------------------------------- */

let ringTimer: ReturnType<typeof setInterval> | null = null;

export function startRingtone() {
  stopRingtone();
  const burst = () => {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    tone(ac, 659.25, t, 0.18, 0.14);
    tone(ac, 880, t + 0.2, 0.18, 0.14);
    tone(ac, 659.25, t + 0.55, 0.18, 0.12);
    tone(ac, 880, t + 0.75, 0.18, 0.12);
  };
  burst();
  ringTimer = setInterval(burst, 2000);
}

export function stopRingtone() {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
}

/** Ask the browser for permission to deliver real notifications. */
export async function requestNotifyPermission(): Promise<boolean> {
  try {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

/** Fire a native browser notification (when permitted). */
export function pushBrowserNotification(title: string, body: string, url?: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification(title, { body, icon: "/images/verify/pose-5.jpg" });
    if (url) n.onclick = () => window.focus() ?? window.location.assign(url);
  } catch {
    /* some mobile browsers block the constructor — banner still shows */
  }
}
