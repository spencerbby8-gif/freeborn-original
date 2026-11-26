"use client";

import { FreebornLoader } from "@/components/ui/freeborn-loader";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";
import { VerificationShield } from "@/components/prototype/verification-shield";
import { VerifyBadge } from "@/components/verify-badge";
import { PrototypeIcon } from "@/components/prototype/frame";
import { useModalFocus } from "@/components/prototype/modal-focus";
import { showToast } from "@/components/toast-host";
import type { FaceGate, FaceGateState } from "@/lib/face-gate";
import { POSES as SERVER_POSES, type Pose as ServerPose } from "@/lib/pose-pool";
import { browserObservations } from "@/lib/browser-integrity-client";

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
/**
 * Every pose is one a member can comfortably perform with a front camera at
 * arm's length. Guides are Freeborn's own uniform illustration set
 * (public/images/verify) — one consistent character, mature and calm.
 */
type Pose = ServerPose;

const POSES: Pose[] = [...SERVER_POSES];


const VERIFY_STEPS = ["Details", "Pose", "Camera", "Review"] as const;

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
  const openRef = useRef(open);
  useEffect(()=>{openRef.current=open;},[open]);
  useModalFocus(open);
  useEffect(()=>{window.dispatchEvent(new CustomEvent('freeborn:verification',{detail:{open}}));return()=>{window.dispatchEvent(new CustomEvent('freeborn:verification',{detail:{open:false}}));};},[open]);
  const [step, setStep] = useState<Step>("intro");
  const [status, setStatus] = useState<VerifyStatus>("none");
  const [selfie, setSelfie] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** Raw diagnostics shown when the camera refuses — facts, not guesses. */
  const [cameraFacts, setCameraFacts] = useState<string | null>(null);
  /** On-device face gate (MediaPipe): liveness + quality while the camera is up. */
  const gateRef = useRef<FaceGate | null>(null);
  const [gate, setGate] = useState<FaceGateState | null>(null);
  const [gateSkipped, setGateSkipped] = useState(false);
  const capturedGateRef = useRef<{state:FaceGateState|null;skipped:boolean}|null>(null);
  const challengeTriesRef = useRef(0);
  const [challengeTries, setChallengeTries] = useState(0);
  /* Server-issued freshness token. Requested when the camera opens so it is ~5 min
     fresh at submit time (its TTL); never re-used, the server consumes it on use. */
  const [livenessToken, setLivenessToken] = useState<string | null>(null);
  /** "server" = the pose was issued by /api/verification/challenge and is the one
   *  the engine will be told about. "local" = degraded mode, prompt chosen in-browser. */
  const [poseSource, setPoseSource] = useState<"server" | "local">("local");
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pose, setPose] = useState<Pose>(POSES[0]);
  const [rejectReason, setRejectReason] = useState<string | null>(null);

  /** Sample a different pose than the current one (local-mode fallback only). */
  const sampleNewPose = () => {
    /* A server-issued pose must NOT be re-rolled locally: the challenge row is already
       written for it, so re-sampling here would show a pose nothing will ever accept. */
    if (poseSource === "server") return;
    const others = POSES.filter((p) => p.label !== pose.label);
    setPose(others[Math.floor(Math.random() * others.length)]);
  };

  /** Issue (or re-issue) the pose challenge and show EXACTLY the pose the server
      bound to it.

      The pose the member sees and the pose the engine grades must be the same
      server row. Issuing the challenge only when the camera opened (the pre-fix
      behaviour) swapped the reference artwork between the pose screen and the
      capture screen, and then graded the selfie against a pose the member never
      saw — so even a perfect mimic read as a mismatch and the badge never
      granted. The challenge is now issued the moment the pose screen appears,
      re-issued on every retry (the route expires the previous live row), and the
      camera step never touches it. */
  const challengeInFlight = useRef(false);
  const [challengeLoading,setChallengeLoading]=useState(true);
  const challengeAbort=useRef<AbortController|null>(null);
  const submitAbort=useRef<AbortController|null>(null);
  const cameraStarting=useRef(false);
  const [cameraBusy,setCameraBusy]=useState(false);
  useEffect(()=>()=>{challengeAbort.current?.abort();submitAbort.current?.abort();},[]);
  const issueChallenge = useCallback(async (): Promise<void> => {
    if (challengeInFlight.current) return;
    challengeInFlight.current = true;
    setChallengeLoading(true);setLivenessToken(null);setPoseSource("local");
    const controller=new AbortController();challengeAbort.current=controller;
    try {
      const r = await fetch("/api/verification/challenge", {
        method: "POST",
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),
        headers: await authHeaders(),
      });
      if (!r.ok) return; /* keep whatever pose is on screen: if it came from a
        live challenge row, that row is still the one grading this attempt. */
      const j = (await r.json().catch(() => ({}))) as {
        livenessToken?: string;
        pose?: { label?: string; demo?: string };
      };
      if(controller.signal.aborted||!openRef.current)return;
      if (typeof j.livenessToken === "string") setLivenessToken(j.livenessToken);
      if (typeof j.pose?.label === "string" && j.pose.label.length > 0) {
        setPose((prev) => ({
          label: j.pose!.label as string,
          demo: typeof j.pose!.demo === "string" ? j.pose!.demo : prev.demo,
        }));
        setPoseSource("server");
      } else {
        /* Challenge write failed: keep the local sample so the member is never
           blocked by a control we failed to deliver — the attempt is still
           recorded with an explicit freshness verdict. */
        setPoseSource("local");
      }
    } catch {
      /* no challenge: the attempt degrades to unverified-freshness, not to an error */
    } finally {
      challengeInFlight.current = false;setChallengeLoading(false);
    }
  }, []);

  /* Other screens (Profile tab, Settings) can summon this flow. */
  useEffect(() => {
    const open = () => {setStep(status === "approved"?"approved":status === "pending"?"pending":"intro");setOpen(true);};
    window.addEventListener("freeborn:open-verify", open);
    return () => window.removeEventListener("freeborn:open-verify", open);
  }, [status]);

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
        if (!openRef.current) {stream.getTracks().forEach(t=>t.stop());return;}
        streamRef.current = stream;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setErrorMsg("Camera unavailable. Allow camera access and try again.");
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
    if(challengeLoading||challengeInFlight.current||cameraStarting.current)return;
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

    cameraStarting.current=true;setCameraBusy(true);
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
      if(!openRef.current){stream.getTracks().forEach(t=>t.stop());return;}
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
    } finally {cameraStarting.current=false;setCameraBusy(false);}
  };

  useEffect(() => {
    if (step === "pose") {
      /* The pose screen is where the challenge is born: what the member copies
         here is exactly what /api/verification/check will grade against. */
      void issueChallenge();
    }
    if (step === "camera") {
      void startCamera();
      /* The challenge was issued on the pose screen and must NOT be re-issued
         here: a second issue expires the row the member is currently mimicking
         and swaps the reference artwork mid-flow. Camera and gate failures stay
         non-fatal by design - with no token the server still records the attempt
         and returns an explicit freshness:"missing" verdict, it just does not
         grant the badge. A member must never be blocked by a control we failed
         to deliver. */
    } else {
      stopCamera();
    }

    return step === "camera" ? stopCamera : undefined;
  }, [step, startCamera, stopCamera, issueChallenge]);

  /* On-device face gate: load MediaPipe (dynamically, so it never weighs
     down the main bundle) when the camera opens, poll its verdict for the
     UI, and arm the blink challenge once the face is framed. No frames
     leave the device — only the verdict is submitted. */
  useEffect(() => {
    if (step !== "camera") return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("@/lib/face-gate");
        if (cancelled || !videoRef.current) return;
        const g = await mod.createFaceGate(videoRef.current);
        if (cancelled) {
          g.stop();
          return;
        }
        gateRef.current = g;
      } catch {
        if (!cancelled) setGate({ready:false,unavailable:true,faceCount:0,faceRatio:0,centered:false,framed:false,blinked:false,challenging:false});
        /* Explicitly unavailable is submitted as such; the server still decides. */
      }
    })();
    const iv = setInterval(() => {
      const g = gateRef.current;
      if (!g) return;
      const s = g.state();
      setGate((prev) =>
        prev &&
        prev.ready === s.ready &&
        prev.unavailable === s.unavailable &&
        prev.faceCount === s.faceCount &&
        prev.faceRatio === s.faceRatio &&
        prev.centered === s.centered &&
        prev.framed === s.framed &&
        prev.blinked === s.blinked &&
        prev.challenging === s.challenging
          ? prev
          : s
      );
      /* Arm the blink challenge once the face is framed (max 3 attempts). */
      if (
        s.ready &&
        !s.unavailable &&
        s.framed &&
        !s.blinked &&
        !s.challenging &&
        challengeTriesRef.current < 3 &&
        !armTimerRef.current
      ) {
        armTimerRef.current = setTimeout(() => {
          armTimerRef.current = null;
          challengeTriesRef.current += 1;
          setChallengeTries(challengeTriesRef.current);
          gateRef.current?.startChallenge();
        }, 1200);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearInterval(iv);
      if (armTimerRef.current) {
        clearTimeout(armTimerRef.current);
        armTimerRef.current = null;
      }
      gateRef.current?.stop();
      gateRef.current = null;
      setGate(null);
      setGateSkipped(false);
      challengeTriesRef.current = 0;
      setChallengeTries(0);
    };
  }, [step]);

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
    capturedGateRef.current = {state:gateRef.current?.state()??gate,skipped:gateSkipped};
    setSelfie(canvas.toDataURL("image/jpeg", 0.85));
    setStep("review");
  };

  /* --- Submit: thorough two-engine check (~10–20s), then the verdict ------- */

  /* Capture unlocks once the on-device gate passes (blink captured), is
     explicitly skipped, or is unavailable — the engines still review the
     selfie either way. */
  const captureAllowed = Boolean(gate && (gate.unavailable || gate.blinked || gateSkipped));

  /** The on-device verdict that travels with the request — evidence for the
      review, never a substitute for it. */
  const livenessEvidence = () => {
    const s = capturedGateRef.current?.state;
    if (!s || s.unavailable) return { gate: "unavailable", blink: false, singleFace: false };
    if (s.blinked) return { gate: "ok", blink: true, singleFace: s.faceCount === 1 };
    return {
      gate: capturedGateRef.current?.skipped ? "skipped" : "unavailable",
      blink: false,
      singleFace: s.faceCount === 1,
    };
  };

  const submit = async () => {
    if (!selfie||submitAbort.current) return;
    const controller=new AbortController();submitAbort.current=controller;
    setErrorMsg(null);
    setStep("checking");
    try {
      const res = await fetch("/api/verification/check", {
        method: "POST",
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(125000)]),
        headers: await authHeaders(),
        body: JSON.stringify({
          selfie,
          poseLabel: pose.label,
          liveness: livenessEvidence(),
          livenessToken: livenessToken ?? undefined,
          /* Four coarse facts the server compares against the headers its own edge
             received. Nothing here is stored about the device: only the names of the
             consistency rules that fired, and they can only ever add context for a
             human reviewer — never deny the badge (see src/lib/browser-integrity.ts).
             Omitting them is a legitimate choice: a check with one side missing
             reports nothing rather than guessing. */
          browser: browserObservations(),
        }),
      });
      if(controller.signal.aborted||!openRef.current)return;
      setLivenessToken(null); /* one-shot: a retry needs a brand-new challenge */
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = json.error ?? "Too many attempts. Take a breath and try later.";
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
          /* Truthful copy: "dual" only when the second engine actually ran —
             never claim two checks when one did. */
          body:
            json.engine === "dual"
              ? "Both independent checks passed. Your profile is confirmed."
              : "Your identity check passed. Your profile is confirmed.",
        });
        return;
      }
      if (res.ok && json.status === "rejected") {
        setStatus("rejected");
        setRejectReason(json.reason ?? "The check didn't pass. Please try again.");
        setSelfie(null);
        setStep("rejected");
        showToast({ tone: "error", title: "Verification didn't pass", body: json.reason ?? "Try again with a fresh selfie." });
        return;
      }
      if (!["review", "pending"].includes(json.status)) throw new Error("The server did not confirm a verification result. Check your status before submitting again.");
      // Only a confirmed review/pending response means the submission was received.
      setStatus("pending");
      setStep("pending");
      showToast({
        tone: "info",
        title: "Verification submitted",
        body: "Your selfie was received for review. No decision or completion time is promised.",
      });
    } catch (error) {
      if(controller.signal.aborted||!openRef.current)return;
      setLivenessToken(null);
      setErrorMsg(error instanceof Error&&error.name==="TimeoutError"?"The check took too long to respond. No result was confirmed. Check your verification status before starting a new attempt.":error instanceof Error?error.message:"We couldn’t confirm submission. Check your verification status before trying again.");
      setStep("error");
    } finally {if(submitAbort.current===controller)submitAbort.current=null;}
  };

  /* Pending changes only when a real server verdict arrives. No promised completion time. */
  useEffect(() => {
    if (step !== "pending") return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch("/api/verification", { headers: await authHeaders() });
        if (!res.ok) return;
        const json = await res.json();
        setStatus(json.status ?? "none");
        if (json.status === "approved") setStep("approved");
        else if (json.status === "rejected") {setRejectReason("The review did not pass. You can try again with a fresh selfie.");setStep("rejected");}
      } catch {
        /* keep polling */
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [step]);

  const close = () => {
    challengeAbort.current?.abort();submitAbort.current?.abort();submitAbort.current=null;
    stopCamera();
    dismissedAtRef.current = Date.now();
    openRef.current = false;
    capturedGateRef.current = null;
    setOpen(false);
    setStep("intro");
    setSelfie(null);
    setLivenessToken(null);
  };

  const verifyStepIdx =
    step === "intro" ? 0 : step === "pose" ? 1 : step === "camera" ? 2 : step === "review" ? 3 : -1;

  if (!open) return null;

  return (
    <section className="new-verification-layer verification-flow" role="dialog" aria-modal="true" aria-label="Verify your identity">
      <div className="verification-flow-scroll">
        <header className="verification-flow-header"><button type="button" className="bare-icon" aria-label="Close verification" onClick={close}><PrototypeIcon name="back"/></button>{step!=="intro"&&<span>{verifyStepIdx>=0?`${VERIFY_STEPS[Math.max(0,verifyStepIdx)]} · ${verifyStepIdx+1} of 4`:'Identity verification'}</span>}</header>
        {step === "intro" ? <>
          <div className="verify-hero"><span className="shield-ring"><VerificationShield/></span><h1 className="display verify-head">Show you’re<br/>really you.</h1><p className="verify-sub">A private liveness check helps people connect with confidence.</p></div>
          <div className="face-frame"><div className="face-glow"/><p className="face-hint">Center your face in the frame</p></div>
          <ul className="check-list">{['Private by design','Recent photo required','No public biometric data'].map(t=><li key={t}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#e9c37c"/><path d="M8 12l3 3 5-6" stroke="#241a10" strokeWidth="1.8" fill="none"/></svg>{t}</li>)}</ul>
          <details className="verification-disclosure"><summary>How your selfie is used</summary><p>No ID document or biometric template is required. The selfie itself is stored while a request is undecided, and after approval so later profile photos can be re-checked against the person who earned the seal. Rejected selfies are not stored. Withdrawing consent removes the seal and queues stored copies for cleanup.</p><p>Only a passing check grants a badge. When the checks cannot reach a decision, a received submission stays pending for review. No approval or completion time is promised. Verification never happens through links sent in DMs, texts or email.</p><a href="/app/settings/legal/privacy">Read the full Privacy Policy</a></details>
          <button type="button" className="btn-grad big" onClick={()=>setStep("pose")}>Start the selfie check</button><button type="button" className="verification-secondary" onClick={close}>Maybe later</button>
        </> : step === "pose" ? <div className="verification-step-content"><h1 className="display">Copy this pose.</h1><p>{poseSource==='server'?'This is the pose bound to your server-issued check. Copy it when you take your selfie.':'The server challenge is unavailable. This device-selected pose is advisory only; the server still decides whether your submission can be verified.'}</p><figure className="verification-pose"><img src={pose.demo} alt={`Example pose: ${pose.label}`}/><figcaption>{pose.label}</figcaption></figure>{errorMsg&&<div role="alert" className="verification-error"><p>{errorMsg}</p>{cameraFacts&&<small>{cameraFacts}</small>}</div>}<button type="button" className="btn-grad" disabled={challengeLoading||cameraBusy} onClick={()=>void continueToCamera()}>{challengeLoading?"Preparing your pose…":cameraBusy?"Opening camera…":"Continue to camera"}</button><button type="button" className="verification-secondary" onClick={()=>{if(poseSource==='server')void issueChallenge();else sampleNewPose();}}>Show me a different pose</button>{poseSource==='local'&&!challengeLoading&&<button type="button" className="verification-secondary" onClick={()=>void issueChallenge()}>Retry server check</button>}<p className="verification-footnote">Your camera opens only when you choose to continue.</p></div>
        : step === "camera" ? <div className="verification-step-content"><h1 className="display">Mimic the pose.</h1><p>Bright, even lighting. Face fully visible. No glasses or hats.</p><div className="verification-pose-reminder"><img src={pose.demo} alt=""/><span>{pose.label}</span></div><div className="verification-camera"><video ref={videoRef} playsInline muted/><span className="verification-face-guide"/></div><p className="verification-live-status" role="status">{!gate?'Preparing live checks…':gate.unavailable?'Live checks unavailable on this device. This is reported to the server, not treated as a pass.':!gate.ready?'Warming up live checks…':gate.faceCount!==1?gate.faceCount===0?'Center your face in the frame':'One face only. Step back a little':!gate.framed?'Move closer and center your face':gate.blinked?'Live blink captured':gateSkipped?'Live check skipped on this device':gate.challenging?'Blink now':'Face ready. Blink when prompted'}</p><button type="button" className="btn-grad" disabled={!captureAllowed} onClick={capture}>{captureAllowed?'Take selfie':'Blink when prompted to take the selfie'}</button>{challengeTries>=3&&gate&&!gate.blinked&&!gateSkipped&&<button type="button" className="verification-secondary" onClick={()=>setGateSkipped(true)}>Continue without the live check</button>}</div>
        : step === "review" && selfie ? <div className="verification-step-content"><h1 className="display">A clear view of you.</h1><p>Check your selfie before submitting it for a private identity review.</p><img className="verification-selfie" src={selfie} alt="Your verification selfie"/><button type="button" className="btn-grad" onClick={()=>void submit()}>Submit for review</button><button type="button" className="verification-secondary" onClick={()=>{setSelfie(null);setStep('pose');}}>Retake with a new pose</button></div>
        : step === "checking" ? <div className="verification-step-content verification-verdict" role="status"><FreebornLoader label="Checking your selfie"/><h1 className="display">Taking a closer look.</h1><p>Your identity check is running. Keep this screen open while we wait for the result.</p><p className="verification-footnote">No decision has been returned yet.</p></div>
        : step === "pending" ? <div className="verification-step-content verification-verdict"><span className="shield-ring"><VerificationShield/></span><h1 className="display">In review.</h1><p role="status">Your selfie was received and is pending review. Your badge is not granted while a decision is outstanding.</p><p>No completion time is promised. You can continue browsing and check back here.</p><button type="button" className="btn-grad" onClick={close}>Continue browsing</button></div>
        : step === "approved" ? <div className="verification-step-content verification-verdict"><VerifyBadge size={58}/><h1 className="display">You’re verified.</h1><p>Your identity check passed. The blue verification badge now appears on your profile.</p><button type="button" className="btn-grad" onClick={close}>Back to the room</button></div>
        : step === "rejected" ? <div className="verification-step-content verification-verdict"><span className="shield-ring"><VerificationShield/></span><h1 className="display">Let’s try again.</h1><p role="status">{rejectReason}</p><button type="button" className="btn-grad" onClick={()=>{setRejectReason(null);setStep('pose');}}>Try again with a new pose</button><button type="button" className="verification-secondary" onClick={close}>Maybe later</button></div>
        : step === "error" ? <div className="verification-step-content verification-verdict"><h1 className="display">A little interruption.</h1><p role="alert">{errorMsg??'Something went wrong. No verification result was confirmed.'}</p><button type="button" className="btn-grad" onClick={()=>{setErrorMsg(null);setStep('intro');}}>Try again</button><button type="button" className="verification-secondary" onClick={close}>Back to browsing</button></div> : null}
      </div>
    </section>
  );
}
