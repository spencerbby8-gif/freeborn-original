"use client";

import { CheckIcon } from "@/components/icons";

type Option = { value: string; label: string; caption?: string };

type OptionCardRowProps = {
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
};

export function OptionCardRow({ options, value, onChange, max }: OptionCardRowProps) {
  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((item) => item !== optionValue));
      return;
    }
    if (max && value.length >= max) return;
    onChange([...value, optionValue]);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((option) => {
        const active = value.includes(option.value);
        const disabled = !active && Boolean(max && value.length >= max);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            disabled={disabled}
            aria-pressed={active}
            className={`group relative flex items-start gap-4 rounded-3xl border p-5 text-left transition-all active:scale-[0.98] ${
              active
                ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/10 shadow-[0_0_20px_-5px_rgba(217,167,82,0.15)]"
                : disabled
                  ? "cursor-not-allowed border-white/5 bg-white/[0.01] opacity-40"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
            }`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                active
                  ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)] text-[var(--color-ink)]"
                  : "border-white/10 bg-black/20 text-transparent"
              }`}
            >
              <CheckIcon size={14} strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <span className={`block text-[15px] font-bold ${active ? "text-[var(--color-pearl)]" : "text-[var(--color-sand)]"}`}>
                {option.label}
              </span>
              {option.caption ? (
                <span className="mt-1.5 block text-[13px] font-medium leading-relaxed text-[var(--color-mist)]">
                  {option.caption}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
