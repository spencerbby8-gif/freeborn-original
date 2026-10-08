"use client";

/**
 * FREEBORN LIVE CAMERA — full capture experience.
 *  - Asks for camera permission on open, with clear guidance if blocked
 *  - Front ↔ back camera switching
 *  - STRAIGHT, unmirrored preview (what you capture is what you get)
 *  - Big 3:4 viewfinder — enough room for a proper selfie
 *  - One-tap capture → 4:5 center-cropped JPEG (matches the photo pipeline)
 */

import { useCallback, useEffect, useRef, useState } from "react";

type CameraCaptureProps = {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
};

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [capturing, setCapturing] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStarting(true);
    setError(null);

    (async () => {
      stopStream();
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error("unsupported"), { name: "NotFoundError" });
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStarting(false);
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : "";
        setStarting(false);
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera access is blocked. Tap the camera/lock icon in your browser's address bar, allow camera access for Freeborn, then tap Try again."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : "The camera couldn't start. Close anything else using it and try again."
        );
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facing, stopStream]);

  /* Straight, unmirrored capture: 4:5 center crop, max 1080px wide. */
  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || capturing) return;
    setCapturing(true);
    try {
      const targetRatio = 4 / 5;
      let sx = 0;
      let sy = 0;
      let sw = video.videoWidth;
      let sh = video.videoHeight;
      if (video.videoWidth / video.videoHeight > targetRatio) {
        sw = video.videoHeight * targetRatio;
        sx = (video.videoWidth - sw) / 2;
      } else {
        sh = video.videoWidth / targetRatio;
        sy = (video.videoHeight - sh) / 2;
      }
      const outW = Math.max(1, Math.round(Math.min(1080, sw)));
      const outH = Math.max(1, Math.round(outW / targetRatio));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      stopStream();
      onCapture(dataUrl);
    } catch {
      setCapturing(false);
      setError("Couldn't capture that photo — try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-[320] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Camera">
      {/* Top bar: back + flip */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => {
            stopStream();
            onClose();
          }}
          aria-label="Close camera"
          className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-white/[0.12]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          aria-label="Switch camera"
          title="Switch front/back camera"
          className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-white/[0.12]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 01-15.5 6.2M3 12a9 9 0 0115.5-6.2" />
            <path d="M21 3v6h-6M3 21v-6h6" />
          </svg>
          {facing === "user" ? "Front" : "Back"}
        </button>
      </div>

      {/* Viewfinder — straight, never mirrored */}
      <div className="mx-auto flex w-full max-w-[540px] flex-1 items-center px-3">
        <div className="relative w-full overflow-hidden rounded-[28px] border border-white/15 bg-[#0a0a0a]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-[3/4] w-full object-cover"
          />
          {starting ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
              <span className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
              <p className="text-[12px] font-bold text-white/80">Starting camera…</p>
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center">
              <p className="text-[13px] leading-6 text-white/90">{error}</p>
              <button
                type="button"
                onClick={() => setFacing((f) => f)}
                className="rounded-full bg-[var(--gradient-ember-warm)] px-6 py-2.5 text-[13px] font-black text-white transition active:scale-95"
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom: the shutter */}
      <div className="flex items-center justify-center gap-8 py-6">
        <span className="w-24 text-center text-[10.5px] font-bold uppercase tracking-wider text-white/50">
          Straight view
        </span>
        <button
          type="button"
          onClick={capture}
          disabled={starting || Boolean(error) || capturing}
          aria-label="Take photo"
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/90 transition active:scale-90 disabled:opacity-40"
        >
          <span className="h-16 w-16 rounded-full bg-white" />
        </button>
        <span className="w-24 text-center text-[10.5px] font-bold uppercase tracking-wider text-white/50">
          {facing === "user" ? "Selfie cam" : "Rear cam"}
        </span>
      </div>
    </div>
  );
}
