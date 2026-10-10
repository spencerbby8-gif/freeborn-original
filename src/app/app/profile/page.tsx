"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app/app-shell";
import { openVerifyFlow } from "@/components/app/verify-modal";
import { ProfileView } from "@/components/app/profile-view";
import { CameraCapture } from "@/components/camera-capture";
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
  const [profile, setProfile] = useState<(MeProfile & { id?: string }) | null>(null);
  const [completeness, setCompleteness] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<MeProfile>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [viewAs, setViewAs] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  /** Live verification status — banners always reflect the current state. */
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null);

  /** Animated completion reader — counts up while the bar fills. */
  const [displayPct, setDisplayPct] = useState(0);
  useEffect(() => {
    const target = Math.max(0, Math.min(100, completeness));
    let raf = 0;
    const t0 = performance.now();
    const from = 0;
    const DUR = 1100;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / DUR);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplayPct(Math.round(from + (target - from) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [completeness]);

  useEffect(() => {
    void (async () => {
      const token = await getAccessToken().catch(() => null);
      if (!token) return;
      try {
        const res = await fetch("/api/verification", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setVerifyStatus(json.status ?? "none");
        }
      } catch {
        /* banner falls back to the reminder state */
      }
    })();
  }, []);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoManagerOpen, setPhotoManagerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const dragIdx = useRef<number | null>(null);

  /** Drag (or arrows) to reorder — optimistic UI, then persisted. */
  const reorderPhotos = async (from: number, to: number) => {
    if (!profile || from === to || to < 0 || to >= profile.photos.length) return;
    const newOrder = [...profile.photos];
    const [moved] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, moved);
    setProfile({ ...profile, photos: newOrder });
    const token = await getAccessToken().catch(() => null);
    await fetch("/api/profile/photos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: "reorder", order: newOrder }),
    }).catch(() => undefined);
  };

  /** Live camera capture → straight into the upload pipeline. */
  const handleCameraCapture = (dataUrl: string) => {
    setCameraOpen(false);
    void uploadPhoto(dataUrl);
  };

  const uploadPhoto = useCallback(
    async (dataUrl: string) => {
      setPhotoBusy(true);
      try {
        const token = await getAccessToken().catch(() => null);
        const res = await fetch("/api/profile/photos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ data: dataUrl }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          setPhotoMsg("Photo saved to your profile.");
          // A new face photo invalidates the identity check — flip the banner
          // to the "Verify your identity" reminder immediately, no reload.
          setProfile((prev) => (prev ? { ...prev, isVerified: false } : prev));
        } else {
          setPhotoMsg(json.error ?? "Couldn't add that photo.");
        }
        setTimeout(() => setPhotoMsg(null), 5000);
      } finally {
        setPhotoBusy(false);
        void load(); // refresh the verified/re-verify banner immediately
      }
    },
    []
  );

  const deletePhoto = useCallback(async (path: string) => {
    const token = await getAccessToken().catch(() => null);
    const res = await fetch("/api/profile/photos", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ path }),
    });
    const json = await res.json().catch(() => ({}));
    setPhotoMsg(res.ok ? "Photo removed." : json.error ?? "Couldn't remove that photo here.");
    setTimeout(() => setPhotoMsg(null), 5000);
    if (res.ok) {
      setProfile((prev) => (prev ? { ...prev, photos: prev.photos.filter((p) => p !== path) } : prev));
    }
  }, []);

  /**
   * Shrink photos on-device before uploading. A 12MP phone photo becomes a
   * ~250KB JPEG, so "Add more photos" lands almost instantly instead of
   * crawling on mobile connections.
   */
  const downscaleImage = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 1440;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas unavailable");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch (err) {
          reject(err instanceof Error ? err : new Error("resize failed"));
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("decode failed"));
      };
      img.src = url;
    });

  const onPhotoPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const useDataUrl = (dataUrl: string) => {
      if (profile?.isVerified) {
        setPendingPhoto(dataUrl); // heads-up before the identity re-check
      } else {
        void uploadPhoto(dataUrl);
      }
    };
    void downscaleImage(file).then(useDataUrl).catch(() => {
      const reader = new FileReader();
      reader.onload = () => useDataUrl(String(reader.result));
      reader.readAsDataURL(file);
    });
  };

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
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {editing ? "Edit profile" : "Your profile"}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-mist)]">
            {editing ? "Fine-tune how others see you." : "How others see you in the room."}
          </p>
        </div>
        {editing ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Back to profile"
            title="Back to profile"
            className="btn-ghost flex h-[42px] w-[42px] items-center justify-center rounded-full px-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        ) : null}
        {!editing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startEdit}
              className="btn-ember btn-shine relative overflow-hidden rounded-full px-5 py-2.5 text-[13px] font-bold"
            >
              Edit profile
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setActionsOpen((o) => !o)}
                aria-label="More profile actions"
                aria-expanded={actionsOpen}
                title="More actions"
                className="btn-ghost flex h-[42px] w-[42px] items-center justify-center rounded-full px-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              {actionsOpen ? (
                <>
                  <div className="fixed inset-0 z-[90]" onClick={() => setActionsOpen(false)} />
                  <div className="animate-scale-in absolute right-0 top-[50px] z-[95] w-[230px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#10141f] shadow-[0_30px_80px_-16px_rgba(0,0,0,0.9)]">
                    {profile?.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActionsOpen(false);
                          setViewAs(profile.id ?? null);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] font-bold text-[var(--color-pearl)] transition hover:bg-white/[0.05]"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        View as others
                      </button>
                    ) : null}
                    <a
                      href="/app/settings"
                      onClick={() => setActionsOpen(false)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] font-bold text-[var(--color-pearl)] transition hover:bg-white/[0.05] ${profile?.id ? "border-t border-white/[0.06]" : ""}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.2a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.2a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.2a1.7 1.7 0 001 1.5h.1a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1h.2a2 2 0 110 4h-.2a1.7 1.7 0 00-1.5 1z" />
                      </svg>
                      Settings
                    </a>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Identity check status */}
      {profile.isVerified ? (
        <div className="mt-6 flex items-center gap-3 rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[var(--color-teal-300)]">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 2.5l7.5 3v5.2c0 5-3.2 8.6-7.5 10.3-4.3-1.7-7.5-5.3-7.5-10.3V5.5l7.5-3z" />
              <path d="M8.8 12l2.2 2.2 4.2-4.6" />
            </svg>
          </span>
          <div>
            <p className="text-[14px] font-black text-[var(--color-pearl)]">
              Identity check complete · <span className="text-[var(--color-teal-300)]">Result: approved</span>
            </p>
            <p className="mt-0.5 text-[12px] leading-4 text-[var(--color-mist)]">
              Your profile is confirmed — thanks for keeping the room real.
            </p>
          </div>
        </div>
      ) : verifyStatus === "rejected" ? (
        <div className="mt-6 flex items-center gap-4 rounded-[22px] border border-red-400/35 bg-red-500/[0.07] p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-red-300">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M9 9l6 6M15 9l-6 6" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-black text-[var(--color-pearl)]">
              Result: not approved this time
            </p>
            <p className="mt-0.5 text-[12px] leading-4 text-[var(--color-mist)]">
              The selfie didn't pass — bright, even light and a clear face fix most cases. Try again.
            </p>
          </div>
          <button
            type="button"
            onClick={openVerifyFlow}
            className="shrink-0 rounded-full bg-[var(--gradient-ember-warm)] px-4 py-2.5 text-[12px] font-black text-white shadow-[var(--shadow-primary-btn)] transition active:scale-95"
          >
            Retry
          </button>
        </div>
      ) : verifyStatus === "pending" ? (
        <div className="mt-6 flex items-center gap-4 rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/10 text-[var(--color-gold-300)]">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-black text-[var(--color-pearl)]">Verification in review</p>
            <p className="mt-0.5 text-[12px] leading-4 text-[var(--color-mist)]">
              Your selfie was submitted and is being checked. We'll confirm it shortly — nothing else needed.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex items-center gap-4 rounded-[22px] border border-[var(--color-gold-500)]/35 bg-[var(--color-gold-500)]/[0.06] p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/10 text-[var(--color-gold-300)]">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 2.5l7.5 3v5.2c0 5-3.2 8.6-7.5 10.3-4.3-1.7-7.5-5.3-7.5-10.3V5.5l7.5-3z" />
              <path d="M8.8 12l2.2 2.2 4.2-4.6" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-black text-[var(--color-pearl)]">Verify your identity</p>
            <p className="mt-0.5 text-[12px] leading-4 text-[var(--color-mist)]">
              A quick selfie check confirms your profile and keeps the room safe.
            </p>
          </div>
          <button
            type="button"
            onClick={openVerifyFlow}
            className="shrink-0 rounded-full bg-[var(--gradient-ember-warm)] px-4 py-2.5 text-[12px] font-black text-white shadow-[var(--shadow-primary-btn)] transition active:scale-95"
          >
            Verify now
          </button>
        </div>
      )}

      {/* Completion */}
      <div className="mt-6 rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--color-sand)]">Profile completion</span>
          <span className="font-display text-xl font-semibold tabular-nums text-[var(--color-gold-300)]">{displayPct}%</span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-[var(--gradient-ember-warm)]"
            style={{ width: `${displayPct}%` }}
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
        <span className="relative shrink-0">
          {profile.photos[0] ? (
            <img src={profile.photos[0]} alt={profile.displayName} className="h-20 w-20 rounded-full border border-white/10 object-cover" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] font-display text-2xl font-bold text-white">
              {(profile.displayName || "You").charAt(0)}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold text-[var(--color-pearl)]">
            {profile.displayName || "Add your name"}
            {profile.age ? `, ${profile.age}` : ""}
          </p>
          <p className="text-[13px] text-[var(--color-mist)]">
            {[profile.city, profile.region].filter(Boolean).join(", ") || "Add your city"}
          </p>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPhotoPicked}
        />
        <button
          type="button"
          disabled={photoBusy}
          onClick={() => setPhotoManagerOpen(true)}
          className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12px] font-bold text-[var(--color-sand)] transition hover:bg-white/[0.09] hover:text-[var(--color-pearl)] disabled:opacity-50"
        >
          Manage photos
        </button>
      </div>

      {/* Photo manager — onboarding-style grid */}
      {photoManagerOpen ? (
        <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Manage photos">
          <div className="animate-scale-in w-full max-w-[440px] rounded-[28px] border border-white/[0.09] bg-[#0c101d] p-5 shadow-[0_50px_120px_-24px_rgba(0,0,0,0.95)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-[19px] font-semibold text-[var(--color-pearl)]">Your photos</p>
                <p className="mt-0.5 text-[12px] text-[var(--color-mist)]">
                  {profile.photos.length}/6 slots · first photo is your card photo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhotoManagerOpen(false)}
                aria-label="Close photo manager"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-[var(--color-mist)] transition hover:bg-white/[0.12] hover:text-[var(--color-pearl)]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <p className="mt-3 text-[11px] font-bold text-[var(--color-ash)]">
              Drag a photo to move it · ✕ deletes · first one is your card photo
            </p>
            <div className="mt-2.5 grid grid-cols-3 gap-2.5">
              {profile.photos.map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  draggable
                  onDragStart={() => {
                    dragIdx.current = i;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIdx.current !== null) {
                      void reorderPhotos(dragIdx.current, i);
                      dragIdx.current = null;
                    }
                  }}
                  className="relative cursor-grab active:cursor-grabbing"
                >
                  <img
                    src={src}
                    alt={`Profile photo ${i + 1}`}
                    draggable={false}
                    className="aspect-[3/4] w-full rounded-2xl border border-white/10 object-cover"
                  />
                  {i === 0 ? (
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-[var(--color-gold-500)]/90 px-1.5 py-px text-[8.5px] font-black uppercase tracking-wider text-black">
                      Card
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void deletePhoto(src)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white ring-1 ring-white/25 transition hover:bg-black"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                  {/* Move arrows — work on touch where drag doesn't */}
                  <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                    <button
                      type="button"
                      onClick={() => void reorderPhotos(i, i - 1)}
                      disabled={i === 0}
                      aria-label="Move photo earlier"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white ring-1 ring-white/25 transition hover:bg-black disabled:opacity-30"
                    >
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M8 1.5L3.5 6 8 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => void reorderPhotos(i, i + 1)}
                      disabled={i === profile.photos.length - 1}
                      aria-label="Move photo later"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white ring-1 ring-white/25 transition hover:bg-black disabled:opacity-30"
                    >
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M4 1.5L8.5 6 4 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              {profile.photos.length < 6 ? (
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => photoInputRef.current?.click()}
                  className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] text-[var(--color-mist)] transition hover:border-white/30 hover:bg-white/[0.05] disabled:opacity-50"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span className="text-[10.5px] font-black uppercase tracking-wider">
                    {photoBusy ? "Adding…" : "Gallery"}
                  </span>
                </button>
              ) : null}
              {profile.photos.length < 6 ? (
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => setCameraOpen(true)}
                  className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/[0.05] text-[var(--color-gold-300)] transition hover:bg-[var(--color-gold-500)]/[0.1] disabled:opacity-50"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 8.2h3l1.6-2.4h6.8L17 8.2h3a1.5 1.5 0 011.5 1.5v8.6A1.5 1.5 0 0120 19.8H4a1.5 1.5 0 01-1.5-1.5V9.7A1.5 1.5 0 014 8.2z" />
                    <circle cx="12" cy="13.6" r="3.4" />
                  </svg>
                  <span className="text-[10.5px] font-black uppercase tracking-wider">Camera</span>
                </button>
              ) : null}
            </div>

            <p className="mt-4 rounded-xl border border-[var(--color-gold-500)]/25 bg-[var(--color-gold-500)]/[0.06] px-3.5 py-2.5 text-[11.5px] leading-4 text-[var(--color-gold-300)]">
              Adding a new photo may trigger a quick identity re-check — that's how
              members know every profile still matches the real person.
            </p>
          </div>
        </div>
      ) : null}

      {photoMsg ? (
        <p className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[12.5px] font-bold text-[var(--color-sand)]">
          {photoMsg}
        </p>
      ) : null}

      {/* New-photo warning: the teal seal is tied to your current photos */}
      {pendingPhoto ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="animate-scale-in w-full max-w-[400px] rounded-[24px] border border-[var(--color-gold-500)]/30 bg-[#0c101d] p-6 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)]">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/10 text-[var(--color-gold-300)]">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3l9 16H3l9-16z" />
                  <path d="M12 10v4M12 17h.01" />
                </svg>
              </span>
              <div>
                <p className="font-display text-[18px] font-semibold text-[var(--color-pearl)]">
                  New photo, fresh check
                </p>
                <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--color-mist)]">
                  Your identity check covers the photos currently on your profile. Adding a
                  new photo may ask for a quick re-check afterward — that's how members know
                  every profile still matches the real person.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const data = pendingPhoto;
                  setPendingPhoto(null);
                  if (data) void uploadPhoto(data);
                }}
                className="flex-1 rounded-full bg-[var(--gradient-ember-warm)] py-3 text-[13px] font-black text-white transition active:scale-[0.98]"
              >
                Add it & re-check after
              </button>
              <button
                type="button"
                onClick={() => setPendingPhoto(null)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-[13px] font-bold text-[var(--color-mist)] transition hover:text-[var(--color-pearl)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewAs ? <ProfileView profileId={viewAs} onClose={() => setViewAs(null)} /> : null}

      {cameraOpen ? (
        <CameraCapture onCapture={handleCameraCapture} onClose={() => setCameraOpen(false)} />
      ) : null}

      {!editing ? (
        <div className="mt-6 space-y-4">
          {/* Every photo, inline — exactly what appears on your discover cards */}
          {profile.photos.length > 0 ? (
            <div className="overflow-hidden rounded-[24px] border border-white/[0.07] bg-white/[0.025]">
              <div className="flex items-center justify-between px-5 pt-4">
                <div className="flex items-center gap-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-gold-500)]">
                    Your photos
                  </p>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10.5px] font-black tabular-nums text-[var(--color-sand)]">
                    {profile.photos.length}/6
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPhotoManagerOpen(true)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-bold text-[var(--color-sand)] transition hover:bg-white/[0.09] hover:text-[var(--color-pearl)]"
                >
                  Manage
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2.5 p-4">
                {profile.photos.map((src, i) => (
                  <div key={`${src}-${i}`} className="group relative overflow-hidden rounded-2xl border border-white/10">
                    <img
                      src={src}
                      alt={`Your photo ${i + 1}`}
                      className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    {i === 0 ? (
                      <span className="absolute left-1.5 top-1.5 rounded-md bg-[var(--color-gold-500)]/90 px-1.5 py-px text-[8.5px] font-black uppercase tracking-wider text-black">
                        Card
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {profile.bio ? (
            <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-gold-500)]">About me</p>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ivory)]">{profile.bio}</p>
            </div>
          ) : null}

          {/* The details — a clean, editorial two-column register */}
          <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] px-5 py-2">
            <p className="pt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-gold-500)]">
              The details
            </p>
            <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
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
                  <div
                    key={f.label}
                    className="flex items-baseline justify-between gap-4 border-b border-white/[0.05] py-3 last:border-b-0"
                  >
                    <p className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-ash)]">
                      {f.label}
                    </p>
                    <p className="text-right text-[13.5px] font-semibold text-[var(--color-ivory)]">{f.value}</p>
                  </div>
                ))}
            </div>
          </div>

          {profile.values.length || profile.interests.length || profile.lifestyle.length ? (
            <div className="space-y-4 rounded-[20px] border border-white/[0.07] bg-white/[0.025] px-5 py-4">
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
              {profile.lifestyle.length ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-gold-500)]">How you live</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {profile.lifestyle.map((v) => (
                      <span key={v} className="rounded-full border border-white/[0.07] bg-pearl/5 px-3 py-1 text-[11px] font-semibold text-sand">{v}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {profile.relationshipGoals.length ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-gold-500)]">Looking for</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {profile.relationshipGoals.map((v) => (
                      <span key={v} className="rounded-full border border-[var(--color-ember-500)]/30 bg-[var(--color-ember-500)]/[0.07] px-3 py-1 text-[11px] font-semibold text-[#ffb4a6]">{v.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Growth: niche communities scale one trusted invite at a time */}
          <div className="rounded-[24px] border border-[var(--color-gold-500)]/25 bg-[var(--color-gold-500)]/[0.05] p-5">
            <p className="font-display text-[17px] font-semibold text-[var(--color-pearl)]">
              Know someone who belongs here?
            </p>
            <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--color-mist)]">
              Freeborn grows through trusted invitations. Share it with someone who shares
              your values — every real member makes the room better for everyone.
            </p>
            <button
              type="button"
              onClick={() => {
                const link = `${window.location.origin}/?ref=${encodeURIComponent(profile.displayName || "member")}`;
                void navigator.clipboard.writeText(link).catch(() => undefined);
                setInviteCopied(true);
                setTimeout(() => setInviteCopied(false), 2400);
              }}
              className="mt-3.5 rounded-full bg-[var(--gradient-ember-warm)] px-5 py-2.5 text-[12.5px] font-black text-white shadow-[var(--shadow-primary-btn)] transition active:scale-95"
            >
              {inviteCopied ? "Invite link copied ✓" : "Copy your invite link"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {/* Photos — change, delete, re-upload or snap directly from the edit screen */}
          <div className="rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-bold uppercase tracking-wider text-[var(--color-sand)]">Your photos</p>
                <p className="mt-0.5 text-[12px] text-[var(--color-mist)]">
                  {profile.photos.length}/6 slots · first photo is your card photo
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10.5px] font-black uppercase tracking-wider text-[var(--color-ash)]">
                Edit mode
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {profile.photos.map((src, i) => (
                <div key={`${src}-${i}`} className="relative">
                  <img
                    src={src}
                    alt={`Profile photo ${i + 1}`}
                    className="aspect-[3/4] w-full rounded-2xl border border-white/10 object-cover"
                  />
                  {i === 0 ? (
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-[var(--color-gold-500)]/90 px-1.5 py-px text-[8.5px] font-black uppercase tracking-wider text-black">
                      Card
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void deletePhoto(src)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white ring-1 ring-white/25 transition hover:bg-black"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                  <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                    <button
                      type="button"
                      onClick={() => void reorderPhotos(i, i - 1)}
                      disabled={i === 0}
                      aria-label="Move photo earlier"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white ring-1 ring-white/25 transition hover:bg-black disabled:opacity-30"
                    >
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M8 1.5L3.5 6 8 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => void reorderPhotos(i, i + 1)}
                      disabled={i === profile.photos.length - 1}
                      aria-label="Move photo later"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white ring-1 ring-white/25 transition hover:bg-black disabled:opacity-30"
                    >
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M4 1.5L8.5 6 4 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              {profile.photos.length < 6 ? (
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => photoInputRef.current?.click()}
                  className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] text-[var(--color-mist)] transition hover:border-white/30 hover:bg-white/[0.05] disabled:opacity-50"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span className="text-[10.5px] font-black uppercase tracking-wider">
                    {photoBusy ? "Adding…" : "Gallery"}
                  </span>
                </button>
              ) : null}
              {profile.photos.length < 6 ? (
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => setCameraOpen(true)}
                  className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/[0.05] text-[var(--color-gold-300)] transition hover:bg-[var(--color-gold-500)]/[0.1] disabled:opacity-50"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 8.2h3l1.6-2.4h6.8L17 8.2h3a1.5 1.5 0 011.5 1.5v8.6A1.5 1.5 0 0120 19.8H4a1.5 1.5 0 01-1.5-1.5V9.7A1.5 1.5 0 014 8.2z" />
                    <circle cx="12" cy="13.6" r="3.4" />
                  </svg>
                  <span className="text-[10.5px] font-black uppercase tracking-wider">Camera</span>
                </button>
              ) : null}
            </div>
            <p className="mt-3 rounded-xl border border-[var(--color-gold-500)]/25 bg-[var(--color-gold-500)]/[0.06] px-3.5 py-2.5 text-[11.5px] leading-4 text-[var(--color-gold-300)]">
              Delete, reorder, re-upload from your gallery, or snap a fresh photo — adding a
              new photo may trigger a quick identity re-check.
            </p>
          </div>
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
