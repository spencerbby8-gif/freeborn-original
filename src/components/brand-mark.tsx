"use client";

import { useId } from "react";

/** Freeborn flame: warm metal disc, dark flame and a small inner spark.
 * Shared by landing, auth and the member frame; no raster legacy monogram. */
export function BrandMark({ size = 38 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className="freeborn-brand-mark">
    <defs><linearGradient id={`brand-${id}`} x1="5" y1="6" x2="43" y2="44" gradientUnits="userSpaceOnUse"><stop stopColor="#fff1d0"/><stop offset=".5" stopColor="#edc47d"/><stop offset="1" stopColor="#e8a18d"/></linearGradient></defs>
    <circle cx="24" cy="24" r="22.5" fill={`url(#brand-${id})`} stroke="#ffedc7" strokeOpacity=".6"/>
    <path d="M25.7 10.5c.8 6.9-5.2 8.5-4.2 13.8 1.2-.3 2.6-1.8 2.9-3.8 4 3 7.1 6.5 6.3 11.1-.5 3.7-3.4 6.3-7.2 6.3-4.7 0-8.1-3.5-8.1-8.1 0-3.1 1.8-5.8 4-8.1-.4 3.2.4 4.9 1.6 5.6-2.5-8.1 4.5-10.7 4.7-16.8Z" stroke="#302118" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M25.3 28.4c.4 2.2-1.8 2.8-1.8 4.4" stroke="#302118" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>;
}
