"use client";

import { useState } from "react";
import { SrPill, SrPillRow, SrPrimary, SrScreen, SrSectionLabel, SrTitle } from "@/components/app/sr-ui";
import { INTERESTS } from "./fixtures";

/**
 * Discovery Preferences (Filters).
 *
 * From the reference's seventh screen: back arrow, two-line serif title, subtitle,
 * then Looking-for pills, a dual-handle Age range, a single-handle Distance, an
 * Interests multi-select, a "Show me" row in gold, and a pinned cream "Save
 * preferences" button.
 *
 * Both sliders are real range inputs styled to the reference; the two-handle age
 * slider is two overlapped inputs sharing one track, which is the only way to get
 * the reference's twin handles without a library.
 */

function dualStyle(lo: number, hi: number, min: number, max: number) {
  const a = ((lo - min) / (max - min)) * 100;
  const b = ((hi - min) / (max - min)) * 100;
  return { left: `${a}%`, width: `${Math.max(b - a, 0)}%` };
}

export function FiltersView({ onSaved }: { onSaved?: () => void }) {
  const [looking, setLooking] = useState("Something real");
  const [age, setAge] = useState<[number, number]>([24, 32]);
  const [distance, setDistance] = useState(25);
  const [picked, setPicked] = useState<string[]>(["Hiking"]);
  const [showMe, setShowMe] = useState("Women");
  const [saved, setSaved] = useState(false);

  const toggle = (i: string) =>
    setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));

  return (
    <SrScreen>
      <SrTitle back="/preview?screen=settings">
        <span className="block">Discovery</span>
        <span className="block">Preferences</span>
      </SrTitle>
      <p className="px-5 pt-1.5 text-[12.5px] text-[var(--fb-sr-mist)]">Find people who fit your world.</p>

      <div className="mt-1">
        <SrSectionLabel>Looking for</SrSectionLabel>
        <SrPillRow>
          {["Something real", "New friends", "Not sure yet"].map((t) => (
            <SrPill key={t} active={looking === t} onClick={() => setLooking(t)}>{t}</SrPill>
          ))}
        </SrPillRow>
      </div>

      <div className="fb-sr-sliderblock">
        <div className="fb-sr-sliderrow">
          <span className="fb-sr-sliderlabel">Age range</span>
          <span className="fb-sr-slidervalue">{age[0]} – {age[1]}</span>
        </div>
        <div className="fb-sr-dual">
          <span className="fb-sr-dual__track" />
          <span className="fb-sr-dual__fill" style={dualStyle(age[0], age[1], 18, 60)} />
          <input
            type="range" min={18} max={60} value={age[0]}
            aria-label="Minimum age"
            onChange={(e) => setAge([Math.min(Number(e.target.value), age[1] - 1), age[1]])}
            className="fb-sr-dual__input"
          />
          <input
            type="range" min={18} max={60} value={age[1]}
            aria-label="Maximum age"
            onChange={(e) => setAge([age[0], Math.max(Number(e.target.value), age[0] + 1)])}
            className="fb-sr-dual__input"
          />
        </div>
      </div>

      <div className="fb-sr-sliderblock">
        <div className="fb-sr-sliderrow">
          <span className="fb-sr-sliderlabel">Distance</span>
          <span className="fb-sr-slidervalue">Within {distance} miles</span>
        </div>
        <div className="fb-sr-single">
          <span className="fb-sr-dual__track" />
          <span className="fb-sr-dual__fill" style={{ left: 0, width: `${(distance / 50) * 100}%` }} />
          <input
            type="range" min={1} max={50} value={distance}
            aria-label="Maximum distance in miles"
            onChange={(e) => setDistance(Number(e.target.value))}
            className="fb-sr-dual__input fb-sr-dual__input--single"
          />
        </div>
      </div>

      <div>
        <SrSectionLabel>Interests</SrSectionLabel>
        <div className="fb-sr-interestgrid">
          {INTERESTS.map((i) => {
            const on = picked.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                aria-pressed={on}
                data-active={on}
                className="fb-sr-pill"
              >
                {i}
              </button>
            );
          })}
          <button type="button" onClick={() => setPicked([])} className="fb-sr-addmore">
            <span aria-hidden>+</span> Add more
          </button>
        </div>
      </div>

      <div>
        <SrSectionLabel tone="gold">Show me</SrSectionLabel>
        <SrPillRow>
          {["Women", "Men", "Everyone"].map((t) => (
            <SrPill key={t} active={showMe === t} onClick={() => setShowMe(t)}>{t}</SrPill>
          ))}
        </SrPillRow>
      </div>

      <div className="mt-auto px-5 pt-8 pb-6">
        {saved ? (
          <p className="mb-2 text-center text-[11.5px] text-[var(--fb-sr-gold)]" role="status">
            Saved · {looking} · {age[0]}–{age[1]} · within {distance} mi · {showMe}
          </p>
        ) : null}
        <SrPrimary
          onClick={() => {
            setSaved(true);
            onSaved?.();
          }}
        >
          Save preferences
        </SrPrimary>
      </div>
    </SrScreen>
  );
}
