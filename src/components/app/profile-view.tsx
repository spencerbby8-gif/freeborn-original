"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VerifyBadge } from "@/components/verify-badge";
import { AuthedImg } from "@/components/ui/authed-media";
import { PhotoLightbox } from "./photo-lightbox";
import { EndConversationDialog, type EndConversationKind } from "./unmatch-dialog";
import { readJsonSafe } from "@/lib/api-response";
import type { UnmatchReason } from "@/lib/match-lifecycle";
import { getAccessToken } from "@/lib/supabase/browser";
import { prettyText } from "@/lib/pretty-text";
import { genderOptions } from "@/lib/onboarding-data";
import { formatDistance, useDistanceUnits } from "@/lib/device-prefs";
import { showToast } from "@/components/toast-host";
import {
  heightImperial,
  lifestyleHeadline,
  placeLabel,
  presenceLabel,
  titleCase,
  zodiacFromBirthMonth,
} from "@/lib/profile-presentation";
import {
  BackArrowIcon,
  BriefcaseIcon,
  CloseIcon,
  CoupleIcon,
  FlameIcon,
  GlowHeart,
  HeartIcon,
  LeafIcon,
  MoreIcon,
  PinIcon,
  ProfileIcon,
} from "@/components/ui/line-icons";

const REPORT_REASONS: Array<{ value: string; label: string }> = [
  { value: "fake_profile", label: "Fake profile" },
  { value: "scam", label: "Scam or asking for money" },
  { value: "harassment", label: "Harassment" },
  { value: "safety", label: "Safety concern" },
  { value: "underage", label: "Underage" },
  { value: "inappropriate_media", label: "Inappropriate photos" },
  { value: "other", label: "Something else" },
];

type FullProfile = {
  id: string;
  name: string;
  age: number | null;
  city: string;
  region: string;
  occupation: string;
  education: string;
  educationLevel: string;
  bio: string;
  language: string;
  religion: string;
  maritalStatus: string;
  hasKids: string;
  wantsKids: string;
  drinking: string;
  smoking: string;
  heightCm: number | null;
  values: string[];
  interests: string[];
  lifestyle: string[];
  relationshipGoals: string[];
  prompts: Array<{ prompt?: string; answer?: string }>;
  photos: string[];
  verified: boolean;
  vaccinationStatus: string;
  replyRate: number | null;
  matchRate: number | null;
  conversationCount: number;
  memberSince: string | null;
  birthMonthYear: string;
  distanceKm: number | null;
  messageRestricted?: string | null;
  gender: string;
  dealBreakers: string[];
  /** "now" | "today" | "week" | "hidden" | null when idle beyond 7 days. */
  presence: string | null;
  /** City they asked for a mixer in, if they asked for one. */
  mixerCity: string | null;
  /** Computed server-side from the viewer's own row; null on your own profile. */
  inCommon?: { values: string[]; interests: string[]; lifestyle: string[] } | null;
  /** Only present when this card was opened as "View as others". */
  visibility?: { visible: boolean; reasons: string[] } | null;
};

/* Instant re-open: full profiles are cached after first fetch. This Map was
   written to and never read from, so the re-open it promised never happened.
   The key carries the viewer's origin because distanceKm in the payload is
   computed from it: a card cached before location consent must not be served
   after it, or the member reads a distance they never agreed to share. */
const profileCache = new Map<string, FullProfile>();

function joinedLabel(iso: string | null) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "Joined today";
  if (days < 31) return `Joined ${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `Joined ${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `Joined ${years} year${years === 1 ? "" : "s"} ago`;
}

const GOAL_LABELS: Record<string, string> = {
  long_term: "Something real and meaningful",
  life_partner: "A life partner",
  meaningful_connection: "A meaningful connection",
  still_exploring: "Still exploring, honestly",
};

const VAX_LABELS: Record<string, string> = {
  unvaccinated: "Natural health",
  vaccinated: "Vaccinated",
  prefer_not_to_say: "Private on vaccines",
};

/* One source of truth: the same options onboarding offers, not a second copy
   that can drift from it. */
const GENDER_LABELS: Record<string, string> = Object.fromEntries(
  genderOptions.map((g) => [g.value, g.label])
);

