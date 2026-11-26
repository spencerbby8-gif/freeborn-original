"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { PrototypeIcon } from "./frame";

const SEEN_KEY = "fb-discovery-filter-tip-v1";

/** A small first-visit hint on the filters flame, never on the notification heart. */
export function DiscoveryFilterButton() {
  const [visible, setVisible] = useState(false);
  const textId = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const dismiss = () => {
    setVisible(false);
    try { sessionStorage.setItem(SEEN_KEY, "seen"); } catch { /* Optional UI hint only. */ }
  };
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try { setVisible(sessionStorage.getItem(SEEN_KEY) !== "seen"); }
      catch { setVisible(true); }
    });
    return () => { cancelled = true; };
  }, []);
  const onEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && visible) { event.stopPropagation(); dismiss(); opener.current?.focus(); }
  };
  return <>
    <span className="discovery-filter-anchor" onKeyDown={onEscape}>
      <Button unstyled ref={opener} className="chip chip-flame" aria-label="Discovery filters" title="Discovery filters — choose who you see" aria-describedby={visible ? textId : undefined} onClick={() => {
        dismiss();
        window.dispatchEvent(new Event("freeborn:open-filters"));
      }}><PrototypeIcon name="flame"/></Button>
    </span>
    {visible && <span className="discovery-filter-tip" role="note" aria-label="Filter button tip" onKeyDown={onEscape}>
      <span id={textId}><b>Looking for filters?</b>Tap this flame to choose who you see — age, distance, values and lifestyle.</span>
      <Button unstyled className="discovery-filter-tip-close" aria-label="Dismiss filter tip" onClick={() => { dismiss(); opener.current?.focus(); }}>×</Button>
    </span>}
  </>;
}
