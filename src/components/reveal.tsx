"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "article" | "li" | "figure";
  id?: string;
};

/**
 * IntersectionObserver-driven reveal. Adds `.in` once the element enters
 * the viewport; the `.rv` / `.mask-line` CSS handles the actual motion.
 * Honors prefers-reduced-motion via CSS fallback (elements stay visible).
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
  id,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      node.classList.add("in");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const style = { "--rv-delay": `${delay}ms` } as CSSProperties;

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} id={id} className={`rv ${className}`} style={style}>
      {children}
    </Tag>
  );
}
