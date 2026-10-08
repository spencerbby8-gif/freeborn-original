"use client";

import { useCallback } from "react";
import { CheckIcon } from "@/components/icons";

type ChipSelectProps = {
  label: string;
  options: readonly string[];
  value: string[];
  onChange?: (next: string[]) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
  max?: number;
};

export function ChipSelect({ label, options, value, onChange, error, hint, optional, max }: ChipSelectProps) {
  const toggle = useCallback(
    (option: string) => {
      if (!onChange) return;
      if (value.includes(option)) {
        onChange(value.filter((item) => item !== option));
        return;
      }
      if (max && value.length >= max) return;
      onChange([...value, option]);
    },
    [max, onChange, value]
  );

  const atMax = Boolean(max && value.length >= max);

  return (
    <div className="group space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <label className="text-[13px] font-bold uppercase tracking-wider text-[var(--color-sand)]">{label}</label>
        <div className="flex items-center gap-3">
          {optional ? (
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-mist)]">Optional</span>
          ) : null}
          {max ? (
            <span
              className={`text-[11px] font-bold uppercase tracking-widest ${
                atMax ? "text-[var(--color-gold-300)]" : "text-[var(--color-ash)]"
              }`}
            >
              {value.length}/{max}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {options.map((option) => {
          const active = value.includes(option);
          const disabled = !active && atMax;
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              aria-pressed={active}
              disabled={disabled}
              className={`inline-flex min-h-[42px] items-center gap-2 rounded-full border px-5 py-2 text-[14px] font-bold leading-4 transition-all active:scale-[0.96] ${
                active
                  ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/15 text-[var(--color-pearl)] shadow-[0_0_15px_rgba(217,167,82,0.2)]"
                  : disabled
                    ? "cursor-not-allowed border-white/5 bg-white/[0.01] text-[var(--color-ash)]/40"
                    : "border-white/10 bg-white/[0.03] text-[var(--color-sand)] hover:border-white/20 hover:bg-white/[0.06] hover:text-[var(--color-pearl)]"
              }`}
            >
              {active ? <CheckIcon size={16} className="text-[var(--color-gold-300)]" /> : null}
              {option}
            </button>
          );
        })}
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
