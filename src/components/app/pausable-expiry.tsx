"use client";

import { useEffect, useRef } from "react";

/** Visible-time budget for a transient item. Pausing never extends its budget
 * except by the time the urgent call screen actually prevents it being seen. */
export function PausableExpiry({ active, milliseconds, onExpire }: { active: boolean; milliseconds: number; onExpire: () => void }) {
  const remaining = useRef(milliseconds);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const timer = window.setTimeout(onExpire, Math.max(0, remaining.current));
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - start));
    };
  }, [active, onExpire]);
  return null;
}
