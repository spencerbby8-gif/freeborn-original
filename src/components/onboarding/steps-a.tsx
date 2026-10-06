"use client";

import { useState, type FormEvent } from "react";
import { CheckIcon, PinIcon } from "@/components/icons";
import { StepShell } from "./step-shell";
import { DateOfBirthField, OnboardingTextInput, SelectMenu } from "./fields";
import { ChipSelect } from "./chip-select";
import { OptionCardRow } from "./option-card-row";
import {
  genderOptions,
  onboardingFieldHints,
  relationshipGoalOptions,
  validateCount,
  validateIdentity,
  validateLocation,
  valueOptions,
  type OnboardingDraft,
  type StepErrors,
} from "@/lib/onboarding-data";

export type StepProps = {
  stepIndex: number;
  totalSteps: number;
  draft: OnboardingDraft;
  onBack: () => void;
  onSave: (patch: Partial<OnboardingDraft>) => void;
  pending?: boolean;
  saveStatus?: string;
};

/* --- 1 · Welcome ---------------------------------------------------------- */

export function WelcomeStep({
  stepIndex,
  totalSteps,
  onSave,
  pending,
  saveStatus,
}: Omit<StepProps, "draft" | "onBack">) {
  const cards = [
    {
      title: "Seven quick screens",
      body: "No giant forms. Identity, location, intentions, your story, your vibe, and photos — then you're in.",
    },
    {
      title: "Private essentials protected",
      body: "Your exact birth date, coordinates, email, and account details never appear publicly on your profile.",
    },
    {
      title: "Built for the long term",
      body: "Intentions and values come first, so matches start with context instead of small talk.",
    },
  ];

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Welcome to a calmer way to build a profile."
      subtitle="Freeborn is designed for intentional relationships. Seven focused screens, and you're in."
      onContinue={(e?: FormEvent) => {
        e?.preventDefault();
        onSave({});
      }}
      continueLabel="Get started"
      pending={pending}
      saveStatus={saveStatus}
      footerTip="Your progress auto-saves after every screen. Fine details live in settings later."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-gold-500)]/15 text-[var(--color-gold-300)]">
                <CheckIcon size={16} />
              </div>
              <h3 className="mt-3 text-[15px] font-black text-[var(--color-pearl)]">{c.title}</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--color-mist)]">{c.body}</p>
          </div>
        ))}
      </div>
    </StepShell>
  );
}

/* --- 2 · Identity ---------------------------------------------------------- */

export function IdentityStep({ stepIndex, totalSteps, draft, onBack, onSave, pending, saveStatus }: StepProps) {
  const [displayName, setDisplayName] = useState(draft.display_name);
  const [birthDate, setBirthDate] = useState(draft.birth_date);
  const [gender, setGender] = useState(draft.gender);
  const [errors, setErrors] = useState<StepErrors>({});

  const handleContinue = (e?: FormEvent) => {
    e?.preventDefault();
    const next = validateIdentity({ display_name: displayName.trim(), birth_date: birthDate, gender });
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setErrors({});
    onSave({ display_name: displayName.trim(), birth_date: birthDate, gender });
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Start with who you are."
      subtitle="Your name, a private age gate, and how you identify."
      onBack={onBack}
      onContinue={handleContinue}
      pending={pending}
      saveStatus={saveStatus}
      footerTip="Your birth date confirms you're 18+ and displays as age only."
    >
      <OnboardingTextInput
        label="Display name"
        name="display_name"
        placeholder="How should Freeborn introduce you?"
        value={displayName}
        error={errors.display_name}
        hint={onboardingFieldHints.display_name}
        autoComplete="nickname"
        maxLength={30}
        onChange={(e) => {
          setDisplayName(e.target.value);
          if (errors.display_name) setErrors((prev) => ({ ...prev, display_name: "" }));
        }}
      />

      <DateOfBirthField
        value={birthDate}
        error={errors.birth_date}
        hint={onboardingFieldHints.birth_date}
        onChange={(val) => {
          setBirthDate(val);
          if (errors.birth_date) setErrors((prev) => ({ ...prev, birth_date: "" }));
        }}
      />

      <SelectMenu
        label="Gender"
        value={gender}
        onChange={(val) => {
          setGender(val);
          if (errors.gender) setErrors((prev) => ({ ...prev, gender: "" }));
        }}
        options={genderOptions}
        placeholder="Choose how you identify"
        error={errors.gender}
      />
    </StepShell>
  );
}

/* --- 3 · Location ----------------------------------------------------------- */

