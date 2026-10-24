"use client";

import { useEffect, useState } from "react";

/**
 * Device-level preferences, and the reason this file exists.
 *
 * Settings offered a distance unit choice of kilometres or miles and stored it,
 * but nothing ever read it back: every distance in the product was rendered with
 * a hardcoded "km". A control that appears to work and does not is worse than no
 * control, so the preference moved here where the surfaces that render distances
 * can reach it, and the four places that said "km" now ask.
 *
 * These stay on the device rather than in the database. They describe how one
 * browser should feel, not who a member is, and the Settings copy already says
 * "Saved on this device", which is now accurate rather than incidental.
 */
export const PREFS_KEY = "freeborn.preferences";
export const PREFS_EVENT = "freeborn-prefs-changed";

export type DistanceUnits = "km" | "mi";

export type Prefs = {
  units: DistanceUnits;
  animations: boolean;
  haptics: boolean;
  sounds: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  units: "km",
  animations: true,
  haptics: true,
  sounds: true,
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    /* Same-browser tabs and any component already mounted. The storage event
       only fires in OTHER tabs, so a deck open behind the settings sheet needs
       this one to notice. */
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    /* private mode: the choice simply does not persist */
  }
}

const KM_PER_MILE = 1.609344;

/** Kilometres are what the database stores and what the filter sentinel is
 *  defined in, so conversion happens only at the moment of display. 500 means
 *  "Anywhere" in km and callers handle that before calling this. */
export function formatDistance(km: number, units: DistanceUnits = "km"): string {
  if (units === "mi") return `${Math.round(km / KM_PER_MILE)} mi`;
  return `${Math.round(km)} km`;
}

/** Reads the member's unit choice and keeps it live. Listens for both the
 *  same-tab event savePrefs dispatches and the cross-tab storage event, so a deck
 *  open behind the settings sheet updates without a reload. */
export function useDistanceUnits(): DistanceUnits {
  const [units, setUnits] = useState<DistanceUnits>(DEFAULT_PREFS.units);

  useEffect(() => {
    const read = () => setUnits(loadPrefs().units);
    read();
    window.addEventListener(PREFS_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PREFS_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return units;
}
