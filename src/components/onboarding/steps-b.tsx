"use client";

import { useMemo, useState, type FormEvent } from "react";
import { StepShell } from "./step-shell";
import { ComboField, OnboardingTextarea } from "./fields";
import { CheckIcon } from "@/components/icons";
import { ChipSelect } from "./chip-select";
import { CameraCapture } from "@/components/camera-capture";
import {
  detectUnsafeContactDetails,
  educationOptions,
  explainUnsafeContactDetails,
  interestOptions,
  lifestyleOptions,
  occupationOptions,
  onboardingFieldHints,
  validateBio,
  validateCount,
  type OnboardingDraft,
  type StepErrors,
} from "@/lib/onboarding-data";
import type { StepProps } from "./steps-a";

/* --- 5 · About you (bio + optional work/education) ------------------------- */

function SafetyPanel({ values }: { values: string[] }) {
  const issues = values.flatMap((value) => detectUnsafeContactDetails(value));
  if (!issues.length) return null;
  const unique = issues.filter((issue, index) => issues.findIndex((item) => item.type === issue.type) === index);
  return (
    <div className="animate-scale-in rounded-[24px] border border-red-400/25 bg-red-500/[0.07] p-4 text-sm shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-400/10 text-red-200">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l7.5 3v5.2c0 4.8-3.2 8.1-7.5 9.8-4.3-1.7-7.5-5-7.5-9.8V6L12 3z" />
            <path d="M9 11.8l2.1 2.1L15.4 9" />
          </svg>
        </div>
        <div>
          <p className="font-black text-red-100">Contact details protected</p>
          <p className="mt-1 text-xs leading-5 text-red-100/75">{explainUnsafeContactDetails(unique)}</p>
        </div>
      </div>
    </div>
  );
}

