"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/icons";

type Option = { value: string; label: string };

/**
 * Freeborn UI select — a dark, brand-styled listbox. Replaces native
 * <select> dropdowns, which render as an unstyled white sheet on several
 * mobile browsers. Selected option carries the gold check, matching every
 * other selectable in the app.
 */
export function FreebornSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Select…",
  optional,
  hint,
  error,
}: {
  label?: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  optional?: boolean;
  hint?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
    }
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="space-y-2">
      {label ? (
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-sand)]">{label}</span>
          {optional ? (
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-mist)]">Optional</span>
          ) : null}
        </div>
      ) : null}
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex min-h-[48px] w-full items-center justify-between gap-3 rounded-2xl border bg-white/[0.03] px-4 py-3 text-left text-[14px] font-medium outline-none transition-all hover:border-white/20 ${
            error
              ? "border-[var(--color-danger)]"
              : open
                ? "border-[var(--color-gold-500)] bg-white/[0.06] shadow-[0_0_20px_-10px_rgba(217,167,82,0.35)]"
                : "border-white/10"
          }`}
        >
          <span className={selected ? "text-[var(--color-pearl)]" : "text-[var(--color-ash)]"}>
            {selected ? selected.label : placeholder}
          </span>
          <svg
            className={`shrink-0 transition-transform duration-300 ${open ? "rotate-180 text-[var(--color-gold-300)]" : "text-[var(--color-mist)]"}`}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
          >
            <path d="M2.5 5l4.5 4.5L11.5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open ? (
          <div
            ref={listRef}
            role="listbox"
            className="animate-scale-in absolute inset-x-0 top-[calc(100%+8px)] z-40 max-h-[260px] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1022] p-1.5 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.85),0_1px_0_rgba(255,255,255,0.06)_inset]"
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-[14px] font-medium transition-colors ${
                    active
                      ? "bg-[var(--color-gold-500)]/12 text-[var(--color-pearl)]"
                      : "text-[var(--color-sand)] hover:bg-white/[0.06] hover:text-[var(--color-pearl)]"
                  }`}
                >
                  {option.label}
                  {active ? <CheckIcon size={15} className="text-[var(--color-gold-300)]" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {hint && !error ? (
        <p className="px-1 text-[12px] leading-relaxed text-[var(--color-mist)]">{hint}</p>
      ) : null}
      {error ? (
        <p className="animate-scale-in flex items-center gap-2 px-1 text-[12px] font-bold leading-relaxed text-[var(--color-danger)]" role="alert">
          <span className="flex h-1.5 w-1.5 rounded-full bg-current" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
