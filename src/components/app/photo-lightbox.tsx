"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fullscreen photo viewer. Tap a photo (on a card or profile) to open it.
 * Swipe left/right (or use arrows) to browse all photos at full size.
 */
export function PhotoLightbox({
  photos,
  name,
  startIndex = 0,
  onClose,
}: {
  photos: string[];
  name: string;
  startIndex?: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(startIndex, photos.length - 1)));
  const dragRef = useRef<{ startX: number; moved: boolean } | null>(null);

  const clamp = (i: number) => Math.max(0, Math.min(photos.length - 1, i));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => clamp(i + 1));
      if (e.key === "ArrowLeft") setIdx((i) => clamp(i - 1));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length, onClose]);

  if (!photos.length) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col bg-black/95 backdrop-blur-sm"
      onPointerDown={(e) => {
        dragRef.current = { startX: e.clientX, moved: false };
      }}
      onPointerMove={(e) => {
        if (dragRef.current && Math.abs(e.clientX - dragRef.current.startX) > 8) {
          dragRef.current.moved = true;
        }
      }}
      onPointerUp={(e) => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d) return;
        const dx = e.clientX - d.startX;
        if (d.moved && Math.abs(dx) > 50) {
          setIdx((i) => clamp(dx < 0 ? i + 1 : i - 1));
        } else if (!d.moved) {
          onClose();
        }
      }}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-[13px] font-bold text-white/80">{name}</span>
        <span className="text-[12px] tabular-nums text-white/60">
          {idx + 1} / {photos.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo viewer"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2">
        {idx > 0 ? (
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              setIdx((i) => clamp(i - 1));
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        ) : null}

        <img
          key={idx}
          src={photos[idx]}
          alt={`${name} — photo ${idx + 1}`}
          draggable={false}
          className="animate-scale-in max-h-full max-w-full select-none rounded-xl object-contain"
        />

        {idx < photos.length - 1 ? (
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              setIdx((i) => clamp(i + 1));
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="flex justify-center gap-1.5 pb-6 pt-3">
        {photos.map((_, i) => (
          <span
            key={i}
            className={`h-[5px] rounded-full transition-all duration-300 ${i === idx ? "w-6 bg-white" : "w-2.5 bg-white/30"}`}
          />
        ))}
      </div>
    </div>
  );
}
