"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_FILTERS,
  loadFilters,
  saveFilters,
  type HomeFilters,
} from "./filters";
import {
  genderOptions,
  interestOptions,
  lifestyleOptions,
  relationshipGoalOptions,
} from "@/lib/onboarding-data";

const INTENT_VALUE_TO_LABEL: Record<string, string> = Object.fromEntries(
  relationshipGoalOptions.map((o) => [o.value, o.label])
);

function Chip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`inline-flex h-[38px] items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition ${
        active
          ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/15 text-[var(--color-pearl)] shadow-[0_0_12px_rgba(217,167,82,0.18)]"
          : "border-white/10 bg-white/[0.02] text-[var(--color-sand)] hover:border-white/25"
      }`}
    >
      {active ? (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.2 6.4l2.4 2.4 5.2-5.4" stroke="var(--color-gold-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {label}
    </button>
  );
}

function Toggle({
  label,
  body,
  value,
  onChange,
}: {
  label: string;
  body: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition ${
        value
          ? "border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/[0.06]"
          : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-black">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-4 text-[var(--color-mist)]">{body}</span>
      </span>
      <span className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${value ? "bg-[var(--color-gold-500)]" : "bg-white/10"}`}>
        <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${value ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-sand)]">{label}</span>
        <span className="rounded-lg bg-[var(--color-gold-500)]/15 px-2.5 py-1 text-[13px] font-black tabular-nums text-[var(--color-gold-300)]">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-pearl)]"
        style={{ background: `linear-gradient(to right, var(--color-gold-500) 0%, var(--color-gold-500) ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)` }}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-sand)]">{children}</p>
  );
}

export function FilterPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState<HomeFilters>({ ...DEFAULT_FILTERS });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF(loadFilters());
    setSaved(false);
  }, [open]);

  if (!open) return null;

  const set = (patch: Partial<HomeFilters>) => setF((prev) => ({ ...prev, ...patch }));
  const toggleArr = (
    key: "genders" | "lifestyle" | "interests" | "intents" | "religions" | "marital" | "kids" | "drinking" | "smoking" | "languages",
    value: string
  ) => {
    setF((prev) => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] };
    });
  };

  const activeCount = Object.keys(f).filter(
    (k) => JSON.stringify(f[k as keyof HomeFilters]) !== JSON.stringify((DEFAULT_FILTERS as Record<string, unknown>)[k])
  ).length;

  const apply = () => {
    saveFilters(f);
    setSaved(true);
    setTimeout(onClose, 600);
  };

  const clear = () => setF({ ...DEFAULT_FILTERS });

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="animate-scale-in flex max-h-[88vh] w-full max-w-[520px] flex-col rounded-t-[28px] border border-white/10 bg-[#0b1022] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl font-semibold">Filters</h2>
            {activeCount > 0 ? (
              <span className="rounded-full border border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/12 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-wider text-[var(--color-gold-300)]">
                {activeCount} active
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[var(--color-mist)] transition hover:text-[var(--color-pearl)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Age */}
          <div className="space-y-3">
            <SectionLabel>Age range</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Slider label="Min age" value={f.ageMin} min={18} max={99} display={`${f.ageMin}`} onChange={(v) => set({ ageMin: Math.min(v, f.ageMax) })} />
              <Slider label="Max age" value={f.ageMax} min={18} max={99} display={`${f.ageMax}`} onChange={(v) => set({ ageMax: Math.max(v, f.ageMin) })} />
            </div>
          </div>

          {/* Gender */}
          <div className="space-y-3">
            <SectionLabel>Show me</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {genderOptions.slice(0, 3).map((g) => (
                <Chip key={g.value} label={g.label} active={f.genders.includes(g.value)} onToggle={() => toggleArr("genders", g.value)} />
              ))}
            </div>
            <p className="text-[11px] leading-4 text-[var(--color-ash)]">Leave empty to see everyone.</p>
          </div>

          {/* Distance */}
          <div className="space-y-3">
            <SectionLabel>Maximum distance</SectionLabel>
            <Slider label="Distance" value={f.distance} min={5} max={500} display={f.distance >= 500 ? "Anywhere" : `${f.distance} km`} onChange={(v) => set({ distance: v })} />
            <p className="text-[11px] leading-4 text-[var(--color-ash)]">"Anywhere" shows everyone regardless of location.</p>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <SectionLabel>Preferences</SectionLabel>
            <Toggle label="Verified members only" body="Only profiles with trust verification." value={f.verifiedOnly} onChange={(v) => set({ verifiedOnly: v })} />
            <Toggle label="Online now" body="Only members active in the last 24 hours." value={f.onlineOnly} onChange={(v) => set({ onlineOnly: v })} />
          </div>

          {/* Vaccination */}
          <div className="space-y-3">
            <SectionLabel>Vaccination stance</SectionLabel>
            {[
              { value: "any", label: "Show everyone", body: "All stances welcome." },
              { value: "unvaccinated", label: "Unvaccinated only", body: "Only members who identify as unvaccinated." },
              { value: "vaccinated", label: "Vaccinated only", body: "Only members who identify as vaccinated." },
            ].map((o) => {
              const active = f.vax === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => set({ vax: o.value })}
                  aria-pressed={active}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition ${
                    active ? "border-[var(--color-gold-500)]/50 bg-[var(--color-gold-500)]/[0.07]" : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] font-black">{o.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-4 text-[var(--color-mist)]">{o.body}</span>
                  </span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]" : "border-white/20"}`}>
                    {active ? (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M2.2 6.4l2.4 2.4 5.2-5.4" stroke="#0b1022" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Lifestyle */}
          <div className="space-y-3">
            <SectionLabel>Lifestyle</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {lifestyleOptions.slice(0, 18).map((l) => (
                <Chip key={l} label={l} active={f.lifestyle.includes(l)} onToggle={() => toggleArr("lifestyle", l)} />
              ))}
            </div>
          </div>

          {/* Interests */}
          <div className="space-y-3">
            <SectionLabel>Hobbies & interests</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {interestOptions.slice(0, 24).map((i) => (
                <Chip key={i} label={i} active={f.interests.includes(i)} onToggle={() => toggleArr("interests", i)} />
              ))}
            </div>
          </div>

          {/* Intent */}
          <div className="space-y-3">
            <SectionLabel>Relationship intent</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {relationshipGoalOptions.map((o) => (
                <Chip key={o.value} label={o.label} active={f.intents.includes(o.value)} onToggle={() => toggleArr("intents", o.value)} />
              ))}
            </div>
          </div>

          {/* Background filters */}
          <div className="space-y-3">
            <SectionLabel>Religion</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {["Christian", "Spiritual", "Catholic", "Jewish", "Muslim", "Agnostic", "Atheist", "Prefer not to say"].map((r) => (
                <Chip key={r} label={r} active={f.religions.includes(r)} onToggle={() => toggleArr("religions", r)} />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <SectionLabel>Marital status</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {["Never married", "Divorced", "Widowed", "Separated"].map((m) => (
                <Chip key={m} label={m} active={f.marital.includes(m)} onToggle={() => toggleArr("marital", m)} />
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <SectionLabel>Has kids</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {["No kids", "Have kids"].map((k) => (
                  <Chip key={k} label={k} active={f.kids.includes(k)} onToggle={() => toggleArr("kids", k)} />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <SectionLabel>Language</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {["English", "Spanish", "French", "Other"].map((l) => (
                  <Chip key={l} label={l} active={f.languages.includes(l)} onToggle={() => toggleArr("languages", l)} />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <SectionLabel>Drinking</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {["Never", "Rarely", "Socially", "Regularly"].map((d) => (
                  <Chip key={d} label={d} active={f.drinking.includes(d)} onToggle={() => toggleArr("drinking", d)} />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <SectionLabel>Smoking</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {["Never", "Rarely", "Socially", "Regularly"].map((s) => (
                  <Chip key={s} label={s} active={f.smoking.includes(s)} onToggle={() => toggleArr("smoking", s)} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-white/[0.06] px-6 py-4">
          <button
            type="button"
            onClick={clear}
            disabled={activeCount === 0}
            className="rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-[13px] font-bold text-[var(--color-mist)] transition hover:text-[var(--color-pearl)] disabled:opacity-40"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={apply}
            className="btn-ember btn-shine relative flex-1 overflow-hidden rounded-full px-6 py-3 text-[13px] font-bold"
          >
            {saved ? "✓ Applied" : "Apply filters"}
          </button>
        </div>
      </div>
    </div>
  );
}
