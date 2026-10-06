"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getAccessToken } from "@/lib/supabase/browser";

type Settings = {
  account: { email: string };
  profile: {
    displayName: string;
    city: string;
    region: string;
    bio: string;
    occupation: string;
    education: string;
    discoverable: boolean;
    isVerified: boolean;
    stage: string;
  };
  discovery: {
    ageMin: number;
    ageMax: number;
    distanceKm: number;
    showGenders: string[];
    verifiedOnly: boolean;
    photosRequired: boolean;
    vaccinationPreference: string;
  };
  notifications: {
    matchAlerts: boolean;
    messageAlerts: boolean;
    likeAlerts: boolean;
    profileActivity: boolean;
  };
};

const AREAS = [
  { id: "profile", label: "Profile" },
  { id: "discovery", label: "Discovery" },
  { id: "notifications", label: "Alerts" },
  { id: "privacy", label: "Privacy" },
  { id: "preferences", label: "Preferences" },
  { id: "account", label: "Account" },
] as const;
type AreaId = (typeof AREAS)[number]["id"];

const PREFS_KEY = "freeborn.preferences";
type Prefs = { units: "km" | "mi"; animations: boolean; haptics: boolean; sounds: boolean };
const DEFAULT_PREFS: Prefs = { units: "km", animations: true, haptics: true, sounds: true };
function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
function savePrefs(p: Prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

const GENDER_LABELS: Record<string, string> = {
  woman: "Woman",
  man: "Man",
  non_binary: "Non-binary",
  genderqueer: "Genderqueer",
  genderfluid: "Genderfluid",
  agender: "Agender",
  two_spirit: "Two-Spirit",
};

const DISTANCES = [
  { value: 25, label: "25 km" },
  { value: 50, label: "50 km" },
  { value: 80, label: "80 km" },
  { value: 150, label: "150 km" },
  { value: 300, label: "300 km" },
  { value: 500, label: "Anywhere" },
];

const inputClass =
  "min-h-[48px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[14px] font-medium text-[var(--color-pearl)] outline-none transition placeholder:text-[var(--color-ash)] focus:border-[var(--color-gold-500)] focus:bg-white/[0.05]";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-sand)]">{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({
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
      <span
        className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition ${value ? "bg-[var(--color-gold-500)]" : "bg-white/10"}`}
      >
        <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${value ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

function SaveRow({ state, onSave }: { state: "idle" | "saving" | "saved" | "error"; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        type="button"
        onClick={onSave}
        disabled={state === "saving"}
        className="btn-ember btn-shine relative overflow-hidden rounded-full px-7 py-2.5 text-[13px] font-bold disabled:opacity-60"
      >
        {state === "saving" ? "Saving…" : "Save changes"}
      </button>
      {state === "saved" ? (
        <span className="animate-scale-in text-[12px] font-bold text-[var(--color-teal-300)]">✓ Saved</span>
      ) : null}
      {state === "error" ? (
        <span className="animate-scale-in text-[12px] font-bold text-[var(--color-danger)]">Couldn't save — try again</span>
      ) : null}
    </div>
  );
}

function PanelTitle({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-[13px] text-[var(--color-mist)]">{blurb}</p>
    </div>
  );
}

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [area, setArea] = useState<AreaId>("profile");
  const [profileState, setProfileState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [discoveryState, setDiscoveryState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [prefs, setPrefs] = useState<Prefs>({ ...DEFAULT_PREFS });

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/settings", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setSettings(await res.json());
    })();
    setPrefs(loadPrefs());
  }, []);

  const setPref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      savePrefs(next);
      return next;
    });
  };

  const post = async (patch: Record<string, unknown>) => {
    const token = await getAccessToken();
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(patch),
    });
    return res.ok;
  };

  if (!settings) {
    return (
      <div className="flex justify-center py-20">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
      </div>
    );
  }

  const p = settings.profile;
  const d = settings.discovery;
  const n = settings.notifications;

  const setP = (patch: Partial<typeof p>) => setSettings({ ...settings, profile: { ...p, ...patch } });
  const setD = (patch: Partial<typeof d>) => setSettings({ ...settings, discovery: { ...d, ...patch } });
  const setN = async (key: keyof typeof n, value: boolean) => {
    setSettings({ ...settings, notifications: { ...n, [key]: value } });
    await post({ notifications: { [key]: value } });
  };

  return (
    <div className="mx-auto max-w-[720px]">
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
      <p className="mt-1.5 text-sm text-[var(--color-mist)]">Pick an area — everything lives in its place.</p>

      {/* Area navigation */}
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {AREAS.map((a) => {
          const active = area === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setArea(a.id)}
              aria-pressed={active}
              className={`shrink-0 rounded-full border px-4.5 py-2.5 text-[13px] font-bold transition ${
                active
                  ? "border-transparent bg-[var(--gradient-ember-warm)] text-white shadow-[var(--shadow-primary-btn)]"
                  : "border-white/10 bg-white/[0.03] text-[var(--color-sand)] hover:border-white/25 hover:text-[var(--color-pearl)]"
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Fixed area panel */}
      <div className="animate-scale-in mt-5 rounded-[26px] border border-white/[0.07] bg-white/[0.025] p-6 sm:p-7" key={area}>
        {area === "profile" ? (
          <div className="space-y-5">
            <PanelTitle title="Profile" blurb="The essentials people see. Honest works better." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name">
                <input className={inputClass} value={p.displayName} maxLength={40} onChange={(e) => setP({ displayName: e.target.value })} />
              </Field>
              <Field label="Occupation">
                <input className={inputClass} value={p.occupation} maxLength={80} placeholder="Optional" onChange={(e) => setP({ occupation: e.target.value })} />
              </Field>
              <Field label="City">
                <input className={inputClass} value={p.city} maxLength={60} onChange={(e) => setP({ city: e.target.value })} />
              </Field>
              <Field label="Region / state">
                <input className={inputClass} value={p.region} maxLength={60} placeholder="Optional" onChange={(e) => setP({ region: e.target.value })} />
              </Field>
            </div>
            <Field label="Bio">
              <textarea
                className={`${inputClass} min-h-[110px] resize-none leading-relaxed`}
                value={p.bio}
                maxLength={500}
                onChange={(e) => setP({ bio: e.target.value })}
              />
              <span className="block text-right text-[11px] text-[var(--color-ash)]">{p.bio.length}/500</span>
            </Field>
            <SaveRow
              state={profileState}
              onSave={async () => {
                setProfileState("saving");
                const ok = await post({ profile: p });
                setProfileState(ok ? "saved" : "error");
                setTimeout(() => setProfileState("idle"), 2500);
              }}
            />
          </div>
        ) : null}

        {area === "discovery" ? (
          <div className="space-y-5">
            <PanelTitle title="Discovery" blurb="Who you see, and how far the room reaches." />
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Minimum age", value: d.ageMin, set: (v: number) => setD({ ageMin: Math.min(v, d.ageMax) }) },
                { label: "Maximum age", value: d.ageMax, set: (v: number) => setD({ ageMax: Math.max(v, d.ageMin) }) },
              ].map((s) => {
                const pct = ((s.value - 18) / (99 - 18)) * 100;
                return (
                  <div key={s.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-sand)]">{s.label}</span>
                      <span className="rounded-lg bg-[var(--color-gold-500)]/15 px-2.5 py-1 text-[13px] font-black tabular-nums text-[var(--color-gold-300)]">{s.value}</span>
                    </div>
                    <input
                      type="range"
                      min={18}
                      max={99}
                      value={s.value}
                      onChange={(e) => s.set(Number(e.target.value))}
                      className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-pearl)]"
                      style={{ background: `linear-gradient(to right, var(--color-gold-500) 0%, var(--color-gold-500) ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)` }}
                    />
                  </div>
                );
              })}
            </div>
            <Field label="Maximum distance">
              <div className="flex flex-wrap gap-2">
                {DISTANCES.map((o) => {
                  const active = d.distanceKm === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setD({ distanceKm: o.value })}
                      aria-pressed={active}
                      className={`h-[40px] rounded-full border px-4 text-[13px] font-bold transition ${
                        active
                          ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/15 text-[var(--color-pearl)]"
                          : "border-white/10 bg-white/[0.02] text-[var(--color-sand)] hover:border-white/20"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Show me">
              <div className="flex flex-wrap gap-2">
                {Object.entries(GENDER_LABELS).map(([value, label]) => {
                  const active = d.showGenders.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setD({
                          showGenders: active ? d.showGenders.filter((g) => g !== value) : [...d.showGenders, value],
                        })
                      }
                      aria-pressed={active}
                      className={`h-[40px] rounded-full border px-4 text-[13px] font-bold transition ${
                        active
                          ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/15 text-[var(--color-pearl)]"
                          : "border-white/10 bg-white/[0.02] text-[var(--color-sand)] hover:border-white/20"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow label="Verified members only" body="Only profiles with trust verification." value={d.verifiedOnly} onChange={(v) => setD({ verifiedOnly: v })} />
              <ToggleRow label="Require photos" body="Hide profiles without at least one photo." value={d.photosRequired} onChange={(v) => setD({ photosRequired: v })} />
            </div>
            <SaveRow
              state={discoveryState}
              onSave={async () => {
                setDiscoveryState("saving");
                const ok = await post({ discovery: d });
                setDiscoveryState(ok ? "saved" : "error");
                setTimeout(() => setDiscoveryState("idle"), 2500);
              }}
            />
          </div>
        ) : null}

        {area === "notifications" ? (
          <div className="space-y-3.5">
            <PanelTitle title="Alerts" blurb="Choose what reaches you. Saves as you flip them." />
            <ToggleRow label="New matches" body="When someone likes you back." value={n.matchAlerts} onChange={(v) => void setN("matchAlerts", v)} />
            <ToggleRow label="Messages" body="When a conversation gets a new message." value={n.messageAlerts} onChange={(v) => void setN("messageAlerts", v)} />
            <ToggleRow label="Likes" body="When someone likes your profile." value={n.likeAlerts} onChange={(v) => void setN("likeAlerts", v)} />
            <ToggleRow label="Profile activity" body="Occasional tips about your profile's reach." value={n.profileActivity} onChange={(v) => void setN("profileActivity", v)} />
          </div>
        ) : null}

        {area === "privacy" ? (
          <div className="space-y-3.5">
            <PanelTitle title="Privacy" blurb="You decide when you're visible. Nothing else changes while you're hidden." />
            <ToggleRow
              label="Discoverable"
              body="Off means you won't appear in anyone's Discover — matches and chats keep working."
              value={p.discoverable}
              onChange={async (v) => {
                setP({ discoverable: v });
                await post({ profile: { discoverable: v } });
              }}
            />
            <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-[12px] leading-5 text-[var(--color-ash)]">
              Email, full birth date, and exact coordinates are never shown publicly — that's fixed, not a setting.
            </p>
          </div>
        ) : null}

        {area === "preferences" ? (
          <div className="space-y-4">
            <PanelTitle title="Preferences" blurb="How Freeborn feels for you. Saved on this device." />
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-sand)]">Distance units</p>
              <div className="mt-3 flex gap-2">
                {(["km", "mi"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setPref("units", u)}
                    aria-pressed={prefs.units === u}
                    className={`flex-1 rounded-full border px-4 py-2.5 text-[14px] font-bold transition ${
                      prefs.units === u
                        ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/15 text-[var(--color-pearl)]"
                        : "border-white/10 bg-white/[0.02] text-[var(--color-sand)]"
                    }`}
                  >
                    {u === "km" ? "Kilometers" : "Miles"}
                  </button>
                ))}
              </div>
            </div>
            <ToggleRow label="Card animations" body="Smooth card transitions and photo motion." value={prefs.animations} onChange={(v) => setPref("animations", v)} />
            <ToggleRow label="Haptics" body="Gentle vibration on likes and matches (supported devices)." value={prefs.haptics} onChange={(v) => setPref("haptics", v)} />
            <ToggleRow label="Notification sounds" body="Play a soft sound for new matches and messages." value={prefs.sounds} onChange={(v) => setPref("sounds", v)} />
          </div>
        ) : null}

        {area === "account" ? (
          <div className="space-y-4">
            <PanelTitle title="Account" blurb="The quiet details." />
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-sand)]">Email (private)</p>
              <p className="mt-1 truncate text-[14px] font-medium text-[var(--color-mist)]">{settings.account.email}</p>
            </div>
            <form method="POST" action="/auth/signout">
              <button
                type="submit"
                className="rounded-full border border-white/10 bg-white/[0.03] px-7 py-3 text-[13px] font-bold text-[var(--color-mist)] transition hover:border-white/25 hover:text-[var(--color-pearl)]"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
