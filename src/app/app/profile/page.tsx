"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app/app-shell";
import { getAccessToken } from "@/lib/supabase/browser";

type MeProfile = {
  displayName: string;
  age: number | null;
  gender: string;
  city: string;
  region: string;
  bio: string;
  occupation: string;
  education: string;
  language: string;
  religion: string;
  maritalStatus: string;
  hasKids: string;
  wantsKids: string;
  drinking: string;
  smoking: string;
  educationLevel: string;
  heightCmProfile: number | null;
  vaccinationStatus: string;
  values: string[];
  interests: string[];
  lifestyle: string[];
  relationshipGoals: string[];
  photos: string[];
  isVerified: boolean;
};

const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Arabic", "Mandarin", "Other"];
const RELIGIONS = ["Christian", "Spiritual", "Catholic", "Protestant", "Jewish", "Muslim", "Buddhist", "Hindu", "Agnostic", "Atheist", "Prefer not to say"];
const MARITAL = ["Never married", "Divorced", "Widowed", "Separated", "It's complicated"];
const KIDS = ["No kids", "Have kids", "Kids grown", "Prefer not to say"];
const WANTS_KIDS = ["Want kids", "Not sure", "Don't want kids", "Already have enough"];
const FREQUENCY = ["Never", "Rarely", "Socially", "Regularly"];
const EDUCATION_LEVELS = ["High school", "Trade school", "Some college", "Bachelor's", "Master's", "Doctorate", "Self-taught"];
const VAX = ["prefer_not_to_say", "unvaccinated", "vaccinated"];
const VAX_LABELS: Record<string, string> = {
  prefer_not_to_say: "Prefer not to say",
  unvaccinated: "Unvaccinated",
  vaccinated: "Vaccinated",
};

function SelectField({
  label,
  value,
  options,
  onChange,
  labels,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <div className="space-y-2">
      <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-sand)]">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[48px] w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 pr-10 text-[14px] font-medium text-[var(--color-pearl)] outline-none transition focus:border-[var(--color-gold-500)]"
        >
          <option value="" className="bg-[var(--color-midnight)]">Select…</option>
          {options.map((o) => (
            <option key={o} value={o} className="bg-[var(--color-midnight)]">
              {labels?.[o] ?? o}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-mist)]" width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M2.5 5l4.5 4.5L11.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-sand)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[48px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[14px] font-medium text-[var(--color-pearl)] outline-none transition placeholder:text-[var(--color-ash)] focus:border-[var(--color-gold-500)]"
      />
    </div>
  );
}

