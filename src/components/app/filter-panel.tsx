"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_FILTERS,
  loadFilters,
  saveFilters,
  type FacetCount,
  type HomeFilters,
  type RoomFacets,
} from "./filters";
import { getAccessToken } from "@/lib/supabase/browser";
import { formatDistance, useDistanceUnits } from "@/lib/device-prefs";
import {
  genderOptions,
  interestOptions,
  lifestyleOptions,
  relationshipGoalOptions,
} from "@/lib/onboarding-data";

/* Used only for the moment before the counts arrive, and for anything a member
   already had selected. They are NOT the source of truth about who is in the
   room: the old panel treated them as though they were, and the route excludes a
   member whose value is absent from the list, so these lists quietly decided who
   could be found. Production disagrees with all of them. */
const RELIGION_FALLBACK = [
  "Christian",
  "Spiritual",
  "Catholic",
  "Jewish",
  "Muslim",
  "Agnostic",
  "Atheist",
  "Prefer not to say",
];
const MARITAL_FALLBACK = ["Never married", "Divorced", "Widowed", "Separated"];
const KIDS_FALLBACK = ["No kids", "Have kids"];
const WANTS_KIDS_FALLBACK = ["Want kids", "Don't want kids", "Open to kids"];
const LANGUAGE_FALLBACK = ["English", "Spanish", "French", "Other"];
const FREQUENCY_FALLBACK = ["Never", "Rarely", "Socially", "Regularly"];

const INTENT_VALUE_TO_LABEL: Record<string, string> = Object.fromEntries(
  relationshipGoalOptions.map((o) => [o.value, o.label])
);