export function AboutStep({ stepIndex, totalSteps, draft, onBack, onSave, pending, saveStatus }: StepProps) {
  const [bio, setBio] = useState(draft.bio);
  const [occupation, setOccupation] = useState(draft.occupation);
  const [education, setEducation] = useState(draft.education);
  const [vaccinationStatus, setVaccinationStatus] = useState(draft.vaccinationStatus || "prefer_not_to_say");
  const [errors, setErrors] = useState<StepErrors>({});

  const unsafeIssues = useMemo(() => [bio, occupation, education], [bio, occupation, education]);

  const handleContinue = (e?: FormEvent) => {
    e?.preventDefault();
    const message = validateBio(bio);
    if (message) {
      setErrors({ bio: message });
      return;
    }
    setErrors({});
    onSave({
      bio: bio.trim(),
      occupation: occupation.trim(),
      education: education.trim(),
      vaccinationStatus,
    });
  };

  const vaxOptions = [
    { value: "unvaccinated", label: "Unvaccinated", caption: "I identify as unvaccinated." },
    { value: "vaccinated", label: "Vaccinated", caption: "I identify as vaccinated." },
    { value: "prefer_not_to_say", label: "Prefer not to say", caption: "I'd rather keep this private." },
  ];

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Write your first impression."
      subtitle="Short, human, grounded — what lights you up and what feels meaningful."
      onBack={onBack}
      onContinue={handleContinue}
      pending={pending}
      saveStatus={saveStatus}
      footerTip="No phone numbers, emails, or handles — safety checks keep your contact info private."
    >
      <SafetyPanel values={unsafeIssues} />

      <OnboardingTextarea
        label="Short bio"
        name="bio"
        placeholder="What you value, how you spend a good Sunday, and what feels meaningful to you."
        value={bio}
        error={errors.bio}
        hint={onboardingFieldHints.bio}
        rows={4}
        maxLength={500}
        counter={{ value: bio.length, max: 500 }}
        onChange={(e) => {
          setBio(e.target.value.slice(0, 500));
          if (errors.bio) setErrors((prev) => ({ ...prev, bio: "" }));
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <ComboField
          label="Occupation"
          placeholder="Pick or type your own"
          value={occupation}
          onChange={setOccupation}
          options={occupationOptions}
          hint={onboardingFieldHints.occupation}
          optional
        />
        <ComboField
          label="Education"
          placeholder="Pick or type your own"
          value={education}
          onChange={setEducation}
          options={educationOptions}
          hint={onboardingFieldHints.education}
          optional
        />
      </div>

      {/* Vaccination stance */}
      <div className="space-y-3">
        <div className="px-1">
          <span className="fb-eyebrow !text-[12px]">Vaccination stance</span>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-mist)]">
            Shown as a badge on your profile so you can find people aligned with you. You can keep it private.
          </p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {vaxOptions.map((o) => {
            const active = vaccinationStatus === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setVaccinationStatus(o.value)}
                aria-pressed={active}
                className={`relative min-h-[56px] rounded-2xl border p-4 pr-11 text-left transition-all active:scale-[0.98] ${
                  active
                    ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/10 shadow-[0_0_20px_-5px_rgba(217,167,82,0.15)]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                }`}
              >
                <span className={`block text-[14px] font-black ${active ? "text-[var(--color-pearl)]" : "text-[var(--color-sand)]"}`}>
                  {o.label}
                </span>
                <span className="mt-1 block text-[12px] leading-4 text-[var(--color-mist)]">{o.caption}</span>
                <span
                  className={`absolute right-3.5 top-3.5 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    active
                      ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)] text-[var(--color-ink)]"
                      : "border-white/10 bg-black/20 text-transparent"
                  }`}
                >
                  <CheckIcon size={13} strokeWidth={3} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </StepShell>
  );
}

/* --- 6 · Your vibe (lifestyle + interests, one screen) ---------------------- */

export function VibeStep({ stepIndex, totalSteps, draft, onBack, onSave, pending, saveStatus }: StepProps) {
  const [lifestyle, setLifestyle] = useState<string[]>(draft.lifestyle_preferences);
  const [interests, setInterests] = useState<string[]>(draft.interests);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = (e?: FormEvent) => {
    e?.preventDefault();
    const lifestyleError = validateCount(lifestyle, 1, 8, "Pick at least one lifestyle cue.", "Keep it to 8 lifestyle cues.");
    if (lifestyleError) {
      setError(lifestyleError);
      return;
    }
    const interestsError = validateCount(
      interests,
      3,
      10,
      "Pick at least three interests — they start conversations.",
      "Keep it to 10 interests."
    );
    if (interestsError) {
      setError(interestsError);
      return;
    }
    setError(null);
    onSave({ lifestyle_preferences: lifestyle, interests });
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Show your vibe."
      subtitle="How you actually live, and the things people can start a conversation from."
      onBack={onBack}
      onContinue={handleContinue}
      pending={pending}
      saveStatus={saveStatus}
      error={error}
      footerTip="Specific beats exhaustive — pick what's really you."
    >
      <ChipSelect
        label="Lifestyle"
        options={lifestyleOptions}
        value={lifestyle}
        onChange={(next) => {
          setLifestyle(next);
          if (error) setError(null);
        }}
        max={8}
        hint="The cues that shape your days."
      />

      <ChipSelect
        label="Interests"
        options={interestOptions}
        value={interests}
        onChange={(next) => {
          setInterests(next);
          if (error) setError(null);
        }}
        max={10}
        hint="What would a great Saturday include?"
      />
    </StepShell>
  );
}

/* --- 7 · Photos (final screen) ---------------------------------------------- */

const MAX_PHOTOS = 6;

/** Downscale + 4:5 center crop via canvas, returns a compact JPEG data URL. */
async function processPhoto(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode failed"));
    image.src = dataUrl;
  });

  const targetRatio = 4 / 5;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (img.width / img.height > targetRatio) {
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetRatio;
    sy = (img.height - sh) / 2;
  }

  // Guard: tiny source images must never round down to a zero-size canvas.
  // 600px @ 0.75 keeps each photo ~40-70KB: fast to upload, sharp enough to swipe.
  const outW = Math.max(1, Math.round(Math.min(600, sw)));
  const outH = Math.max(1, Math.round(outW / targetRatio));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  return canvas.toDataURL("image/jpeg", 0.75);
}

