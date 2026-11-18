"use client";

import { useState } from "react";
import { PhotoImage } from "@/components/ui/photo-image";
import { SrGroup, SrRow, SrScreen } from "@/components/app/sr-ui";
import { ME } from "./fixtures";
import { VerifyBadge } from "@/components/verify-badge";
import type { ScreenId } from "./screens";

/**
 * Profile — the member's own page.
 *
 * From the reference's fourth screen: a full-bleed hero portrait with a settings
 * gear top-right and an Edit pill over the photo, the name + verified seal on the
 * photo, age · city beneath, the quoted headline, three stat tiles (profile views,
 * likes received, matches), a "My photos" strip, then the navigational groups.
 */

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="fb-sr-stat">
      <span className="fb-sr-stat__icon" aria-hidden>{icon}</span>
      <span className="fb-sr-stat__value">{value}</span>
      <span className="fb-sr-stat__label">{label}</span>
    </div>
  );
}

function Icon({ name }: { name: "about" | "heart" | "prefs" | "verify" | "settings" | "gear" }) {
  const c = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "about") return (<svg {...c}><circle cx="12" cy="8" r="3.4" /><path d="M4.8 20c.7-3.7 3.6-5.6 7.2-5.6s6.5 1.9 7.2 5.6" /></svg>);
  if (name === "heart") return (<svg {...c}><path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.5 10.4-8.5 10.4z" /></svg>);
  if (name === "prefs") return (<svg {...c}><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="8" cy="17" r="2" /></svg>);
  if (name === "verify") return (<svg {...c}><path d="M12 3l7 3v6c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6l7-3z" /><path d="M9 12l2.2 2.2L15.4 10" /></svg>);
  if (name === "settings") return (<svg {...c}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" /></svg>);
  return (<svg {...c}><circle cx="12" cy="12" r="3" /><path d="M12 3.6l.9 2.2 2.3.6 1.9-1.4 1.6 1.6-1.4 1.9.6 2.3 2.2.9v2.2l-2.2.9-.6 2.3 1.4 1.9-1.6 1.6-1.9-1.4-2.3.6-.9 2.2H10l-.9-2.2-2.3-.6-1.9 1.4L3.3 17l1.4-1.9-.6-2.3L2 11.9V9.7l2.1-.9.6-2.3L3.3 4.6 4.9 3l1.9 1.4 2.3-.6.9-2.2h2z" /></svg>);
}

export function ProfileView({ onNavigate }: { onNavigate?: (s: ScreenId) => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);

  return (
    <SrScreen>
      <div className="fb-sr-hero">
        <PhotoImage src={ME.photo} alt={ME.name} className="absolute inset-0 h-full w-full" imgClassName="h-full w-full object-cover" />
        <div className="fb-sr-hero__shade" aria-hidden />

        <button
          type="button"
          className="fb-sr-hero__gear"
          aria-label="Settings"
          onClick={() => onNavigate?.("settings")}
        >
          <Icon name="gear" />
        </button>

        <button
          type="button"
          className="fb-sr-hero__edit"
          onClick={() => setEditOpen((v) => !v)}
          aria-expanded={editOpen}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 20h4L20 8l-4-4L4 16v4z" />
          </svg>
          Edit
        </button>

        <div className="fb-sr-hero__name">
          <span className="fb-sr-hero__nametext">{ME.name}</span>
          {ME.verified ? <VerifyBadge size={16} /> : null}
        </div>
        <p className="fb-sr-hero__age">{ME.age} · {ME.city}</p>
        <p className="fb-sr-hero__quote">“{ME.headline}”</p>
      </div>

      {editOpen ? (
        <div className="fb-sr-inlinenote" role="status">
          <span>Edit profile — the live app opens the photo and detail editor here.</span>
          <button type="button" onClick={() => setEditOpen(false)} aria-label="Dismiss">×</button>
        </div>
      ) : null}

      <div className="fb-sr-stats">
        <Stat icon={<Icon name="heart" />} value={ME.profileViews} label="Profile views" />
        <Stat icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.5l6.6-.9L12 2.6z" /></svg>} value={ME.likesReceived} label="Likes received" />
        <Stat icon={<Icon name="about" />} value={ME.matches} label="Matches" />
      </div>

      <div className="fb-sr-photos">
        <button type="button" className="fb-sr-photos__head" onClick={() => setPhotosOpen((v) => !v)} aria-expanded={photosOpen}>
          <span className="fb-sr-photos__icon" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.4" y="5.4" width="17.2" height="13.2" rx="3" />
              <path d="M8.2 12.4l2.6 2.6 4.6-5" />
            </svg>
          </span>
          <span className="fb-sr-photos__label">My photos</span>
          <span className="fb-sr-photos__count">{ME.photos.length}</span>
          <span className="fb-sr-row__chev" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </span>
        </button>
        <div className="fb-sr-photostrip">
          {ME.photos.map((src, i) => (
            <Link2 key={src + i} src={src} />
          ))}
          {photosOpen ? <p className="fb-sr-photostrip__note">Tap any photo to reorder, or add a new one from the live app.</p> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 pb-6">
        <SrGroup>
          <SrRow icon={<Icon name="about" />} onClick={() => setEditOpen(true)}>About me</SrRow>
          <SrRow icon={<Icon name="heart" />} onClick={() => onNavigate?.("filters")}>Interests</SrRow>
          <SrRow icon={<Icon name="prefs" />} onClick={() => onNavigate?.("filters")}>Preferences</SrRow>
          <SrRow icon={<Icon name="verify" />} onClick={() => setEditOpen(true)}>Verification</SrRow>
          <SrRow icon={<Icon name="settings" />} onClick={() => onNavigate?.("settings")}>Settings</SrRow>
        </SrGroup>
      </div>
    </SrScreen>
  );
}

function Link2({ src }: { src: string }) {
  return (
    <span className="fb-sr-photostrip__item">
      <PhotoImage src={src} alt="" className="h-full w-full" imgClassName="h-full w-full object-cover" />
    </span>
  );
}
