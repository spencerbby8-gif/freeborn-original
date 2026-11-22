"use client";

/**
 * FREEBORN LIVE CAMERA — full capture experience.
 *  - Asks for camera permission on open, with clear guidance if blocked
 *  - Front ↔ back camera switching
 *  - STRAIGHT, unmirrored preview (what you capture is what you get)
 *  - Big 3:4 viewfinder — enough room for a proper selfie
 *  - One-tap capture → 4:5 center-cropped JPEG (matches the photo pipeline)
 */

import { PrototypeIcon } from "@/components/prototype/frame";
import { useModalFocus } from "@/components/prototype/modal-focus";
import { FreebornLoader } from "@/components/ui/freeborn-loader";
import { useCallback, useEffect, useRef, useState } from "react";

type CameraCaptureProps = {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
};

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  useModalFocus(true);
  const [attempt,setAttempt]=useState(0);
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
  }, [facing, stopStream, attempt]);

  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){stopStream();onClose();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose,stopStream]);

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
      setError("Couldn't capture that photo. Please try again.");
    }
  };

  return <div className="reference-photo-viewer reference-camera" role="dialog" aria-modal="true" aria-label="Camera"><header><button className="bare-icon" type="button" aria-label="Close camera" onClick={()=>{stopStream();onClose();}}><PrototypeIcon name="back"/></button><span>Your photo<small>Keep it natural. Keep it you.</small></span><button type="button" className="skip-btn" aria-label="Switch camera" onClick={()=>setFacing(f=>f==='user'?'environment':'user')}>{facing==='user'?'Front camera':'Back camera'} ↻</button></header><div className="reference-camera-body"><h1 className="display">A little more you.</h1><p>Good light, a clear view, no filter needed.</p><div className="reference-camera-frame"><video ref={videoRef} autoPlay playsInline muted/>{starting&&<div className="reference-camera-state"><FreebornLoader label="Starting your camera"/></div>}{error&&<div className="reference-camera-state"><p role="alert">{error}</p><button type="button" className="btn-grad" onClick={()=>setAttempt(i=>i+1)}>Try again</button></div>}</div><button type="button" className="btn-grad wide" onClick={capture} disabled={starting||Boolean(error)||capturing} aria-label="Take photo">{capturing?'Taking photo…':'Take photo'}</button><p className="fineprint center">Close to cancel. Your camera is used only for this photo.</p></div></div>;
}