export function PhotosStep({ stepIndex, totalSteps, draft, onBack, onSave, pending, saveStatus }: StepProps) {
  const [photos, setPhotos] = useState<OnboardingDraft["photos"]>(draft.photos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);

  /** Live capture lands as an already 4:5-cropped JPEG — straight into the grid. */
  const handleCapture = (dataUrl: string) => {
    setCameraOpen(false);
    setPhotos((prev) => {
      if (prev.length >= MAX_PHOTOS) return prev;
      let next = [
        ...prev,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, src: dataUrl, isCover: false },
      ];
      if (!next.some((p) => p.isCover) && next.length) {
        next = next.map((p, i) => ({ ...p, isCover: i === 0 }));
      }
      return next;
    });
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    setError(null);
    try {
      const room = MAX_PHOTOS - photos.length;
      const list = Array.from(files).slice(0, Math.max(0, room));
      const processed: OnboardingDraft["photos"] = [];
      for (const file of list) {
        const src = await processPhoto(file);
        processed.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, src, isCover: false });
      }
      setPhotos((prev) => {
        let next = [...prev, ...processed];
        if (!next.some((p) => p.isCover) && next.length) {
          next = next.map((p, i) => ({ ...p, isCover: i === 0 }));
        }
        return next;
      });
    } catch {
      setError("That image couldn't be processed. Try a different photo.");
    } finally {
      setBusy(false);
      setInputKey((k) => k + 1);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    setPhotos((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const setCover = (id: string) =>
    setPhotos((prev) => prev.map((p) => ({ ...p, isCover: p.id === id })));

  const remove = (id: string) =>
    setPhotos((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (next.length && !next.some((p) => p.isCover)) {
        next[0] = { ...next[0], isCover: true };
      }
      return next;
    });

  const handleContinue = (e?: FormEvent) => {
    e?.preventDefault();
    if (photos.length < 3) {
      setError(
        `Add at least 3 photos before continuing — ${photos.length}/3 so far. Real, recent photos are how members trust each other.`
      );
      return;
    }
    setError(null);
    onSave({ photos });
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Your photo foundation."
      subtitle="Add at least 3 recent photos (up to 6) — then you're in. They're cropped to 4:5 automatically."
      onBack={onBack}
      onContinue={handleContinue}
      continueLabel="Finish & enter Freeborn"
      pending={pending || busy}
      saveStatus={saveStatus}
      error={error}
      footerTip="Recent, recognizable, and real — like someone a person would want to meet."
    >
      <div className="flex items-center justify-between px-1">
        <span className="fb-eyebrow !text-[12px]">Your photos</span>
        <span
          className={`text-[11px] font-black uppercase tracking-widest ${
            photos.length >= 3 ? "text-[var(--color-teal-300)]" : "text-[var(--color-ash)]"
          }`}
        >
          {photos.length >= 3 ? `${photos.length} of 6 ready` : `${photos.length}/3 minimum`}
        </span>
      </div>

      <input
        key={inputKey}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <div key={photo.id} className="animate-scale-in overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <div className="relative aspect-[4/5]">
              <img src={photo.src} alt={`Profile photo ${index + 1}`} className="h-full w-full object-cover" />
              {photo.isCover ? (
                <span className="absolute left-2 top-2 rounded-full bg-[var(--gradient-ember-warm)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                  Cover
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => remove(photo.id)}
                aria-label="Remove photo"
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur transition hover:bg-black/80"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-between gap-1 p-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move photo earlier"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[var(--color-sand)] transition hover:bg-white/[0.08] disabled:opacity-30"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M8 1.5L3.5 6 8 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === photos.length - 1}
                  aria-label="Move photo later"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[var(--color-sand)] transition hover:bg-white/[0.08] disabled:opacity-30"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M4 1.5L8.5 6 4 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
              {!photo.isCover ? (
                <button
                  type="button"
                  onClick={() => setCover(photo.id)}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--color-sand)] transition hover:bg-white/[0.08]"
                >
                  Make cover
                </button>
              ) : (
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-gold-300)]">Primary</span>
              )}
            </div>
          </div>
        ))}

        {photos.length < MAX_PHOTOS ? (
          <button
            type="button"
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>('input[type="file"]');
              input?.click();
            }}
            disabled={busy}
            className="flex aspect-[4/5] flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] text-[var(--color-mist)] transition hover:border-[var(--color-gold-500)]/40 hover:bg-white/[0.04] disabled:opacity-50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]">
              {busy ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 8.2h3l1.6-2.4h6.8L17 8.2h3a1.5 1.5 0 011.5 1.5v8.6A1.5 1.5 0 0120 19.8H4a1.5 1.5 0 01-1.5-1.5V9.7A1.5 1.5 0 014 8.2z" />
                  <circle cx="12" cy="13.6" r="3.4" />
                </svg>
              )}
            </span>
            <span className="text-xs font-bold">{busy ? "Processing…" : "Add photo"}</span>
            <span className="text-[10px] text-[var(--color-ash)]">{photos.length}/{MAX_PHOTOS}</span>
          </button>
        ) : null}

        {photos.length < MAX_PHOTOS ? (
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            disabled={busy}
            className="flex aspect-[4/5] flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-[var(--color-gold-500)]/35 bg-[var(--color-gold-500)]/[0.04] text-[var(--color-gold-300)] transition hover:border-[var(--color-gold-500)]/60 hover:bg-[var(--color-gold-500)]/[0.08] disabled:opacity-50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-gold-500)]/15">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 8.2h3l1.6-2.4h6.8L17 8.2h3a1.5 1.5 0 011.5 1.5v8.6A1.5 1.5 0 0120 19.8H4a1.5 1.5 0 01-1.5-1.5V9.7A1.5 1.5 0 014 8.2z" />
                <circle cx="12" cy="13.6" r="3.4" />
              </svg>
            </span>
            <span className="text-xs font-bold">Take with camera</span>
            <span className="text-[10px] text-[var(--color-ash)]">Snap a live selfie</span>
          </button>
        ) : null}
      </div>

      {cameraOpen ? <CameraCapture onCapture={handleCapture} onClose={() => setCameraOpen(false)} /> : null}
    </StepShell>
  );
}