function ProfileInner() {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [completeness, setCompleteness] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<MeProfile>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const token = await getAccessToken().catch(() => null);
    const res = await fetch("/api/profile/me", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) {
      const json = await res.json();
      setProfile(json.profile);
      setCompleteness(json.completeness);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = () => {
    if (profile) setDraft({ ...profile });
    setEditing(true);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    const token = await getAccessToken().catch(() => null);
    const res = await fetch("/api/profile/me", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setEditing(false);
      await load();
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return <p className="py-20 text-center text-sm text-[var(--color-mist)]">Couldn't load your profile.</p>;
  }

  const set = (patch: Partial<MeProfile>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <div className="mx-auto max-w-[720px] pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Your profile</h1>
          <p className="mt-1.5 text-sm text-[var(--color-mist)]">How others see you in the room.</p>
        </div>
        {!editing ? (
          <button type="button" onClick={startEdit} className="btn-ghost rounded-full px-5 py-2.5 text-[13px] font-bold">
            Edit profile
          </button>
        ) : null}
      </div>

      {/* Completion */}
      <div className="mt-6 rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--color-sand)]">Profile completion</span>
          <span className="font-display text-xl font-semibold text-[var(--color-gold-300)]">{completeness}%</span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-[var(--gradient-ember-warm)] transition-all duration-700"
            style={{ width: `${completeness}%` }}
          />
        </div>
        <p className="mt-3 text-[12px] leading-5 text-[var(--color-mist)]">
          {completeness >= 80
            ? "Looking strong — complete profiles get far more meaningful matches."
            : "Complete the details below to show up higher in discovery and attract better matches."}
        </p>
      </div>

      {/* Photos + name */}
      <div className="mt-6 flex items-center gap-4">
        {profile.photos[0] ? (
          <img src={profile.photos[0]} alt={profile.displayName} className="h-20 w-20 rounded-full border border-white/10 object-cover" />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] font-display text-2xl font-bold text-white">
            {(profile.displayName || "You").charAt(0)}
          </span>
        )}
        <div>
          <p className="font-display text-xl font-semibold text-[var(--color-pearl)]">
            {profile.displayName || "Add your name"}
            {profile.age ? `, ${profile.age}` : ""}
          </p>
          <p className="text-[13px] text-[var(--color-mist)]">
            {[profile.city, profile.region].filter(Boolean).join(", ") || "Add your city"}
          </p>
        </div>
      </div>

      {!editing ? (
        <div className="mt-6 space-y-4">
          {profile.bio ? (
            <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-gold-500)]">About me</p>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ivory)]">{profile.bio}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Occupation", value: profile.occupation },
              { label: "Education", value: profile.educationLevel || profile.education },
              { label: "Language", value: profile.language },
              { label: "Religion", value: profile.religion },
              { label: "Marital status", value: profile.maritalStatus },
              { label: "Kids", value: profile.hasKids },
              { label: "Wants kids", value: profile.wantsKids },
              { label: "Drinking", value: profile.drinking },
              { label: "Smoking", value: profile.smoking },
              { label: "Height", value: profile.heightCmProfile ? `${profile.heightCmProfile} cm` : "" },
              { label: "Vaccination", value: VAX_LABELS[profile.vaccinationStatus] },
            ]
              .filter((f) => f.value)
              .map((f) => (
                <div key={f.label} className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ash)]">{f.label}</p>
                  <p className="mt-1 text-[13px] font-semibold text-[var(--color-ivory)]">{f.value}</p>
                </div>
              ))}
          </div>

          {profile.values.length || profile.interests.length || profile.lifestyle.length ? (
            <div className="space-y-3">
              {profile.values.length ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-gold-500)]">Values</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {profile.values.map((v) => (
                      <span key={v} className="rounded-full border border-white/[0.07] bg-pearl/5 px-3 py-1 text-[11px] font-semibold text-sand">{v}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {profile.interests.length ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-gold-500)]">Interests</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {profile.interests.map((v) => (
                      <span key={v} className="rounded-full border border-white/[0.07] bg-pearl/5 px-3 py-1 text-[11px] font-semibold text-sand">{v}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-5">
            <p className="mb-4 text-[13px] font-bold uppercase tracking-wider text-[var(--color-sand)]">Basics</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Display name" value={draft.displayName ?? ""} onChange={(v) => set({ displayName: v })} placeholder="Your name" />
              <TextField label="City" value={draft.city ?? ""} onChange={(v) => set({ city: v })} placeholder="City" />
              <TextField label="Occupation" value={draft.occupation ?? ""} onChange={(v) => set({ occupation: v })} placeholder="What you do" />
              <TextField label="Height (cm)" value={draft.heightCmProfile ? String(draft.heightCmProfile) : ""} onChange={(v) => set({ heightCmProfile: Number(v) || null })} placeholder="e.g. 175" />
            </div>
            <div className="mt-4 space-y-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-sand)]">About me</span>
              <textarea
                value={draft.bio ?? ""}
                onChange={(e) => set({ bio: e.target.value })}
                placeholder="A short, honest intro…"
                className="min-h-[110px] w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[14px] leading-relaxed text-[var(--color-pearl)] outline-none transition placeholder:text-[var(--color-ash)] focus:border-[var(--color-gold-500)]"
              />
            </div>
          </div>

          <div className="rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-5">
            <p className="mb-4 text-[13px] font-bold uppercase tracking-wider text-[var(--color-sand)]">Background & lifestyle</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Language" value={draft.language ?? ""} options={LANGUAGES} onChange={(v) => set({ language: v })} />
              <SelectField label="Religion" value={draft.religion ?? ""} options={RELIGIONS} onChange={(v) => set({ religion: v })} />
              <SelectField label="Marital status" value={draft.maritalStatus ?? ""} options={MARITAL} onChange={(v) => set({ maritalStatus: v })} />
              <SelectField label="Education level" value={draft.educationLevel ?? ""} options={EDUCATION_LEVELS} onChange={(v) => set({ educationLevel: v })} />
              <SelectField label="Have kids?" value={draft.hasKids ?? ""} options={KIDS} onChange={(v) => set({ hasKids: v })} />
              <SelectField label="Want kids?" value={draft.wantsKids ?? ""} options={WANTS_KIDS} onChange={(v) => set({ wantsKids: v })} />
              <SelectField label="Drinking" value={draft.drinking ?? ""} options={FREQUENCY} onChange={(v) => set({ drinking: v })} />
              <SelectField label="Smoking" value={draft.smoking ?? ""} options={FREQUENCY} onChange={(v) => set({ smoking: v })} />
              <SelectField label="Vaccination stance" value={draft.vaccinationStatus ?? ""} options={VAX} labels={VAX_LABELS} onChange={(v) => set({ vaccinationStatus: v })} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={saving} className="btn-ember btn-shine relative flex-1 overflow-hidden rounded-full px-6 py-3.5 text-[15px] font-bold disabled:opacity-60">
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost rounded-full px-6 py-3.5 text-[14px] font-bold">
              Cancel
            </button>
          </div>
          {saved ? <p className="text-center text-[13px] font-bold text-[var(--color-teal-300)]">✓ Profile saved</p> : null}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileInner />
    </AppShell>
  );
}
