"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";
import { VerifyBadge } from "@/components/verify-badge";
import { showToast } from "@/components/toast-host";

type VerifyStatus = "none" | "pending" | "approved" | "rejected";
type Step =
  | "intro"
  | "pose"
  | "camera"
  | "review"
  | "checking"
  | "pending"
  | "approved"
  | "rejected"
  | "error";

const POPUP_DELAY_MS = 20_000; // one gentle invite, 20 seconds after entering the app
const INVITE_FLAG = "fb-verify-invite-shown"; // persisted: the invite happens ONCE per browser, never nags

/** Open the verification flow from anywhere (profile tab, settings, etc). */
export function openVerifyFlow() {
  window.dispatchEvent(new Event("freeborn:open-verify"));
}

/**
 * Pose-mimic verification, the exact pattern Bumble pioneered: the member is
 * shown one pose pulled from a library of real reference photos, then takes a
 * selfie mimicking it. Every retry samples a DIFFERENT pose.
 */
type Pose = { label: string; demo: string };
/**
 * Every pose is one a member can comfortably perform with a front camera at
 * arm's length. Guides are Freeborn's own uniform illustration set
 * (public/images/verify) — one consistent character, mature and calm.
 */
const POSES: Pose[] = [
  {
    label: "Show a peace sign beside your eye",
    demo: "/images/verify/pose-1.jpg",
  },
  {
    label: "Touch your cheek with your index finger",
    demo: "/images/verify/pose-2.jpg",
  },
  {
    label: "Place one hand under your chin",
    demo: "/images/verify/pose-3.jpg",
  },
  {
    label: "Touch your cheek and smile at the camera",
    demo: "/images/verify/pose-6.jpg",
  },
  {
    label: "Make an OK sign beside your chin",
    demo: "/images/verify/pose-7.jpg",
  },
  {
    label: "Raise an open palm beside your face",
    demo: "/images/verify/pose-8.jpg",
  },
  {
    label: "Give a thumbs-up next to your face",
    demo: "/images/verify/pose-9.jpg",
  },
  {
    label: "Place one hand over your heart",
    demo: "/images/verify/pose-10.jpg",
  },
];