function FactCard({
  icon,
  label,
  value,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="fb-sr-fact-card" title={title ?? `${label}: ${value}`}>
      <span className="fb-sr-fact-card__icon">{icon}</span>
      <span className="min-w-0">
        <span className="fb-sr-fact-card__label block">{label}</span>
        <span className="fb-sr-fact-card__value block">{value}</span>
      </span>
    </div>
  );
}

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="fb-sr-section">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="fb-sr-section__title">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function ProfileView({
  profileId,
  onClose,
  asOthers = false,
}: {
  profileId: string;
  onClose: () => void;
  /** Ask the route whether the room can actually see this card, rather than
      only rendering it back to its owner. */
  asOthers?: boolean;
}) {
  const [profile, setProfile] = useState<FullProfile | null>(null);
  /* Why the card is empty. These are different situations for the member and
     only one of them has anything they can do about it, so they are told apart
     instead of collapsing into a single "couldn't load". */
  const [failed, setFailed] = useState<null | "auth" | "hidden" | "error">(null);
  /** Bumped by Try again; it is an effect dependency so a retry really refetches. */
  const [attempt, setAttempt] = useState(0);
  const [photoIdx, setPhotoIdx] = useState(0);
  const dragRef = useRef<{ startX: number; moved: boolean } | null>(null);

  useEffect(() => {
    setPhotoIdx(0);
    // Real distance: pass the viewer's (already-consented, cached) location.
    let qs = "";
    try {
      const raw = window.sessionStorage.getItem("freeborn.origin");
      if (raw) {
        const { lat, lng } = JSON.parse(raw) as { lat: number; lng: number };
        if (Number.isFinite(lat) && Number.isFinite(lng)) qs = `?lat=${lat}&lng=${lng}`;
      }
    } catch {
      /* no location → no distance */
    }
    if (asOthers) qs += `${qs ? "&" : "?"}as=others`;

    const cached = profileCache.get(profileId + qs);
    if (cached) {
      setProfile(cached);
      setFailed(null);
      return;
    }

    setProfile(null);
    setFailed(null);
    let cancelled = false;
    (async () => {
      try {
        /* The fix. /api/profile/[id] requires a signed-in member and answers 401
           without one (route.ts:54-57). Sessions live in localStorage, so no
           sb-* cookie reaches the server and the SSR fallback in api-auth.ts:31
           finds nothing: a Bearer token is the only credential this route will
           ever see. The deck sent one, which is why cards loaded and then every
           card you tapped said it could not. */
        const token = await getAccessToken().catch(() => null);
        const res = await fetch(`/api/profile/${profileId}${qs}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        if (res.ok) {
          const json = await res.json();
          profileCache.set(profileId + qs, json.profile);
          setProfile(json.profile);
          return;
        }
        /* 401 = no session the route can read. 404 = the route refusing, which it
           answers for every refusal rather than 403 so that it stays useless as
           an oracle for whether an id exists (route.ts:59-61). Anything else is
           a fault on our side. */
        setFailed(res.status === 401 ? "auth" : res.status === 404 ? "hidden" : "error");
      } catch {
        /* Without this catch a rejected fetch left failed unset and profile null,
           which renders the spinner forever: an endless load with no way out. */
        if (!cancelled) setFailed("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, attempt, asOthers]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const photos = profile?.photos ?? [];
  const clampIdx = (i: number) => Math.max(0, Math.min(photos.length - 1, i));
  const presence = presenceLabel(profile?.presence);
  const units = useDistanceUnits();
  const sharedCount = profile?.inCommon
    ? profile.inCommon.values.length +
      profile.inCommon.interests.length +
      profile.inCommon.lifestyle.length
    : 0;
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  /* --- Member actions menu (3 dots) ------------------------------------------- */
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  /** undefined = not loaded yet · null = no match · string = match id */
  const [theirMatchId, setTheirMatchId] = useState<string | null | undefined>(undefined);

  const ensureMatchId = async () => {
    if (theirMatchId !== undefined || !profile) return;
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/chat/matches", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        const found = (json.matches ?? []).find((m: { with: { id: string } }) => m.with.id === profile.id);
        setTheirMatchId(found ? found.id : null);
        return;
      }
    } catch {
      /* fall through */
    }
    setTheirMatchId(null);
  };

  const openMenu = () => {
    setMenuOpen(true);
    void ensureMatchId();
  };

  /* Runs ONLY from the confirm sheet's danger button, which is what supplies `destructive`.
     The API refuses the call without it (409 needsConfirmation), so an auto-confirmed client
     would be the same as no confirmation at all — that is exactly what this component used to
     do, and `runDeleteConversation` used to omit the flag entirely and therefore always fail. */
  const runUnmatch = async (reason: UnmatchReason | null) => {
    if (!profile || actionBusy) return;
    setActionBusy("unmatch");
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/chat/unmatch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ with: profile.id, ...(reason ? { reason } : {}), destructive: true }),
      });
      const json = await readJsonSafe<{ error?: string; alreadyEnded?: boolean }>(res);
      if (res.ok) {
        setEndKind(null);
        showToast({ tone: "success", title: "Conversation ended", body: `${profile.name} is no longer in your matches, and this thread is gone from your view.` });
        setMenuOpen(false);
        onClose();
      } else if (json?.alreadyEnded) {
        setEndKind(null);
        showToast({ tone: "info", title: "Already ended", body: `${profile.name} ended this conversation first. It stays readable for you.` });
        setMenuOpen(false);
      } else {
        showToast({ tone: "error", title: "Couldn't unmatch", body: json?.error ?? "Try again in a moment." });
      }
    } catch {
      showToast({ tone: "error", title: "Couldn't unmatch", body: "Check your connection and try again." });
    } finally {
      setActionBusy(null);
    }
  };

  const runDeleteConversation = async () => {
    if (!profile || actionBusy || !theirMatchId) return;
    setActionBusy("delete");
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch(`/api/chat/messages?match=${encodeURIComponent(theirMatchId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        // Required by the route: wiping a shared thread is irreversible, so it answers
        // 409 needsConfirmation until a client says it showed the member what that means.
        body: JSON.stringify({ destructive: true }),
      });
      await readJsonSafe<{ error?: string; deleted?: number }>(res);
      if (res.ok) {
        setEndKind(null);
        showToast({ tone: "success", title: "Conversation deleted", body: "Every message in this chat was removed." });
        setMenuOpen(false);
      } else {
        showToast({ tone: "error", title: "Couldn't delete the conversation", body: "Try again in a moment." });
      }
    } catch {
      showToast({ tone: "error", title: "Couldn't delete the conversation", body: "Check your connection and try again." });
    } finally {
      setActionBusy(null);
    }
  };

  const runBlock = async () => {
    if (!profile || actionBusy) return;
    setActionBusy("block");
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ profileId: profile.id }),
      });
      if (res.ok) {
        showToast({ tone: "success", title: "Member blocked", body: `${profile.name} can no longer see you or contact you.` });
        setMenuOpen(false);
        onClose();
      } else {
        showToast({ tone: "error", title: "Couldn't block this member", body: "Try again in a moment." });
      }
    } catch {
      showToast({ tone: "error", title: "Couldn't block this member", body: "Check your connection and try again." });
    } finally {
      setActionBusy(null);
    }
  };

  /* --- Report this member ---------------------------------------------------- */
  /* The end-of-conversation sheet: `null` = closed. Nothing destructive runs from the menu
     itself any more — the menu only opens this. */
  const [endKind, setEndKind] = useState<EndConversationKind | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);

  const submitReport = async () => {
    if (!reportReason || reportBusy || !profile) return;
    setReportBusy(true);
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profileId: profile.id, reason: reportReason }),
      });
      if (res.ok) {
        showToast({
          tone: "success",
          title: "Report received",
          body: "Thank you. Freeborn's moderation reviews every report.",
        });
        setReportOpen(false);
        setReportReason("");
      } else {
        const json = await res.json().catch(() => ({}));
        showToast({ tone: "error", title: "Couldn't file the report", body: json.error ?? "Try again shortly." });
      }
    } catch {
      showToast({ tone: "error", title: "Couldn't file the report", body: "Check your connection and try again." });
    } finally {
      setReportBusy(false);
    }
  };

  const [msgBusy, setMsgBusy] = useState(false);
  /* Is a request already flying between us? The button must say so instead of
     offering to send a second one. */
  const [msgRequest, setMsgRequest] = useState<"none" | "outgoing" | "incoming">("none");
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    void (async () => {
      const t = await getAccessToken().catch(() => null);
      if (!t || cancelled) return;
      const res = await fetch("/api/chat/requests", {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const json = (await res.json().catch(() => null)) as {
        incoming?: Array<{ from: { id: string } }>;
        outgoing?: Array<{ to: { id: string } }>;
      } | null;
      if (!json || cancelled) return;
      if (json.outgoing?.some((r) => r.to.id === profile.id)) setMsgRequest("outgoing");
      else if (json.incoming?.some((r) => r.from.id === profile.id)) setMsgRequest("incoming");
      else setMsgRequest("none");
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  /* Owner addendum 2026-11-15: this button used to call /api/chat/start, which
     demands a mutual like and answered 409 without one - and the 409 was
     swallowed here, so a member tapped "Message <name>" and NOTHING happened.
     The tap now creates a message request the other member answers in
     Messages; if a live conversation already exists it opens it, and if THEY
     already asked, it says so instead of queueing paper. */
  const handleMessage = async () => {
    if (!profile || msgBusy) return;
    setMsgBusy(true);
    try {
      const token = await getAccessToken().catch(() => null);
      if (!token) {
        window.location.href = "/auth?mode=sign-in";
        return;
      }
      const res = await fetch("/api/chat/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: profile.id }),
      });
      const json = (await res.json().catch(() => null)) as
        | { matchId?: string; requestId?: string; incomingId?: string; error?: string }
        | null;
      if (res.ok && json?.matchId) {
        window.location.assign(`/app/chat?match=${json.matchId}`);
        return;
      }
      if (res.ok && json?.requestId) {
        setMsgRequest("outgoing");
        showToast({
          tone: "success",
          title: "Message request sent",
          body: `${profile.name} can accept it in Messages.`,
        });
        return;
      }
      if (res.ok && json?.incomingId) {
        setMsgRequest("incoming");
        showToast({
          tone: "info",
          title: `${profile.name} already asked`,
          body: "Their request is waiting in your Messages.",
        });
        return;
      }
      showToast({
        tone: "error",
        title: "Couldn't send the request",
        body: json?.error ?? "Check your connection and try again.",
      });
    } finally {
      setMsgBusy(false);
    }
  };

  /* --- presentation ------------------------------------------------------- */
  const lookingFor = profile?.relationshipGoals?.length
    ? GOAL_LABELS[profile.relationshipGoals[0]] ?? titleCase(prettyText(profile.relationshipGoals[0]))
    : null;
  const heroPhoto = photos[photoIdx] ?? photos[0] ?? "";

  const facts = [
    profile?.occupation
      ? { key: "work", icon: <BriefcaseIcon size={15} />, label: "Work", value: profile.occupation }
      : null,
    placeLabel(profile?.city, profile?.region)
      ? {
          key: "city",
          icon: <PinIcon size={15} />,
          label: "City",
          value: placeLabel(profile?.city, profile?.region),
        }
      : null,
    profile?.heightCm
      ? {
          key: "height",
          icon: <FlameIcon size={15} />,
          label: "Height",
          value: heightImperial(profile.heightCm) ?? "",
        }
      : null,
    lifestyleHeadline(profile?.lifestyle)
      ? {
          key: "lifestyle",
          icon: <LeafIcon size={15} />,
          label: "Lifestyle",
          value: lifestyleHeadline(profile?.lifestyle) ?? "",
        }
      : null,
    zodiacFromBirthMonth(profile?.birthMonthYear)
      ? {
          key: "zodiac",
          icon: <FlameIcon size={15} />,
          label: "Zodiac",
          value: zodiacFromBirthMonth(profile?.birthMonthYear) ?? "",
        }
      : null,
    profile?.language
      ? { key: "language", icon: <ProfileIcon size={15} />, label: "Languages", value: profile.language }
      : null,
  ].filter(Boolean) as Array<{ key: string; icon: React.ReactNode; label: string; value: string }>;

  const passions = [
    ...(profile?.interests ?? []),
    ...(profile?.lifestyle ?? []),
  ]
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .slice(0, 6);

  return (
    <div className="fb-sr fixed inset-0 z-[80] overflow-y-auto bg-[#080a15]">
      <div className="mx-auto w-full max-w-[560px] pb-2">
        {/* --- top bar over the photo ------------------------------------- */}
        {!profile && !failed ? (
          <div className="flex justify-center py-28">
            <span className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-[#ffb894] border-t-transparent" />
          </div>
        ) : failed || !profile ? (
          <div className="px-5 py-24 text-center">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back"
              className="fb-sr-disc fb-sr-round mb-8 inline-flex"
            >
              <BackArrowIcon size={19} />
            </button>
            <p className="fb-sr-title text-[23px]">
              {failed === "auth"
                ? "Your session needs a refresh."
                : failed === "hidden"
                  ? "This profile isn&rsquo;t available to you."
                  : "Couldn&rsquo;t load this profile."}
            </p>
            <p className="mx-auto mt-3 max-w-[34ch] text-[13px] leading-6 text-[var(--sr-mist)]">
              {failed === "auth"
                ? "Profiles are only shown to signed-in members. Sign in again and this card will open."
                : failed === "hidden"
                  ? "They may have paused discovery, gone incognito, hidden their profile, or blocked you. Freeborn does not say which, because naming the reason would confirm who is here."
                  : "The request did not complete. Either your connection dropped it or our server did."}
            </p>
            <div className="mt-7 flex flex-col items-center gap-3">
              {failed === "auth" ? (
                <Link href="/auth?mode=sign-in" className="fb-sr-hello px-8">
                  Sign in again
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="fb-sr-hello px-8"
                >
                  Try again
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-[13px] font-bold text-[var(--sr-mist)] underline-offset-4 transition hover:text-[var(--sr-pearl)] hover:underline"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-scale-in">
            {/* Photos, edge to edge, no card — the reference bleeds the portrait
                to the screen edges and rounds only the bottom. */}
            <div
              className="fb-sr-hero"
              style={{
                aspectRatio: "1 / 1.16",
                touchAction: "pan-y",
              }}
              onPointerDown={(e) => {
                dragRef.current = { startX: e.clientX, moved: false };
              }}
              onPointerMove={(e) => {
                if (dragRef.current && Math.abs(e.clientX - dragRef.current.startX) > 8)
                  dragRef.current.moved = true;
              }}
              onPointerUp={(e) => {
                const d = dragRef.current;
                dragRef.current = null;
                if (!d) return;
                const dx = e.clientX - d.startX;
                if (d.moved && Math.abs(dx) > 50) {
                  setPhotoIdx((i) => clampIdx(dx < 0 ? i + 1 : i - 1));
                } else if (!d.moved) {
                  setLightboxIdx(photoIdx);
                }
              }}
            >
              {heroPhoto ? (
                <AuthedImg
                  src={heroPhoto}
                  alt={`${profile.name}, photo ${photoIdx + 1}`}
                  draggable={false}
                  className="h-full w-full select-none object-cover object-center"
                />
              ) : (
                <div
                  aria-hidden
                  className="flex h-full w-full items-center justify-center"
                  style={{ background: "linear-gradient(160deg,#2a2140 0%,#3a2430 55%,#241d33 100%)" }}
                >
                  <span className="font-display text-[92px] font-medium text-white/85">
                    {(profile.name || "M").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="fb-sr-hero__shade" aria-hidden />

              {/* soft progress segments, as in the reference's single-photo case
                  they collapse to nothing; here each photo gets a segment */}
              {photos.length > 1 ? (
                <div className="absolute inset-x-4 top-3 z-10 flex gap-1.5">
                  {photos.map((_, i) => (
                    <span
                      key={i}
                      className={`h-[3px] flex-1 rounded-full transition-all duration-300 ${
                        i === photoIdx ? "bg-white/95" : "bg-white/30"
                      }`}
                    />
                  ))}
                </div>
              ) : null}

              <div className="absolute inset-x-4 top-4 z-20 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Back"
                  className="fb-sr-disc fb-sr-heart"
                >
                  <BackArrowIcon size={18} />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
                    aria-label="Profile actions"
                    title="Report, unmatch, block…"
                    className="fb-sr-disc fb-sr-heart"
                  >
                    <MoreIcon size={18} />
                  </button>

                  {menuOpen ? (
                    <>
                      <div className="fixed inset-0 z-[155]" onClick={() => setMenuOpen(false)} />
                      <div className="animate-scale-in absolute right-0 top-12 z-[160] w-[248px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#10141f] shadow-[0_30px_80px_-16px_rgba(0,0,0,0.9)]">
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setReportOpen(true);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] font-semibold text-[var(--sr-pearl)] transition hover:bg-white/[0.05]"
                        >
                          Report {profile.name}
                        </button>
                        {theirMatchId ? (
                          <>
                            <button
                              type="button"
                              disabled={actionBusy !== null}
                              onClick={() => {
                                setMenuOpen(false);
                                setEndKind("delete");
                              }}
                              className="flex w-full items-center gap-3 border-t border-white/[0.06] px-4 py-3 text-left text-[13px] font-semibold text-[var(--sr-pearl)] transition hover:bg-white/[0.05] disabled:opacity-50"
                            >
                              {actionBusy === "delete" ? "Deleting…" : "Delete conversation"}
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy !== null}
                              onClick={() => {
                                setMenuOpen(false);
                                setEndKind("unmatch");
                              }}
                              className="flex w-full items-center gap-3 border-t border-white/[0.06] px-4 py-3 text-left text-[13px] font-semibold text-[var(--sr-pearl)] transition hover:bg-white/[0.05] disabled:opacity-50"
                            >
                              Unmatch
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={() => void runBlock()}
                          className="flex w-full items-center gap-3 border-t border-white/[0.06] px-4 py-3 text-left text-[13px] font-semibold text-[#ff9a8a] transition hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {actionBusy === "block" ? "Blocking…" : "Block"}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              {/* name block, bottom-left of the hero — with the heart on the right */}
              <div className="absolute inset-x-5 bottom-5 z-10 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="fb-sr-name text-[var(--sr-pearl)]">{profile.name}</h1>
                    {profile.verified ? <VerifyBadge size={21} /> : null}
                  </div>
                  <p className="mt-2 truncate text-[13px] font-medium text-[var(--sr-sand)]">
                    {[
                      profile.age ? String(profile.age) : null,
                      profile.occupation,
                      placeLabel(profile.city, profile.region),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {presence ? (
                    <p
                      className="fb-sr-active"
                      style={presence.live ? undefined : { color: "var(--sr-mist)" }}
                        title={presence.label}
                    >
                      <span
                        className="fb-sr-active__dot"
                        style={
                          presence.live
                            ? undefined
                            : { background: "var(--sr-mist)", boxShadow: "none" }
                        }
                      />
                      {presence.label}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => void handleMessage()}
                  disabled={msgBusy || Boolean(profile.messageRestricted)}
                  aria-label={`Say hello to ${profile.name}`}
                  className="fb-sr-disc relative mb-1 flex h-[62px] w-[62px] shrink-0 items-center justify-center"
                  style={{
                    background: "linear-gradient(180deg,#fff3e4 0%,#ffe7cf 100%)",
                    border: "1px solid rgba(255,255,255,0.5)",
                    boxShadow: "0 18px 40px -16px rgba(255,196,150,0.9)",
                  }}
                >
                  <HeartIcon size={24} className="text-[#3a2418]" />
                  {msgRequest === "outgoing" ? (
                    <span
                      aria-hidden
                      className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#7ee2b0] text-[11px] font-black text-[#0a2a1d] ring-2 ring-[#080a15]"
                    >
                      ✓
                    </span>
                  ) : null}
                </button>
              </div>
            </div>

            {/* --- body ---------------------------------------------------- */}
            <div className="space-y-2.5 px-5 pt-4">
              {profile.visibility ? (
                <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.02] p-4">
                  <p className="fb-sr-section__title">
                    {profile.visibility.visible ? "Visible to the room." : "Not visible to the room."}
                  </p>
                  <p className="mt-2 text-[12.5px] leading-6 text-[var(--sr-mist)]">
                    {profile.visibility.visible
                      ? "A member who isn&rsquo;t a match of yours, with no filters set, can open this card and read all of it. This is not a complete impersonation: blocks and another member&rsquo;s own filters aren&rsquo;t simulated."
                      : "You can always read your own profile, so this card is not what a stranger sees. Right now:"}
                  </p>
                  {profile.visibility.visible || profile.visibility.reasons.length === 0 ? null : (
                    <ul className="mt-3 space-y-1.5">
                      {profile.visibility.reasons.map((r) => (
                        <li key={r} className="flex gap-2 text-[12.5px] leading-5 text-[var(--sr-pearl)]">
                          <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#ffd3ad]" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {lookingFor ? (
                <div className="fb-sr-looking">
                  <div>
                    <p className="fb-sr-looking__label">Looking for</p>
                    <p className="fb-sr-looking__value">{lookingFor}</p>
                  </div>
                  <GlowHeart size={54} />
                </div>
              ) : null}

              {facts.length ? (
                <div className="fb-sr-facts">
                  {facts.slice(0, 4).map((f) => (
                    <FactCard key={f.key} icon={f.icon} label={f.label} value={f.value} />
                  ))}
                </div>
              ) : null}

              {profile.bio ? (
                <Section title="About me">
                  <p className="fb-sr-section__body">{profile.bio}</p>
                </Section>
              ) : null}

              {profile.prompts.filter((p) => p.answer).map((p, i) => (
                <Section key={i} title={p.prompt ?? "In their words"}>
                  <p className="fb-sr-section__body">“{p.answer}”</p>
                </Section>
              ))}

              {passions.length ? (
                <Section title="My passions">
                  <div className="mt-3 flex flex-wrap gap-2">
                    {passions.map((p) => (
                      <span key={p} className="fb-sr-tag">
                        {p}
                      </span>
                    ))}
                  </div>
                </Section>
              ) : null}

              {profile.vaccinationStatus === "unvaccinated" || profile.relationshipGoals.length ? (
                <div className="flex flex-wrap gap-2 px-0.5">
                  {profile.vaccinationStatus === "unvaccinated" ? (
                    <span
                      className="fb-sr-tag"
                      style={{
                        borderColor: "rgba(255,211,173,0.32)",
                        background: "rgba(255,211,173,0.10)",
                        color: "#ffe0c6",
                      }}
                    >
                      <LeafIcon size={12} className="mr-1.5" />
                      {VAX_LABELS.unvaccinated}
                    </span>
                  ) : null}
                  {profile.relationshipGoals.map((g) => (
                    <span
                      key={g}
                      className="fb-sr-tag"
                      style={{
                        borderColor: "rgba(168,146,255,0.28)",
                        background: "rgba(168,146,255,0.10)",
                        color: "#d8cdff",
                      }}
                    >
                      <CoupleIcon size={12} className="mr-1.5" />
                      {GOAL_LABELS[g] ?? titleCase(prettyText(g))}
                    </span>
                  ))}
                </div>
              ) : null}

              {profile.inCommon && sharedCount > 0 ? (
                <Section title="Ground you already share">
                  <p className="fb-sr-section__body">
                    Not a compatibility score. These are the things you both said, so a first
                    message has somewhere honest to start.
                  </p>
                  <div className="mt-3 space-y-2">
                    {[
                      ["Values", profile.inCommon.values],
                      ["How they live", profile.inCommon.lifestyle],
                      ["Interests", profile.inCommon.interests],
                    ]
                      .filter(([, items]) => (items as string[]).length > 0)
                      .map(([label, items]) => (
                        <div key={label as string} className="flex flex-wrap items-baseline gap-1.5">
                          <p className="shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--sr-ash)]">
                            {label as string}
                          </p>
                          {(items as string[]).map((item) => (
                            <span
                              key={item}
                              className="rounded-full border border-[#ffd3ad]/25 bg-[#ffd3ad]/[0.08] px-2.5 py-1 text-[11.5px] font-semibold text-[#ffe0c6]"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ))}
                  </div>
                </Section>
              ) : null}

              {profile.values.length || profile.lifestyle.length || profile.interests.length ? (
                <Section title="The shape of their days">
                  <div className="mt-3 space-y-3">
                    {[
                      ["Values", profile.values],
                      ["Lifestyle", profile.lifestyle],
                      ["Interests", profile.interests],
                    ]
                      .filter(([, items]) => (items as string[]).length > 0)
                      .map(([label, items]) => (
                        <div key={label as string}>
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--sr-ash)]">
                            {label as string}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {(items as string[]).map((item) => (
                              <span key={item} className="fb-sr-tag">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </Section>
              ) : null}

              {profile.dealBreakers.length > 0 ? (
                <Section title="What they will not compromise on">
                  <p className="fb-sr-section__body">
                    Boundaries stated up front, so nobody has to learn them the hard way three
                    weeks in.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {profile.dealBreakers.map((d) => (
                      <span
                        key={d}
                        className="rounded-full border border-[#ff9a8a]/25 bg-[#ff9a8a]/[0.07] px-3 py-1.5 text-[11.5px] font-semibold text-[#f6c9c2]"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </Section>
              ) : null}

              {profile.mixerCity ? (
                <Section title={`Open to meeting in ${profile.mixerCity}`}>
                  <p className="fb-sr-section__body">
                    They asked for a Freeborn mixer there. A venue is only ever named once it has
                    agreed in writing, and the agreement is recorded before anything is announced.
                  </p>
                </Section>
              ) : null}

              {/* The details — a quiet register, two columns like the reference */}
              {(() => {
                const details = [
                  {
                    label: "Gender",
                    value: profile.gender
                      ? GENDER_LABELS[profile.gender] ?? prettyText(profile.gender)
                      : "",
                  },
                  { label: "Born", value: profile.birthMonthYear },
                  { label: "Height", value: profile.heightCm ? `${profile.heightCm} cm` : "" },
                  { label: "Language", value: profile.language },
                  { label: "Religion", value: profile.religion },
                  { label: "Marital", value: profile.maritalStatus },
                  { label: "Kids", value: profile.hasKids },
                  { label: "Wants kids", value: profile.wantsKids },
                  { label: "Drinking", value: profile.drinking },
                  { label: "Smoking", value: profile.smoking },
                  {
                    label: "Education",
                    value: profile.educationLevel ? prettyText(profile.educationLevel) : "",
                  },
                  { label: "Studied at", value: profile.education },
                  { label: "Member", value: joinedLabel(profile.memberSince) },
                ].filter((d) => d.value);
                if (!details.length) return null;
                return (
                  <Section title="The details">
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-0">
                      {details.map((d, i) => (
                        <div
                          key={d.label}
                          className={`py-2.5 ${i < details.length - 2 ? "border-b border-white/[0.05]" : ""}`}
                        >
                          <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--sr-ash)]">
                            {d.label}
                          </dt>
                          <dd className="mt-1 text-[13px] font-semibold text-[var(--sr-ivory)]">
                            {prettyText(d.value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </Section>
                );
              })()}

              {/* Trust numbers — the same three facts the route computes, worded plainly */}
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { k: "Reply rate", v: profile.replyRate === null ? "New" : `${profile.replyRate}%` },
                  { k: "Match rate", v: profile.matchRate === null ? "New" : `${profile.matchRate}%` },
                  { k: "Distance", v: profile.distanceKm == null ? "—" : formatDistance(profile.distanceKm, units) },
                ].map((s) => (
                  <div
                    key={s.k}
                    className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-2 py-3 text-center"
                  >
                    <p className="font-display text-[19px] font-medium text-[var(--sr-pearl)]">{s.v}</p>
                    <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--sr-mist)]">
                      {s.k}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* --- sticky action row -------------------------------------- */}
            <div className="fb-sr-actions px-5">
              <button
                type="button"
                onClick={onClose}
                aria-label="Not for me"
                className="fb-sr-disc fb-sr-round"
              >
                <CloseIcon size={19} />
              </button>
              {profile.messageRestricted ? (
                <div className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 text-[12.5px] font-semibold text-[var(--sr-mist)]">
                  {profile.messageRestricted}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    msgRequest === "incoming" ? window.location.assign("/app/chat") : void handleMessage()
                  }
                  disabled={msgBusy}
                  className="fb-sr-hello flex-1"
                >
                  <HeartIcon size={16} />
                  {msgBusy
                    ? "Opening…"
                    : msgRequest === "outgoing"
                      ? `Request sent to ${profile.name}`
                      : msgRequest === "incoming"
                        ? `Respond to ${profile.name}`
                        : "Say hello"}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleMessage()}
                disabled={msgBusy || Boolean(profile.messageRestricted)}
                aria-label="Share your natural-health stance with them"
                title={VAX_LABELS[profile.vaccinationStatus] ?? "Health stance"}
                className="fb-sr-disc fb-sr-round"
                style={{ color: "var(--sr-warm-200)" }}
              >
                <LeafIcon size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Report dialog */}
      {endKind && profile ? (
        <EndConversationDialog
          kind={endKind}
          name={profile.name ?? "this member"}
          busy={actionBusy !== null}
          onCancel={() => setEndKind(null)}
          onConfirm={(reason) =>
            endKind === "unmatch" ? void runUnmatch(reason) : void runDeleteConversation()
          }
          onReport={() => {
            setEndKind(null);
            setReportOpen(true);
          }}
        />
      ) : null}

      {reportOpen && profile ? (
        <div
          className="fixed inset-0 z-[170] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setReportOpen(false)}
        >
          <div
            className="animate-scale-in w-full max-w-[400px] rounded-[24px] border border-white/[0.09] bg-[#0c101d] p-5 shadow-[0_50px_120px_-24px_rgba(0,0,0,0.95)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-[18px] font-medium text-[var(--sr-pearl)]">
              Report {profile.name}
            </p>
            <p className="mt-1 text-[12px] leading-4 text-[var(--sr-mist)]">
              Reports are confidential. They never see this. What&apos;s wrong?
            </p>
            <div className="mt-4 space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReportReason(r.value)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left text-[13px] font-semibold transition ${
                    reportReason === r.value
                      ? "border-[#f0906a]/60 bg-[#f0906a]/10 text-[var(--sr-pearl)]"
                      : "border-white/[0.08] bg-white/[0.03] text-[var(--sr-mist)] hover:text-[var(--sr-pearl)]"
                  }`}
                >
                  {r.label}
                  {reportReason === r.value ? <span className="text-[#ffb894]">●</span> : null}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={!reportReason || reportBusy}
                onClick={() => void submitReport()}
                className="fb-sr-hello flex-1"
              >
                {reportBusy ? "Sending…" : "Submit report"}
              </button>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-[13px] font-semibold text-[var(--sr-mist)] transition hover:text-[var(--sr-pearl)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lightboxIdx !== null && profile && photos.length > 0 ? (
        <PhotoLightbox
          photos={photos}
          name={profile.name}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      ) : null}
    </div>
  );
}
