"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { CheckIcon } from "@/components/icons";

/* --- shared field chrome ------------------------------------------------ */

function FieldHeader({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--color-sand)]">{label}</span>
      {optional ? (
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-mist)]">Optional</span>
      ) : null}
    </div>
  );
}

function FieldFootnote({ hint, error }: { hint?: string; error?: string }) {
  if (hint && !error) {
    return <p className="px-1 text-[12px] leading-relaxed text-[var(--color-mist)]">{hint}</p>;
  }
  if (error) {
    return (
      <p className="animate-scale-in flex items-center gap-2 px-1 text-[12px] font-bold leading-relaxed text-[var(--color-danger)]" role="alert">
        <span className="flex h-1.5 w-1.5 rounded-full bg-current" />
        {error}
      </p>
    );
  }
  return null;
}

const inputBase =
  "min-h-[52px] w-full rounded-2xl border bg-white/[0.03] px-5 py-3.5 text-[15px] font-medium text-[var(--color-pearl)] outline-none transition-all placeholder:text-[var(--color-ash)] focus:bg-white/[0.06]";
const inputStates = (error?: string) =>
  error
    ? "border-[var(--color-danger)] shadow-[0_0_20px_-5px_rgba(255,107,122,0.2)]"
    : "border-white/10 hover:border-white/20 focus:border-[var(--color-gold-500)] focus:shadow-[0_0_20px_-10px_rgba(217,167,82,0.3)]";

/* --- text input ---------------------------------------------------------- */

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
};

export function OnboardingTextInput({ label, error, hint, optional, id, className = "", name, ...props }: TextInputProps) {
  const inputId = id ?? name ?? label;
  return (
    <div className="space-y-2.5">
      <FieldHeader label={label} optional={optional} />
      <input id={inputId} className={`${inputBase} ${inputStates(error)} ${className}`} aria-invalid={Boolean(error)} {...props} />
      <FieldFootnote hint={hint} error={error} />
    </div>
  );
}

/* --- textarea with counter ----------------------------------------------- */

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  counter?: { value: number; max: number };
};

export function OnboardingTextarea({ label, error, hint, optional, counter, id, className = "", name, ...props }: TextareaProps) {
  const inputId = id ?? name ?? label;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--color-sand)]">{label}</span>
        <div className="flex items-center gap-3">
          {counter ? (
            <span
              className={`text-[11px] font-bold tabular-nums tracking-widest ${
                counter.value > counter.max * 0.9 ? "text-[var(--color-gold-300)]" : "text-[var(--color-ash)]"
              }`}
            >
              {counter.value}/{counter.max}
            </span>
          ) : null}
          {optional ? (
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-mist)]">Optional</span>
          ) : null}
        </div>
      </div>
      <textarea
        id={inputId}
        className={`${inputBase} resize-none leading-relaxed ${inputStates(error)} ${className}`}
        aria-invalid={Boolean(error)}
        {...props}
      />
      <FieldFootnote hint={hint} error={error} />
    </div>
  );
}

/* --- Freeborn dropdown (no native white selects anywhere) ---------------- */

type SelectMenuProps = {
  label?: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  error?: string;
  hint?: string;
  optional?: boolean;
};

export function SelectMenu({
  label,
  hideLabel,
  value,
  onChange,
  options,
  placeholder = "Select…",
  error,
  hint,
  optional,
}: SelectMenuProps) {
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
      const active = listRef.current.querySelector('[data-active="true"]');
      active?.scrollIntoView({ block: "nearest" });
    }
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="space-y-2.5">
      {label && !hideLabel ? <FieldHeader label={label} optional={optional} /> : null}
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border bg-white/[0.03] px-5 py-3.5 text-left text-[15px] font-medium outline-none transition-all hover:border-white/20 ${
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
            className="animate-scale-in absolute inset-x-0 top-[calc(100%+8px)] z-40 max-h-[280px] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1022] p-1.5 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.85),0_1px_0_rgba(255,255,255,0.06)_inset]"
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
      {label ? <FieldFootnote hint={hint} error={error} /> : null}
    </div>
  );
}

/* --- combo field: pick from options OR type manually ---------------------- */

type ComboFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  optional?: boolean;
  hint?: string;
};

export function ComboField({ label, value, onChange, options, placeholder = "Select or type…", optional, hint }: ComboFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const query = value.trim().toLowerCase();
  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query))
    : options;
  const inputId = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-2.5">
      <FieldHeader label={label} optional={optional} />
      <div ref={rootRef} className="relative">
        <input
          id={inputId}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`${inputBase} border-white/10 pr-12 hover:border-white/20 focus:border-[var(--color-gold-500)] focus:bg-white/[0.06]`}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Browse ${label.toLowerCase()} options`}
          aria-expanded={open}
          className="absolute inset-y-0 right-2 my-auto flex h-10 w-10 items-center justify-center rounded-xl text-[var(--color-mist)] transition-colors hover:bg-white/5 hover:text-[var(--color-pearl)]"
        >
          <svg
            className={`transition-transform duration-300 ${open ? "rotate-180 text-[var(--color-gold-300)]" : ""}`}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
          >
            <path d="M2.5 5l4.5 4.5L11.5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && filtered.length > 0 ? (
          <div
            role="listbox"
            className="animate-scale-in absolute inset-x-0 top-[calc(100%+8px)] z-40 max-h-[240px] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1022] p-1.5 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.85),0_1px_0_rgba(255,255,255,0.06)_inset]"
          >
            {filtered.slice(0, 12).map((option) => {
              const active = option.toLowerCase() === query;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-[14px] font-medium transition-colors ${
                    active
                      ? "bg-[var(--color-gold-500)]/12 text-[var(--color-pearl)]"
                      : "text-[var(--color-sand)] hover:bg-white/[0.06] hover:text-[var(--color-pearl)]"
                  }`}
                >
                  {option}
                  {active ? <CheckIcon size={15} className="text-[var(--color-gold-300)]" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <FieldFootnote hint={hint} />
    </div>
  );
}

/* --- date of birth: three Freeborn dropdowns ------------------------------ */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseParts(value: string): [string, string, string] {
  return /^(\d{4})-(\d{2})-(\d{2})$/.test(value)
    ? (value.split("-") as [string, string, string])
    : ["", "", ""];
}

type DateOfBirthFieldProps = {
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
};

export function DateOfBirthField({ label = "Date of birth", value, onChange, error, hint }: DateOfBirthFieldProps) {
  const [year, setYear] = useState(parseParts(value)[0]);
  const [month, setMonth] = useState(parseParts(value)[1]);
  const [day, setDay] = useState(parseParts(value)[2]);

  const emit = (nextYear: string, nextMonth: string, nextDay: string) => {
    if (nextYear && nextMonth && nextDay) onChange(`${nextYear}-${nextMonth}-${nextDay}`);
  };

  const currentYear = new Date().getFullYear();
  const yearOptions: Array<{ value: string; label: string }> = [];
  for (let y = currentYear - 18; y >= currentYear - 100; y--) {
    yearOptions.push({ value: String(y), label: String(y) });
  }

  const monthOptions = MONTHS.map((name, index) => ({
    value: String(index + 1).padStart(2, "0"),
    label: name,
  }));

  const dayOptions = Array.from({ length: 31 }, (_, i) => {
    const d = String(i + 1).padStart(2, "0");
    return { value: d, label: String(i + 1) };
  });

  return (
    <div className="space-y-2.5">
      <div className="px-1">
        <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--color-sand)]">{label}</span>
      </div>
      <div className="grid grid-cols-[1.25fr_0.75fr_0.9fr] gap-2.5">
        <SelectMenu hideLabel value={month} onChange={(next) => { setMonth(next); emit(year, next, day); }} options={monthOptions} placeholder="Month" />
        <SelectMenu hideLabel value={day} onChange={(next) => { setDay(next); emit(year, month, next); }} options={dayOptions} placeholder="Day" />
        <SelectMenu hideLabel value={year} onChange={(next) => { setYear(next); emit(next, month, day); }} options={yearOptions} placeholder="Year" />
      </div>
      <FieldFootnote hint={hint} error={error} />
    </div>
  );
}
