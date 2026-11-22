"use client";

import { useState, type FormEvent, type ReactNode } from "react";
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

function WelcomeIcon({ name }: { name: "route" | "shield" | "heart" }) {
  const paths: Record<string, ReactNode> = {
    route: <path d="M12 21s-7-5.6-7-11a7 7 0 0114 0c0 5.4-7 11-7 11z" />,
    shield: (
      <>
        <path d="M12 2.5l7.5 3v5.2c0 5-3.2 8.6-7.5 10.3-4.3-1.7-7.5-5.3-7.5-10.3V5.5l7.5-3z" />
        <path d="M8.8 12l2.2 2.2 4.2-4.6" />
      </>
    ),
    heart: <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.4 10.4-8.4 10.4z" />,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}

export function WelcomeStep({
  stepIndex,
  totalSteps,
  onSave,
  pending,
  saveStatus,
}: Omit<StepProps, "draft" | "onBack">) {
  const cards = [
    {
      icon: "route" as const,
      title: "Seven quick screens",
      body: "No giant forms. Identity, location, intentions, your story, your vibe, and photos, then you're in.",
    },
    {
      icon: "shield" as const,
      title: "Private essentials protected",
      body: "Your exact birth date, coordinates, email, and account details never appear publicly on your profile.",
    },
    {
      icon: "heart" as const,
      title: "Built for the long term",
      body: "Intentions and values come first, so matches start with context instead of small talk.",
    },
  ];

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Good things start with you."
      subtitle="A few things that make you, you. Let’s build something real."
      onContinue={(e?: FormEvent) => {
        e?.preventDefault();
        onSave({});
      }}
      continueLabel="Get started"
      pending={pending}
      saveStatus={saveStatus}
      footerTip="Your progress auto-saves after every screen. Fine details live in settings later."
    >
      <div className="setup-welcome-meta"><span>7 focused steps</span><span>About 3 minutes</span></div>
      <div className="option-list setup-welcome-cards">{cards.map(c=><div key={c.title} className="option-card"><span className="option-ic"><WelcomeIcon name={c.icon}/></span><span className="option-text"><b>{c.title}</b><small>{c.body}</small></span></div>)}</div>
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
      title="First, the essentials."
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
        counter={{ value: displayName.length, max: 30 }}
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
              ? "The preview panel blocks precise location even after you allow it. Use 'Open in new tab' at the top of the page, where GPS works, or type your city below."
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
              "We tried four times and couldn't get a precise fix. Make sure GPS/location is on for this site and try again, or type your city below.",
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


  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Where are you based?"
      subtitle="One tap detects your city, or type it yourself."
      onBack={onBack}
      onContinue={handleContinue}
      pending={pending}
      saveStatus={saveStatus}
      footerTip="Only your city and region are public. Exact coordinates stay private."
    >
      <p className="setup-note"><PinIcon size={18}/>Nearby connections, without sharing your exact location.</p>
      <div className="option-list">
        <button type="button" className={`option-card ${locationSource==='gps'?'selected':''}`} aria-pressed={locationSource==='gps'} disabled={geoState==='locating'||geoState==='resolving'} onClick={()=>{setLocationSource('gps');handleRequestLocation();}}><span className="option-ic"><PinIcon size={20}/></span><span className="option-text"><b>{geoState==='locating'?'Finding you…':geoState==='resolving'?'Finding your city…':geoState==='granted'?'Location captured':'Use my location'}</b><small>Find people near you. Your coordinates stay private.</small></span><CheckIcon className="option-check" size={20}/></button>
        <button type="button" className={`option-card ${locationSource==='manual'?'selected':''}`} aria-pressed={locationSource==='manual'} onClick={()=>{setLocationSource('manual');setErrors(prev=>({...prev,location_source:''}));}}><span className="option-ic"><WelcomeIcon name="route"/></span><span className="option-text"><b>Type it myself</b><small>Enter your city and region below.</small></span><CheckIcon className="option-check" size={20}/></button>
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
      title={<>What are you<br/>here for?</>}
      subtitle="Choose what feels true. You can always change this later."
      onBack={onBack}
      onContinue={handleContinue}
      pending={pending}
      saveStatus={saveStatus}
      error={error}
      footerTip="You can be serious about what you want without sounding rigid."
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <span className="fb-eyebrow !text-[12px]">Relationship intentions</span>
          <span className="text-[11px] font-black uppercase tracking-widest tabular-nums text-[var(--color-ash)]">
            {goals.length}/3
          </span>
        </div>
        <OptionCardRow
          options={[{value:"long_term",label:"Something real",caption:"A meaningful, long-term connection"},{value:"friendship",label:"New friends",caption:"Meet people with shared interests"},{value:"still_exploring",label:"Still figuring it out",caption:"Keep things open and see who clicks"},...relationshipGoalOptions.filter(o=>o.value==="life_partner"||o.value==="meaningful_connection")]}
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
        collapseAfter={10}
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
