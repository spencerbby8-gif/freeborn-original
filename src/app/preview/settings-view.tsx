"use client";

import { useState } from "react";
import Link from "next/link";
import { SrGroup, SrRow, SrScreen, SrTitle } from "@/components/app/sr-ui";
import type { ScreenId } from "./screens";

/**
 * Settings.
 *
 * From the reference's sixth screen: a back arrow, serif "Settings" title, then
 * three bordered groups — account rows, subscription with the premium upsell card
 * nested inside it, and help/about — followed by the full-width destructive
 * "Log out". Every row is a real control; the ones with a destination navigate,
 * the rest report what they would open.
 */

function RowIcon({ name }: { name: "account" | "lock" | "bell" | "grid" | "crown" | "help" | "info" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "account") return (<svg {...common}><circle cx="12" cy="8" r="3.4" /><path d="M4.8 20c.7-3.7 3.6-5.6 7.2-5.6s6.5 1.9 7.2 5.6" /></svg>);
  if (name === "lock") return (<svg {...common}><rect x="4.6" y="10.2" width="14.8" height="9.6" rx="2.4" /><path d="M8.4 10.2V7.8a3.6 3.6 0 017.2 0v2.4" /></svg>);
  if (name === "bell") return (<svg {...common}><path d="M18 15.6V10a6 6 0 10-12 0v5.6L4.4 18h15.2L18 15.6z" /><path d="M10 20.4a2.2 2.2 0 004 0" /></svg>);
  if (name === "grid") return (<svg {...common}><circle cx="8" cy="8" r="2.4" /><circle cx="16" cy="8" r="2.4" /><circle cx="8" cy="16" r="2.4" /><circle cx="16" cy="16" r="2.4" /></svg>);
  if (name === "crown") return (<svg {...common}><path d="M3.4 8.4l4 3.2 4.6-5.4 4.6 5.4 4-3.2-1.6 10H5L3.4 8.4z" /></svg>);
  if (name === "help") return (<svg {...common}><circle cx="12" cy="12" r="8.4" /><path d="M9.6 9.6a2.5 2.5 0 114.2 1.8c-.9.8-1.8 1.3-1.8 2.6" /><path d="M12 17.2h.01" /></svg>);
  return (<svg {...common}><circle cx="12" cy="12" r="8.4" /><path d="M12 11v5.2" /><path d="M12 7.8h.01" /></svg>);
}

export function SettingsView({
  onNavigate,
  onLogout,
}: {
  onNavigate?: (s: ScreenId) => void;
  onLogout?: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const say = (what: string) => setNote(`${what} — this is a preview screen; the live app handles it.`);

  return (
    <SrScreen>
      <SrTitle back="/preview?screen=profile">Settings</SrTitle>

      {note ? (
        <div className="fb-sr-inlinenote" role="status">
          <span>{note}</span>
          <button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        <SrGroup>
          <SrRow icon={<RowIcon name="account" />} onClick={() => say("Account")}>Account</SrRow>
          <SrRow icon={<RowIcon name="lock" />} onClick={() => say("Privacy & Safety")}>Privacy &amp; Safety</SrRow>
          <SrRow icon={<RowIcon name="bell" />} onClick={() => onNavigate?.("notifications")}>Notifications</SrRow>
          <SrRow icon={<RowIcon name="grid" />} onClick={() => onNavigate?.("filters")}>Discovery Preferences</SrRow>
        </SrGroup>

        <SrGroup>
          <SrRow icon={<RowIcon name="crown" />} onClick={() => onNavigate?.("premium")}>Subscription</SrRow>
          <button type="button" onClick={() => onNavigate?.("premium")} className="fb-sr-upsell">
            <span className="fb-sr-upsell__crown" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.4 8.4l4 3.2 4.6-5.4 4.6 5.4 4-3.2-1.6 10H5L3.4 8.4z" />
              </svg>
            </span>
            <span className="fb-sr-upsell__body">
              <span className="fb-sr-upsell__title">Upgrade to Premium</span>
              <span className="fb-sr-upsell__sub">See who likes you, more filters, and more control.</span>
            </span>
            <span className="fb-sr-row__chev" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        </SrGroup>

        <SrGroup>
          <SrRow icon={<RowIcon name="help" />} onClick={() => say("Help & Support")}>Help &amp; Support</SrRow>
          <SrRow icon={<RowIcon name="info" />} onClick={() => say("About")}>About</SrRow>
        </SrGroup>
      </div>

      <div className="mt-5 px-5 pb-6">
        <button
          type="button"
          onClick={() => {
            if (onLogout) onLogout();
            else setNote("Log out — the live app signs you out here.");
          }}
          className="fb-sr-logout"
        >
          Log out
        </button>
        <p className="mt-3 text-center text-[11px] text-[var(--fb-sr-ash)]">
          <Link href="/preview?screen=notifications" className="underline underline-offset-2">
            Notification settings
          </Link>
          {" · "}
          <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
        </p>
      </div>
    </SrScreen>
  );
}