async function authHeaders() {
  const token = await getAccessToken().catch(() => null);
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Freeborn's identity verification engine.
 *
 * New members get a popup 20 seconds after entering the app. The flow is a
 * live selfie check — the same pattern mainstream platforms use (guided
 * selfie vs. profile photos) — with strict server-side validation and a
 * review queue. Everything happens in-app: Freeborn never verifies via
 * links sent in DMs or email.
 */
export function VerifyGate() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("intro");
  const [status, setStatus] = useState<VerifyStatus>("none");
  const [selfie, setSelfie] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** Raw diagnostics shown when the camera refuses — facts, not guesses. */
  const [cameraFacts, setCameraFacts] = useState<string | null>(null);
  const [pose, setPose] = useState<Pose>(POSES[0]);
  const [rejectReason, setRejectReason] = useState<string | null>(null);

  /** Sample a different pose than the current one (every retry re-samples). */
  const sampleNewPose = () => {
    const others = POSES.filter((p) => p.label !== pose.label);
    setPose(others[Math.floor(Math.random() * others.length)]);
  };

  /* Other screens (Profile tab, Settings) can summon this flow. */
  useEffect(() => {
    const open = () => setOpen(true);
    window.addEventListener("freeborn:open-verify", open);
    return () => window.removeEventListener("freeborn:open-verify", open);
  }, []);

  /* Verification is an invitation, never a demand. The old repeating nag is
     gone on purpose — forced face-scanning is exactly what members revolted
     against on the other platforms. The button in Settings/Profile always
     works for whoever wants it. */
  const dismissedAtRef = useRef(0);
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/verification", { headers: await authHeaders() });
        if (!res.ok) return;
        const json = await res.json();
        setStatus(json.status ?? "none");
      } catch {
        /* offline — status stays as-is */
      }
    })();
  }, [open]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /* --- Popup trigger: 20s after entering the app, once per session ------- */

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        const res = await fetch("/api/verification", { headers: await authHeaders() });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        setStatus(json.status ?? "none");
        if (json.status === "none") {
          let alreadyShown = false;
          try {
            alreadyShown = window.localStorage.getItem(INVITE_FLAG) === "1";
          } catch {
            alreadyShown = false;
          }
          if (alreadyShown) return;
          timer = setTimeout(() => {
            try {
              window.localStorage.setItem(INVITE_FLAG, "1");
            } catch {
              /* ignore */
            }
            setOpen(true);
          }, POPUP_DELAY_MS);
        }
      } catch {
        /* signed out or offline — no popup */
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  /* --- Camera lifecycle ---------------------------------------------------- */

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      // Reuse the stream granted by the permission preflight when it's live,
      // so the member is never prompted twice and the view opens instantly.
      let stream = streamRef.current;
      if (!stream || !stream.getTracks().some((t) => t.readyState === "live")) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 } },
          audio: false,
        });
        streamRef.current = stream;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setErrorMsg("Camera unavailable — allow camera access and try again.");
      setStep("error");
    }
  }, []);

  /**
   * Permission-first camera entry. The permission prompt can ONLY fire from a
   * real user gesture, so it happens right here on this tap. When the browser
   * refuses WITHOUT prompting, there are exactly three causes — and we read
   * the actual permission state to tell the member which one it is:
   *   1. the site was blocked before (remembered per-address),
   *   2. the DEVICE's camera privacy switch is off for this browser,
   *   3. the camera is busy in another app.
   * The exact state is shown on screen — facts, not guesses.
   */
  const continueToCamera = async () => {
    setErrorMsg(null);
    setCameraFacts(null);

    if (!window.isSecureContext) {
      setErrorMsg("Camera access only works over a secure (https) connection. Open Freeborn via its https address and try again.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg("This browser doesn't support camera access. Update your browser or try Chrome/Edge/Safari.");
      return;
    }

    // Ask the browser what it actually knows about our camera permission.
    let permState = "unknown";
    try {
      const status = await navigator.permissions.query({ name: "camera" as PermissionName });
      permState = status.state;
    } catch {
      /* this browser can't report permission state — we'll learn from the error */
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setStep("camera");
    } catch (err) {
      const name = err instanceof Error ? err.name : "unknown";
      const facts = `permission: ${permState} · https: ${window.isSecureContext ? "yes" : "no"} · embedded: ${window.self !== window.top ? "yes" : "no"} · browser error: ${name}`;
      setCameraFacts(facts);

      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setErrorMsg("No camera was found on this device. Connect one (or switch devices) and try again.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setErrorMsg("Your camera is busy in another app (video call, camera app). Close it, then tap Continue to camera again.");
      } else if (name === "NotAllowedError" || name === "SecurityError") {
        if (window.self !== window.top) {
          setErrorMsg(
            "Embedded preview panels can't show camera prompts. Open Freeborn in its own browser tab (open-in-new-tab button, top right) and tap Continue to camera there."
          );
        } else if (permState === "denied") {
          setErrorMsg(
            "Camera was blocked for this site before, so the browser won't ask again until you reset it: tap the lock/camera icon in the address bar → Site settings → Camera → set to Allow, then tap Continue to camera. If it's still blocked, your DEVICE is blocking cameras: Windows → Settings → Privacy & security → Camera; Mac → System Settings → Privacy & Security → Camera; phone → Settings → app permissions → Camera."
          );
        } else {
          setErrorMsg(
            "The browser refused to even ask for permission. This almost always means your DEVICE's camera privacy switch is off for this browser: Windows → Settings → Privacy & security → Camera → turn on; Mac → System Settings → Privacy & Security → Camera → enable for your browser; phone → Settings → app permissions → Camera. Turn it on, then tap Continue to camera again."
          );
        }
      } else {
        setErrorMsg("The camera couldn't start. Close anything else using it, then try again.");
      }
    }
  };

  useEffect(() => {
    if (step === "camera") void startCamera();
    else stopCamera();
    return stopCamera;
  }, [step, startCamera, stopCamera]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const scale = Math.min(1, 900 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSelfie(canvas.toDataURL("image/jpeg", 0.85));
    setStep("review");
  };

  /* --- Submit: thorough two-engine check (~10–20s), then the verdict ------- */

  const [checkingProgress, setCheckingProgress] = useState(0);

  useEffect(() => {
    if (step !== "checking") return;
    setCheckingProgress(0);
    const started = Date.now();
    const iv = setInterval(() => {
      // Ease toward 94% across ~16 seconds; the verdict completes the bar.
      const pct = Math.min(94, ((Date.now() - started) / 16_000) * 100);
      setCheckingProgress(pct);
    }, 150);
    return () => clearInterval(iv);
  }, [step]);

  const submit = async () => {
    if (!selfie) return;
    setErrorMsg(null);
    setStep("checking");
    try {
      const res = await fetch("/api/verification/check", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ selfie, poseLabel: pose.label }),
      });
      setCheckingProgress(100);
      const json = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const msg = json.error ?? "Too many attempts — take a breath and try later.";
        setErrorMsg(msg);
        setStep("error");
        showToast({ tone: "error", title: "Verification paused", body: msg });
        return;
      }
      if (res.ok && json.status === "approved") {
        setStatus("approved");
        setStep("approved");
        showToast({
          tone: "success",
          title: "Identity verified",
          body: "Both checks passed — your profile is confirmed.",
        });
        return;
      }
      if (res.ok && json.status === "rejected") {
        setRejectReason(json.reason ?? "The check didn't pass — try again.");
        setSelfie(null);
        setStep("rejected");
        showToast({ tone: "error", title: "Verification didn't pass", body: json.reason ?? "Try again with a fresh selfie." });
        return;
      }
      // review / pending / fallback → the queue decides, we poll for it.
      setStatus("pending");
      setStep("pending");
      showToast({
        tone: "info",
        title: "Verification submitted",
        body: "Your selfie is being reviewed. We'll confirm it shortly.",
      });
    } catch {
      setStatus("pending");
      setStep("pending");
    }
  };

  /* While pending, poll the review queue. The preview room completes the
     check automatically after about a minute. */
  useEffect(() => {
    if (step !== "pending") return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch("/api/verification", { headers: await authHeaders() });
        if (!res.ok) return;
        const json = await res.json();
        setStatus(json.status ?? "none");
        if (json.status === "approved") {
          setStep("approved");
        }
      } catch {
        /* keep polling */
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [step]);

  const close = () => {
    stopCamera();
    dismissedAtRef.current = Date.now();
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Verify your identity"
    >
      <div className="animate-scale-in w-full max-w-[430px] overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0c101d] shadow-[0_60px_120px_-30px_rgba(0,0,0,0.9)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <VerifyBadge size={22} />
            <p className="text-[13px] font-black uppercase tracking-[0.14em] text-[var(--color-pearl)]">
              Identity verification
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close verification"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-[var(--color-mist)] transition hover:bg-white/[0.12] hover:text-[var(--color-pearl)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6">
          {step === "intro" ? (
            <>
              <h2 className="font-display text-[24px] font-semibold leading-tight text-[var(--color-pearl)]">
                Verify your identity
              </h2>
              <p className="mt-2.5 text-[13.5px] leading-6 text-[var(--color-mist)]">
                Freeborn keeps the room safe with a quick live selfie check — the same
                method mainstream dating platforms use to keep out bots and impostors.
              </p>
              <ul className="mt-5 space-y-3">
                {[
                  ["Live selfie only", "Your camera confirms you're a real person. No documents needed to start."],
                  ["Nothing stored but the verdict", "No ID, no documents, no biometric templates — a quick pose selfie proves you're you, and only the result is kept."],
                  ["In-app, always", "Freeborn never verifies through links in DMs, texts, or email — those are scams."],
                  ["Reviewed before it counts", "Every submission is checked before your profile carries the confirmation. Usually within minutes."],
                ].map(([title, body]) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-teal-500)]/15 text-[var(--color-teal-300)]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M4.5 12.5l5 5L19.5 7" />
                      </svg>
                    </span>
                    <div>
                      <p className="text-[13px] font-black text-[var(--color-pearl)]">{title}</p>
                      <p className="mt-0.5 text-[12.5px] leading-5 text-[var(--color-mist)]">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  sampleNewPose();
                  setStep("pose");
                }}
                className="btn-ember btn-shine relative mt-6 w-full overflow-hidden rounded-full py-3.5 text-[14px] font-black text-white"
              >
                Start the selfie check
              </button>
              <button
                type="button"
                onClick={close}
                className="mt-2.5 w-full rounded-full py-3 text-[13px] font-bold text-[var(--color-ash)] transition hover:text-[var(--color-pearl)]"
              >
                Maybe later
              </button>
            </>
          ) : null}

          {step === "pose" ? (
            <>
              <h2 className="font-display text-[20px] font-semibold text-[var(--color-pearl)]">
                Copy this pose
              </h2>
              <p className="mt-1.5 text-[13px] leading-5 text-[var(--color-mist)]">
                Copy this exact pose in your selfie. It's how Freeborn proves a real,
                live person stands behind every confirmed profile.
              </p>
              <div className="relative mt-4 overflow-hidden rounded-2xl border border-[var(--color-gold-500)]/30">
                <img
                  src={pose.demo}
                  alt={`Example pose: ${pose.label}`}
                  className="aspect-[3/3.4] w-full object-cover"
                />
                <span className="absolute inset-x-3 bottom-3 rounded-xl bg-black/70 px-3.5 py-2.5 text-[13px] font-black text-white backdrop-blur-sm">
                  {pose.label}
                </span>
              </div>
              {errorMsg ? (
                <div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-3.5 py-2.5">
                  <p className="text-[12.5px] font-bold leading-4 text-red-300">{errorMsg}</p>
                  {cameraFacts ? (
                    <p className="mt-2 border-t border-red-400/20 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-red-300/70">
                      {cameraFacts}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void continueToCamera()}
                className="btn-ember btn-shine relative mt-5 w-full overflow-hidden rounded-full py-3.5 text-[14px] font-black text-white"
              >
                Continue to camera
              </button>
              <button
                type="button"
                onClick={sampleNewPose}
                className="mt-2.5 w-full rounded-full py-3 text-[13px] font-bold text-[var(--color-ash)] transition hover:text-[var(--color-pearl)]"
              >
                Show me a different pose
              </button>
            </>
          ) : null}

          {step === "camera" ? (
            <>
              <h2 className="font-display text-[20px] font-semibold text-[var(--color-pearl)]">
                Mimic the pose
              </h2>
              <p className="mt-1.5 text-[13px] leading-5 text-[var(--color-mist)]">
                Bright, even lighting · face fully visible · no glasses or hats. The
                preview behaves like your phone's selfie camera — the photo you submit
                is captured true-to-life.
              </p>
              <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-[var(--color-gold-500)]/30 bg-[var(--color-gold-500)]/[0.07] px-3 py-2.5">
                <img
                  src={pose.demo}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg border border-[var(--color-gold-500)]/40 object-cover"
                />
                <p className="text-[12.5px] font-bold leading-4 text-[var(--color-gold-300)]">
                  Pose to copy: {pose.label}
                </p>
              </div>
              <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
                {/* Mirrored like every selfie camera you've ever used — the
                    submitted photo itself is captured true-to-life. */}
                <video ref={videoRef} playsInline muted className="aspect-[4/5] w-full -scale-x-100 object-cover" />
                <span className="pointer-events-none absolute inset-6 rounded-full border-2 border-dashed border-white/30" />
              </div>
              <button
                type="button"
                onClick={capture}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--gradient-ember-warm)] py-3.5 text-[14px] font-black text-white shadow-[var(--shadow-primary-btn)] transition active:scale-[0.98]"
              >
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white" />
                Take selfie
              </button>
            </>
          ) : null}

          {step === "review" && selfie ? (
            <>
              <h2 className="font-display text-[20px] font-semibold text-[var(--color-pearl)]">
                Confirm your selfie
              </h2>
              <p className="mt-1.5 text-[13px] leading-5 text-[var(--color-mist)]">
                Make sure your face is clear and unobstructed before submitting.
              </p>
              <img
                src={selfie}
                alt="Your verification selfie"
                className="mt-4 aspect-[4/5] w-full rounded-2xl border border-white/10 object-cover"
              />
              <button
                type="button"
                onClick={() => void submit()}
                className="mt-5 w-full rounded-full bg-[var(--gradient-ember-warm)] py-3.5 text-[14px] font-black text-white shadow-[var(--shadow-primary-btn)] transition active:scale-[0.98]"
              >
                Submit for review
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelfie(null);
                  sampleNewPose(); // every retry samples a fresh pose
                  setStep("pose");
                }}
                className="mt-2.5 w-full rounded-full py-3 text-[13px] font-bold text-[var(--color-ash)] transition hover:text-[var(--color-pearl)]"
              >
                Retake with a new pose
              </button>
            </>
          ) : null}

          {step === "checking" ? (
            <div className="py-8">
              <div className="flex flex-col items-center">
                <span className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
              </div>
              <h2 className="mt-5 text-center font-display text-[20px] font-semibold text-[var(--color-pearl)]">
                Freeborn is verifying your identity
              </h2>
              <p className="mx-auto mt-2 max-w-[34ch] text-center text-[12.5px] leading-5 text-[var(--color-mist)]">
                Your selfie is passing through two independent checks. Thorough
                verification takes about 10–20 seconds — hold tight.
              </p>
              <div className="mx-auto mt-5 h-2 w-full max-w-[300px] overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-[var(--gradient-ember-warm)] transition-[width] duration-200 ease-linear"
                  style={{ width: `${checkingProgress}%` }}
                />
              </div>
              <p className="mt-2.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-ash)]">
                Running the checks…
              </p>
            </div>
          ) : null}

          {step === "rejected" ? (
            <div className="py-4 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-red-400/30 bg-red-500/10 text-red-300">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9 9l6 6M15 9l-6 6" />
                </svg>
              </span>
              <h2 className="mt-4 font-display text-[20px] font-semibold text-[var(--color-pearl)]">
                Not quite — let's retry
              </h2>
              <p className="mx-auto mt-2 max-w-[36ch] text-[13px] leading-6 text-[var(--color-mist)]">
                {rejectReason}
              </p>
              <button
                type="button"
                onClick={() => {
                  setRejectReason(null);
                  sampleNewPose(); // fresh pose on every retry, exactly like Bumble
                  setStep("pose");
                }}
                className="btn-ember btn-shine relative mt-6 w-full overflow-hidden rounded-full py-3.5 text-[14px] font-black text-white"
              >
                Try again with a new pose
              </button>
              <button
                type="button"
                onClick={close}
                className="mt-2.5 w-full rounded-full py-3 text-[13px] font-bold text-[var(--color-ash)] transition hover:text-[var(--color-pearl)]"
              >
                Maybe later
              </button>
            </div>
          ) : null}

          {step === "pending" ? (
            <div className="py-4 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/10">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-300)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </span>
              <h2 className="mt-4 font-display text-[20px] font-semibold text-[var(--color-pearl)]">
                Freeborn is verifying your identity
              </h2>
              <p className="mx-auto mt-2 max-w-[36ch] text-[13px] leading-6 text-[var(--color-mist)]">
                Your selfie has been submitted. The check usually takes a few minutes —
                keep this page open or come back shortly. You'll be confirmed the moment
                it's done.
              </p>
              <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                <span className="rec-pulse h-2.5 w-2.5 rounded-full bg-[var(--color-gold-500)]" />
                <p className="text-[12px] font-bold text-[var(--color-sand)]">
                  Waiting for confirmation…
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="mt-4 w-full rounded-full py-3 text-[13px] font-bold text-[var(--color-ash)] transition hover:text-[var(--color-pearl)]"
              >
                Continue browsing
              </button>
            </div>
          ) : null}

          {step === "approved" ? (
            <div className="py-4 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-teal-500)]/15">
                <VerifyBadge size={34} />
              </span>
              <h2 className="mt-4 font-display text-[22px] font-semibold text-[var(--color-pearl)]">
                You're verified.
              </h2>
              <p className="mx-auto mt-2 max-w-[34ch] text-[13px] leading-6 text-[var(--color-mist)]">
                The teal seal now sits on your profile so other members know they're
                talking to the real you.
              </p>
              <button
                type="button"
                onClick={close}
                className="btn-ember btn-shine relative mt-6 w-full overflow-hidden rounded-full py-3.5 text-[14px] font-black text-white"
              >
                Back to the room
              </button>
            </div>
          ) : null}

          {step === "error" ? (
            <div className="py-4 text-center">
              <p className="text-[13.5px] font-bold text-red-300">{errorMsg ?? "Something went wrong."}</p>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setStep("intro");
                }}
                className="mt-5 w-full rounded-full border border-white/10 bg-white/[0.05] py-3 text-[13px] font-bold text-[var(--color-pearl)] transition hover:bg-white/[0.09]"
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