export function LocationStep({ stepIndex, totalSteps, draft, onBack, onSave, pending, saveStatus }: StepProps) {
  const [city, setCity] = useState(draft.city);
  const [region, setRegion] = useState(draft.region);
  const [countryCode, setCountryCode] = useState(draft.country_code);
  const [locationSource, setLocationSource] = useState<"manual" | "gps">(draft.location_source);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracy_m: number | null } | null>(
    draft.latitude != null && draft.longitude != null
      ? { latitude: draft.latitude, longitude: draft.longitude, accuracy_m: draft.accuracy_m }
      : null
  );
  const [geoState, setGeoState] = useState<"idle" | "locating" | "resolving" | "granted" | "denied">(
    coords ? "granted" : "idle"
  );
  const [detected, setDetected] = useState<string | null>(null);
  const [errors, setErrors] = useState<StepErrors>({});

  const resolvePlace = async (latitude: number, longitude: number) => {
    setGeoState("resolving");
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
        { signal: AbortSignal.timeout(9000) }
      );
      if (!res.ok) throw new Error("geocode failed");
      const json = (await res.json()) as {
        city?: string;
        locality?: string;
        principalSubdivision?: string;
        countryCode?: string;
      };
      const resolvedCity = (json.city || json.locality || "").trim();
      if (resolvedCity) {
        setCity(resolvedCity);
        setRegion((json.principalSubdivision || "").trim());
        setCountryCode((json.countryCode || "").toUpperCase());
        setDetected(
          `${resolvedCity}${json.principalSubdivision ? `, ${json.principalSubdivision}` : ""}${
            json.countryCode ? ` · ${json.countryCode.toUpperCase()}` : ""
          }`
        );
        setErrors((prev) => ({ ...prev, city: "" }));
      }
      setGeoState("granted");
    } catch {
      setGeoState("granted");
      setDetected(null);
    }
  };

  const handleRequestLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("denied");
      setLocationSource("manual");
      setErrors((prev) => ({
        ...prev,
        location_source: "Location is not available in this browser. Enter your city manually.",
      }));
      return;
    }
    setGeoState("locating");
    setDetected(null);
    setErrors((prev) => ({ ...prev, location_source: "" }));

    const onPosition = (pos: GeolocationPosition) => {
      setLocationSource("gps");
      const c = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy ?? null,
      };
      setCoords(c);
      setErrors((prev) => ({ ...prev, location_source: "" }));
      void resolvePlace(c.latitude, c.longitude);
    };

    // Dating needs precise distance matching: high-accuracy GPS only.
    // Phones can need a moment to spin up GPS, so we keep retrying quietly
    // (up to 4 attempts, ~15s each) instead of erroring on the first try.
    const MAX_ATTEMPTS = 4;
    const attempt = (attemptNo: number) => {
      navigator.geolocation.getCurrentPosition(
        onPosition,
        (err) => {
          // Permission problems don't fix themselves — stop and explain.
          if (err.code === err.PERMISSION_DENIED) {
            setLocationSource("manual");
            setGeoState("denied");
            const inIframe = typeof window !== "undefined" && window.self !== window.top;
            const message = inIframe
              ? "The preview panel blocks precise location even after you allow it. Use 'Open in new tab' at the top of the page — GPS works there — or type your city below."
              : "Precise location was denied in your browser settings. Allow location access for this site and try again, or type your city below.";
            setErrors((prev) => ({ ...prev, location_source: message }));
            return;
          }
          // Timeout / no fix yet — the radio may still be warming up. Retry.
          if (attemptNo < MAX_ATTEMPTS) {
            setGeoState("locating");
            window.setTimeout(() => attempt(attemptNo + 1), 700);
            return;
          }
          setLocationSource("manual");
          setGeoState("denied");
          setErrors((prev) => ({
            ...prev,
            location_source:
              "We tried four times and couldn't get a precise fix. Make sure GPS/location is on for this site and try again — or type your city below.",
          }));
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    };
    attempt(1);
  };

  const handleContinue = (e?: FormEvent) => {
    e?.preventDefault();
    const next = validateLocation({ city });
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setErrors({});
    onSave({
      city: city.trim(),
      region: region.trim(),
      country_code: countryCode,
      location_source: locationSource,
      latitude: locationSource === "gps" ? coords?.latitude ?? null : null,
      longitude: locationSource === "gps" ? coords?.longitude ?? null : null,
      accuracy_m: locationSource === "gps" ? coords?.accuracy_m ?? null : null,
    });
  };

  const sourceButton = (active: boolean) =>
    `rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${
      active
        ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/10 text-[var(--color-pearl)]"
        : "border-white/10 bg-white/[0.03] text-[var(--color-mist)] hover:bg-white/[0.06]"
    }`;

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Where are you based?"
      subtitle="One tap detects your city — or type it yourself."
      onBack={onBack}
      onContinue={handleContinue}
      pending={pending}
      saveStatus={saveStatus}
      footerTip="Only your city and region are public. Exact coordinates stay private."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setLocationSource("gps");
            handleRequestLocation();
          }}
          className={sourceButton(locationSource === "gps")}
        >
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-gold-500)]/15 text-[var(--color-gold-300)]">
              <PinIcon size={18} />
              {geoState === "locating" || geoState === "resolving" ? (
                <span className="absolute inset-0 animate-ping rounded-xl bg-[var(--color-gold-500)]/20" />
              ) : null}
            </span>
            <span className="text-sm font-black">
              {geoState === "locating"
                ? "Finding you…"
                : geoState === "resolving"
                  ? "Naming your city…"
                  : geoState === "granted"
                    ? "Location captured"
                    : "Use my location"}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-4 opacity-80">One tap — we fill in your city for you.</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setLocationSource("manual");
            setErrors((prev) => ({ ...prev, location_source: "" }));
          }}
          className={sourceButton(locationSource === "manual")}
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-[var(--color-sand)]">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </span>
            <span className="text-sm font-black">Type it myself</span>
          </div>
          <p className="mt-1.5 text-xs leading-4 opacity-80">Enter your city and region below.</p>
        </button>
      </div>

      {detected ? (
        <p className="animate-scale-in flex items-center gap-2 rounded-xl border border-[var(--color-teal-500)]/25 bg-[var(--color-teal-500)]/[0.07] px-3.5 py-2.5 text-[12px] font-bold text-[var(--color-teal-300)]" role="status">
          <CheckIcon size={13} strokeWidth={2.5} />
          Detected: {detected}
        </p>
      ) : null}

      {errors.location_source ? (
        <p className="animate-scale-in flex items-center gap-2 px-1 text-[12px] font-bold text-[var(--color-danger)]" role="alert">
          <span className="flex h-1.5 w-1.5 rounded-full bg-current" />
          {errors.location_source}
        </p>
      ) : null}

      <OnboardingTextInput
        label="City"
        name="city"
        placeholder="e.g. Austin"
        value={city}
        error={errors.city}
        hint={onboardingFieldHints.city}
        onChange={(e) => {
          setCity(e.target.value);
          if (errors.city) setErrors((prev) => ({ ...prev, city: "" }));
        }}
      />

      <OnboardingTextInput
        label="Region / state"
        name="region"
        placeholder="e.g. Texas"
        optional
        value={region}
        onChange={(e) => setRegion(e.target.value)}
      />
    </StepShell>
  );
}

