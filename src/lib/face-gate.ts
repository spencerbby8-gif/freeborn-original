"use client";

/**
 * FREEBORN FACE GATE — on-device liveness + quality checks.
 *
 * MediaPipe (Apache 2.0): one-face detection, face size/centering, and a
 * challenge-response blink check (Eye Aspect Ratio, Soukupová & Čech 2016).
 * No frames leave the device — only the verdict travels with the
 * verification request. The gate is evidence UNDER the dual-engine review,
 * never a substitute for it.
 */

import { FilesetResolver, FaceLandmarker, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";

export type FaceGateState = {
  /** Model loaded and the frame loop is running. */
  ready: boolean;
  /** Model could not load — callers should fall back gracefully. */
  unavailable: boolean;
  faceCount: number;
  /** Face bounding-box area as a fraction of the frame (0–1). */
  faceRatio: number;
  /** Face horizontally centered in the frame. */
  centered: boolean;
  /** Face is framed well enough for the challenge (one face, big, centered). */
  framed: boolean;
  /** A blink was captured during the current challenge. */
  blinked: boolean;
  /** A blink challenge is currently active. */
  challenging: boolean;
};

export type FaceGate = {
  state: () => FaceGateState;
  /** Arm a blink challenge (6 s window; idempotent while active). */
  startChallenge: () => void;
  stop: () => void;
};

/* Eye Aspect Ratio landmark indices (MediaPipe's 478-point topology). */
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [263, 387, 385, 362, 380, 373];
const EAR_THRESHOLD = 0.2;
const EAR_OPEN_MARGIN = 0.05;
const BLINK_FRAMES = 2;
const CHALLENGE_MS = 6_000;
const TARGET_FPS = 10;
/** Face must fill at least this fraction of the frame to count as framed. */
const MIN_FACE_RATIO = 0.06;

type Pt = { x: number; y: number };

function ear(landmarks: Pt[], idx: number[]): number {
  const p = idx.map((i) => landmarks[i]);
  if (p.some((q) => !q)) return 1;
  const vert =
    Math.hypot(p[1].x - p[5].x, p[1].y - p[5].y) +
    Math.hypot(p[2].x - p[4].x, p[2].y - p[4].y);
  const horiz = Math.hypot(p[0].x - p[3].x, p[0].y - p[3].y);
  return horiz === 0 ? 1 : vert / (2 * horiz);
}

export async function createFaceGate(video: HTMLVideoElement): Promise<FaceGate> {
  let landmarker: FaceLandmarker | null = null;
  let unavailable = false;
  try {
    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm"
    );
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 2,
    });
  } catch {
    unavailable = true;
  }

  let raf = 0;
  let lastTick = 0;
  let faceCount = 0;
  let faceRatio = 0;
  let centered = false;
  let challenging = false;
  let blinked = false;
  let closedFrames = 0;
  let sawOpen = false;
  let challengeTimer: ReturnType<typeof setTimeout> | null = null;

  const tick = (t: number) => {
    if (unavailable || !landmarker) return;
    if (t - lastTick >= 1000 / TARGET_FPS) {
      lastTick = t;
      try {
        if (video.videoWidth > 0) {
          const res: FaceLandmarkerResult = landmarker.detectForVideo(video, t);
          const faces = res.faceLandmarks ?? [];
          faceCount = faces.length;
          if (faces.length === 1) {
            const lm = faces[0];
            const xs = lm.map((p) => p.x);
            const ys = lm.map((p) => p.y);
            const w = Math.max(...xs) - Math.min(...xs);
            const h = Math.max(...ys) - Math.min(...ys);
            faceRatio = w * h;
            const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
            centered = cx > 0.22 && cx < 0.78;
            if (challenging && !blinked) {
              const avg = (ear(lm, LEFT_EYE) + ear(lm, RIGHT_EYE)) / 2;
              if (avg > EAR_THRESHOLD + EAR_OPEN_MARGIN) {
                sawOpen = true;
                closedFrames = 0;
              } else if (sawOpen) {
                closedFrames += 1;
                if (closedFrames >= BLINK_FRAMES) {
                  blinked = true;
                  closedFrames = 0;
                }
              }
            }
          } else {
            faceRatio = 0;
            centered = false;
          }
        }
      } catch {
        /* frame not ready — the next tick retries */
      }
    }
    raf = requestAnimationFrame(tick);
  };

  if (!unavailable) raf = requestAnimationFrame(tick);

  return {
    state: () => ({
      ready: !unavailable,
      unavailable,
      faceCount,
      faceRatio,
      centered,
      framed: faceCount === 1 && faceRatio >= MIN_FACE_RATIO && centered,
      blinked,
      challenging,
    }),
    startChallenge: () => {
      if (unavailable || challenging) return;
      challenging = true;
      blinked = false;
      closedFrames = 0;
      sawOpen = false;
      if (challengeTimer) clearTimeout(challengeTimer);
      challengeTimer = setTimeout(() => {
        challenging = false;
        challengeTimer = null;
      }, CHALLENGE_MS);
    },
    stop: () => {
      cancelAnimationFrame(raf);
      if (challengeTimer) clearTimeout(challengeTimer);
      try {
        landmarker?.close();
      } catch {
        /* already closed */
      }
      landmarker = null;
    },
  };
}