function Chip({
  label,
  active,
  onToggle,
  count,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  /** How many members of the room actually have this value. Undefined means the
      counts have not arrived yet, which is not the same as zero. */
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`inline-flex h-[38px] items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition ${
        active
          ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/15 text-[var(--color-pearl)] shadow-[0_0_12px_rgba(217,167,82,0.18)]"
          : count === 0
            ? "border-white/[0.07] bg-white/[0.01] text-[var(--color-ash)] hover:border-white/15"
            : "border-white/10 bg-white/[0.02] text-[var(--color-sand)] hover:border-white/25"
      }`}
    >
      {active ? (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.2 6.4l2.4 2.4 5.2-5.4" stroke="var(--color-gold-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {label}
      {count !== undefined ? (
        <span
          className={`ml-0.5 text-[10.5px] font-black tabular-nums ${
            count === 0 ? "text-[var(--color-ash)]" : "opacity-60"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/* Says out loud what a filter on an optional field will do, before the member
   turns it on. In a room this size that is the difference between a useful
   filter and an empty deck with no explanation. */
function SectionNote({ facet, total }: { facet?: FacetCount; total: number }) {
  if (!facet || total === 0) return null;
  if (facet.stated === 0) {
    return (
      <p className="text-[11px] leading-4 text-[var(--color-gold-300)]">
        Nobody in the room has stated this yet, so filtering on it empties your
        deck.
      </p>
    );
  }
  if (facet.stated < total) {
    return (
      <p className="text-[11px] leading-4 text-[var(--color-ash)]">
        {facet.stated} of {total} members have answered. The other{" "}
        {total - facet.stated} are left out while this filter is on.
      </p>
    );
  }
  return null;
}

/* Chips built from the values the room actually contains, with the static list
   as a fallback before the counts arrive and for anything the member already had
   selected, so a saved filter can never become invisible and un-clearable. */
function ValueChips({
  facet,
  fallback,
  selected,
  onToggle,
  keepAll = false,
}: {
  facet?: FacetCount;
  fallback: string[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Keep every fallback option visible even when nobody in the room has picked
      it, with a count of zero. Right for multi-answer fields, where seeing that
      a choice is empty is itself useful. */
  keepAll?: boolean;
}) {
  const counts = facet?.values ?? {};
  const fromRoom = Object.keys(counts).sort(
    (a, b) => counts[b] - counts[a] || a.localeCompare(b)
  );
  const base = facet
    ? keepAll
      ? Array.from(new Set([...fallback, ...fromRoom]))
      : fromRoom
    : fallback;
  const labels = labelFor(base.length ? base : fallback);
  const merged = Array.from(new Set([...labels, ...selected]));
  return (
    <div className="flex flex-wrap gap-2">
      {merged.map((label) => (
        <Chip
          key={label}
          label={label}
          active={selected.includes(label)}
          onToggle={() => onToggle(label)}
          count={facet ? counts[valueFor(label)] ?? 0 : undefined}
        />
      ))}
    </div>
  );
}

/* The room stores what the member picked, which for some fields is a value key
   and for others is already the display text. Both directions are mapped so a
   count lands on the right chip whichever way the field is stored. */
const VALUE_LABELS: Record<string, string> = Object.fromEntries([
  ...genderOptions.map((g) => [g.value, g.label] as [string, string]),
  ...relationshipGoalOptions.map((o) => [o.value, o.label] as [string, string]),
]);
function labelFor(values: string[]): string[] {
  return values.map((v) => VALUE_LABELS[v] ?? v);
}
function valueFor(label: string): string {
  const hit =
    genderOptions.find((g) => g.label === label) ??
    relationshipGoalOptions.find((o) => o.label === label);
  return hit ? hit.value : label;
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
  const [facets, setFacets] = useState<RoomFacets | null>(null);
  const units = useDistanceUnits();

  useEffect(() => {
    if (!open) return;
    setF(loadFilters());
    setSaved(false);
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken().catch(() => null);
        const res = await fetch("/api/profiles?facetsOnly=1", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled || !res.ok) return;
        const json = await res.json();
        setFacets(json.facets ?? null);
      } catch {
        /* The counts are a nicety. Without them the panel falls back to the
           static lists and still works. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const set = (patch: Partial<HomeFilters>) => setF((prev) => ({ ...prev, ...patch }));
  const toggleArr = (
    key:
      | "genders"
      | "lifestyle"
      | "interests"
      | "intents"
      | "religions"
      | "marital"
      | "kids"
      | "wantsKids"
      | "drinking"
      | "smoking"
      | "languages",
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
            {/* Was genderOptions.slice(0, 3). The route drops anyone whose
                gender is not in the list, so offering three of nine meant a
                genderqueer or two-spirit member vanished from every deck the
                moment any gender filter was switched on. */}
            <ValueChips
              facet={facets?.gender}
              fallback={genderOptions.map((g) => g.value)}
              selected={labelFor(f.genders)}
              onToggle={(label) => toggleArr("genders", valueFor(label))}
            />
            <p className="text-[11px] leading-4 text-[var(--color-ash)]">
              Leave empty to see everyone.
            </p>
            <SectionNote facet={facets?.gender} total={facets?.total ?? 0} />
          </div>

          {/* Distance */}
          <div className="space-y-3">
            <SectionLabel>Maximum distance</SectionLabel>
            <Slider label="Distance" value={f.distance} min={5} max={500} display={f.distance >= 500 ? "Anywhere" : formatDistance(f.distance, units)} onChange={(v) => set({ distance: v })} />
            <p className="text-[11px] leading-4 text-[var(--color-ash)]">&quot;Anywhere&quot; shows everyone regardless of location.</p>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <SectionLabel>Preferences</SectionLabel>
            <Toggle
              label="Verified members only"
              body={
                facets
                  ? `${facets.verified} of ${facets.total} in the room are verified.`
                  : "Only profiles with trust verification."
              }
              value={f.verifiedOnly}
              onChange={(v) => set({ verifiedOnly: v })}
            />
            {/* Labelled with the window it actually uses. It was "Online now"
                over 24 hours, which is not what those words mean. */}
            <Toggle
              label="Active in the last 24 hours"
              body={
                facets
                  ? `${facets.activeToday} of ${facets.total} have been active today. Members who hide their presence are left out.`
                  : "Only members active in the last 24 hours."
              }
              value={f.onlineOnly}
              onChange={(v) => set({ onlineOnly: v })}
            />
            <Toggle
              label="Has at least one photo"
              body={
                facets
                  ? `${facets.withPhoto} of ${facets.total} have a photo. Turning this off shows the rest for this search only; your saved preference is untouched.`
                  : "Hide profiles without a photo."
              }
              value={f.photos === "yes"}
              onChange={(v) => set({ photos: v ? "yes" : "no" })}
            />
            <Toggle
              label="New in the last 14 days"
              body={
                facets
                  ? `${facets.newMembers} of ${facets.total} joined in the last fortnight.`
                  : "Only members who joined recently."
              }
              value={f.newOnly}
              onChange={(v) => set({ newOnly: v })}
            />
            <Toggle
              label="Open to meeting in person"
              body={
                facets
                  ? `${facets.openToMixers} of ${facets.total} have asked for a mixer in their city.`
                  : "Only members who asked for a Freeborn mixer where they live."
              }
              value={f.mixersOnly}
              onChange={(v) => set({ mixersOnly: v })}
            />
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
            <ValueChips
              facet={facets?.lifestyle}
              fallback={lifestyleOptions.slice(0, 18)}
              selected={f.lifestyle}
              onToggle={(v) => toggleArr("lifestyle", v)}
              keepAll
            />
          </div>

          {/* Interests */}
          <div className="space-y-3">
            <SectionLabel>Hobbies &amp; interests</SectionLabel>
            <ValueChips
              facet={facets?.interests}
              fallback={interestOptions.slice(0, 24)}
              selected={f.interests}
              onToggle={(v) => toggleArr("interests", v)}
              keepAll
            />
          </div>

          {/* Intent */}
          <div className="space-y-3">
            <SectionLabel>Relationship intent</SectionLabel>
            <ValueChips
              facet={facets?.intents}
              fallback={relationshipGoalOptions.map((o) => o.value)}
              selected={labelFor(f.intents)}
              onToggle={(label) => toggleArr("intents", valueFor(label))}
              keepAll
            />
          </div>

          {/* Background filters */}
          <div className="space-y-3">
            <SectionLabel>Religion</SectionLabel>
            <ValueChips
              facet={facets?.religion}
              fallback={RELIGION_FALLBACK}
              selected={f.religions}
              onToggle={(v) => toggleArr("religions", v)}
            />
            <SectionNote facet={facets?.religion} total={facets?.total ?? 0} />
          </div>

          <div className="space-y-3">
            <SectionLabel>Marital status</SectionLabel>
            <ValueChips
              facet={facets?.marital}
              fallback={MARITAL_FALLBACK}
              selected={f.marital}
              onToggle={(v) => toggleArr("marital", v)}
            />
            <SectionNote facet={facets?.marital} total={facets?.total ?? 0} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <SectionLabel>Has kids</SectionLabel>
              <ValueChips
                facet={facets?.kids}
                fallback={KIDS_FALLBACK}
                selected={f.kids}
                onToggle={(v) => toggleArr("kids", v)}
              />
              <SectionNote facet={facets?.kids} total={facets?.total ?? 0} />
            </div>
            <div className="space-y-3">
              <SectionLabel>Wants kids</SectionLabel>
              <ValueChips
                facet={facets?.wantsKids}
                fallback={WANTS_KIDS_FALLBACK}
                selected={f.wantsKids}
                onToggle={(v) => toggleArr("wantsKids", v)}
              />
              <SectionNote facet={facets?.wantsKids} total={facets?.total ?? 0} />
            </div>
            <div className="space-y-3">
              <SectionLabel>Language</SectionLabel>
              <ValueChips
                facet={facets?.language}
                fallback={LANGUAGE_FALLBACK}
                selected={f.languages}
                onToggle={(v) => toggleArr("languages", v)}
              />
              <SectionNote facet={facets?.language} total={facets?.total ?? 0} />
            </div>
            <div className="space-y-3">
              <SectionLabel>Drinking</SectionLabel>
              <ValueChips
                facet={facets?.drinking}
                fallback={FREQUENCY_FALLBACK}
                selected={f.drinking}
                onToggle={(v) => toggleArr("drinking", v)}
              />
              <SectionNote facet={facets?.drinking} total={facets?.total ?? 0} />
            </div>
            <div className="space-y-3">
              <SectionLabel>Smoking</SectionLabel>
              <ValueChips
                facet={facets?.smoking}
                fallback={FREQUENCY_FALLBACK}
                selected={f.smoking}
                onToggle={(v) => toggleArr("smoking", v)}
              />
              <SectionNote facet={facets?.smoking} total={facets?.total ?? 0} />
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