/* --- 4 · Intentions (intent + values, one compact screen) -------------------- */

export function IntentionsStep({ stepIndex, totalSteps, draft, onBack, onSave, pending, saveStatus }: StepProps) {
  const [goals, setGoals] = useState<string[]>(draft.relationship_goals);
  const [values, setValues] = useState<string[]>(draft.values);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = (e?: FormEvent) => {
    e?.preventDefault();
    const intentError = validateCount(goals, 1, 3, "Choose at least one intention.", "Keep it to 3 intentions.");
    if (intentError) {
      setError(intentError);
      return;
    }
    const valuesError = validateCount(values, 1, 5, "Pick at least one value you stand on.", "Keep it to 5 values.");
    if (valuesError) {
      setError(valuesError);
      return;
    }
    setError(null);
    onSave({ relationship_goals: goals, values });
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="What are you looking for?"
      subtitle="Your intentions first, then the values you stand on. Clarity is part of chemistry."
      onBack={onBack}
      onContinue={handleContinue}
      pending={pending}
      saveStatus={saveStatus}
      error={error}
      footerTip="You can be serious about what you want without sounding rigid."
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--color-sand)]">
            Relationship intentions
          </span>
          <span className="text-[11px] font-black uppercase tracking-widest text-[var(--color-ash)]">
            {goals.length}/3
          </span>
        </div>
        <OptionCardRow
          options={relationshipGoalOptions.map((o) => ({ value: o.value, label: o.label, caption: o.caption }))}
          value={goals}
          onChange={(next) => {
            setGoals(next);
            if (error) setError(null);
          }}
          max={3}
        />
      </div>

      <ChipSelect
        label="Values you stand on"
        options={valueOptions}
        value={values}
        onChange={(next) => {
          setValues(next);
          if (error) setError(null);
        }}
        max={5}
        hint="Pick the few that genuinely shape your decisions."
      />
    </StepShell>
  );
}
