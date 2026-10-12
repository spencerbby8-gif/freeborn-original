"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient, getAccessToken } from "@/lib/supabase/browser";
import { openVerifyFlow } from "./verify-modal";
import { FreebornSelect } from "@/components/select-menu";
import { showToast } from "@/components/toast-host";

/**
 * Freeborn mixers — real people in real places. Members register interest in
 * a city; the numbers shown are real counts, never inflated.
 */
export function MixerCard({ defaultCity }: { defaultCity: string }) {
  const [city, setCity] = useState(defaultCity);
  const [sameCity, setSameCity] = useState<number | null>(null);
  const [interested, setInterested] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const token = await getAccessToken().catch(() => null);
      if (!token) return;
      try {
        const res = await fetch("/api/events/interest", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setInterested(Boolean(json.interested));
          if (json.myCity) setCity(json.myCity);
          setSameCity(json.sameCity ?? 0);
        }
      } catch {
        /* card stays interactive */
      }
    })();
  }, []);

  const register = async () => {
    if (busy || city.trim().length < 2) return;
    setBusy(true);
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/events/interest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ city: city.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setInterested(true);
        setSameCity(json.sameCity ?? 0);
        showToast({
          tone: "success",
          title: "You're on the mixer list",
          body: `We'll announce the first Freeborn mixer in ${city.trim()} the moment it's real.`,
        });
      } else {
        showToast({ tone: "error", title: "Couldn't register interest", body: json.error ?? "Try again." });
      }
    } catch {
      showToast({ tone: "error", title: "Couldn't register interest", body: "Check your connection." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
      <p className="text-[13px] font-black uppercase tracking-[0.14em] text-[var(--color-gold-300)]">
        Freeborn mixers · real people, real places
      </p>
      <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--color-mist)]">
        No swiping forever — we&apos;re building in-person mixers city by city. Register your
        city and we&apos;ll announce one the moment enough members are ready.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Your city"
          className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-[13px] text-[var(--color-pearl)] outline-none transition placeholder:text-[var(--color-ash)] focus:border-[var(--color-gold-500)]"
        />
        <button
          type="button"
          disabled={busy || city.trim().length < 2}
          onClick={() => void register()}
          className="rounded-xl bg-[var(--gradient-ember-warm)] px-4 py-2.5 text-[12.5px] font-black text-white transition active:scale-95 disabled:opacity-50"
        >
          {interested ? "Update city" : busy ? "Saving…" : "Count me in"}
        </button>
      </div>
      {interested && sameCity !== null ? (
        <p className="mt-2.5 text-[12px] font-bold text-[var(--color-teal-300)]">
          ✓ You&apos;re in — {sameCity} {sameCity === 1 ? "member wants" : "members want"} a mixer in {city.trim() || "your city"}.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Talk to a real human — messages land in the support queue, no bots.
 */
function SupportCard() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (busy || message.trim().length < 5) return;
    setBusy(true);
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: message.trim(), email: email.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage("");
        showToast({
          tone: "success",
          title: "Message received",
          body: "A real person reads these — no bots, no canned replies.",
        });
      } else {
        showToast({ tone: "error", title: "Couldn't send your message", body: json.error ?? "Try again." });
      }
    } catch {
      showToast({ tone: "error", title: "Couldn't send your message", body: "Check your connection." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
      <p className="text-[13px] font-black uppercase tracking-[0.14em] text-[var(--color-sand)]">
        Talk to a real human
      </p>
      <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--color-mist)]">
        Something broken, something unsafe, or just a question? Write it here — a real
        person reads every message.
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What's going on?"
        className="mt-3 min-h-[88px] w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[13px] leading-5 text-[var(--color-pearl)] outline-none transition placeholder:text-[var(--color-ash)] focus:border-[var(--color-gold-500)]"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Reply-to email (optional)"
        type="email"
        className="mt-2 min-h-[44px] w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-[13px] text-[var(--color-pearl)] outline-none transition placeholder:text-[var(--color-ash)] focus:border-[var(--color-gold-500)]"
      />
      <button
        type="button"
        disabled={busy || message.trim().length < 5}
        onClick={() => void send()}
        className="mt-2.5 rounded-xl bg-[var(--gradient-ember-warm)] px-5 py-2.5 text-[12.5px] font-black text-white transition active:scale-95 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send message"}
      </button>
    </div>
  );
}

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
    messagePrivacy: string;
    discoverPrivacy: string;
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
  privacy: {
    discoveryPaused: boolean;
    incognito: boolean;
    hideDistance: boolean;
    hideActiveStatus: boolean;
    readReceipts: boolean;
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

function Field({ label, children, search }: { label: string; children: ReactNode; search?: string }) {
  return (
    <div className="space-y-2" data-search={search ?? label}>
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
  search,
}: {
  label: string;
  body: string;
  value: boolean;
  onChange: (v: boolean) => void;
  search?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      data-search={search ?? `${label} ${body}`}
      className={`fb-row transition ${
        value ? "border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/[0.06]" : "hover:bg-white/[0.045]"
      }`}
    >
      <span className="fb-row-body">
        <span className="fb-row-title">{label}</span>
        <span className="fb-row-desc">{body}</span>
      </span>
      <span className="fb-toggle" data-on={value} aria-hidden />
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
        <span className="animate-scale-in text-[12px] font-bold text-[var(--color-danger)]">Couldn&apos;t save — try again</span>
      ) : null}
    </div>
  );
}

function PanelTitle({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="fb-section-head" data-search={`${title} ${blurb}`}>
      <h2 className="fb-h-title">{title}</h2>
      <p className="fb-meta">{blurb}</p>
    </div>
  );
}

/**
 * Blocked members manager — list + unblock. Blocked members are never
 * notified; unblocking simply removes the block.
 */
function BlockedList() {
  const [blocked, setBlocked] = useState<Array<{ id: string; name: string; city: string; photo: string; blockedAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/blocks", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        const json = await res.json();
        setBlocked(Array.isArray(json.blocked) ? json.blocked : []);
      }
    } catch {
      /* list stays empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const unblock = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/blocks", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ profileId: id }),
      });
      if (res.ok) {
        setBlocked((prev) => prev.filter((b) => b.id !== id));
        showToast({ tone: "success", title: "Member unblocked", body: "They can see you in the room again." });
      } else {
        showToast({ tone: "error", title: "Couldn't unblock", body: "Try again in a moment." });
      }
    } catch {
      showToast({ tone: "error", title: "Couldn't unblock", body: "Check your connection." });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <p className="fb-caption">Loading your blocked list…</p>;
  }

  if (blocked.length === 0) {
    return (
      <p className="fb-caption">
        No blocked members. When you block someone, they appear here — and you can unblock them anytime.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {blocked.map((b) => (
        <div key={b.id} className="fb-row">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-abyss)]">
            {b.photo ? (
              <img src={b.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-sm font-bold text-[var(--color-pearl)]">
                {b.name.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <span className="fb-row-body">
            <span className="fb-row-title">{b.name}</span>
            <span className="fb-row-desc">{b.city || "Blocked member"}</span>
          </span>
          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => void unblock(b.id)}
            className="fb-btn fb-btn-ghost fb-btn-sm shrink-0"
          >
            {busyId === b.id ? "Unblocking…" : "Unblock"}
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Browser notification permission status — honest, using the real
 * Notification API. "default" means the browser will ask when we request;
 * "denied" means the OS-level block must be lifted in browser settings.
 */
function NotificationPermissionRow() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const [busy, setBusy] = useState(false);

  const request = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch {
      setPermission("unsupported");
    } finally {
      setBusy(false);
    }
  };

  if (permission === "unsupported") {
    return (
      <p className="fb-caption" data-search="browser notifications permission alerts device">
        This browser doesn&apos;t support notification permissions — alerts still show inside Freeborn.
      </p>
    );
  }

  return (
    <div className="fb-row" data-search="browser notifications permission allow alerts device">
      <span className={`fb-row-icon ${
        permission === "granted"
          ? "!text-[var(--color-teal-300)]"
          : permission === "denied"
            ? "!text-[var(--color-danger)]"
            : ""
      }`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8.4a6 6 0 10-12 0c0 6.6-2.7 8.4-2.7 8.4h17.4S18 15 18 8.4z" />
          <path d="M13.7 20a2 2 0 01-3.4 0" />
        </svg>
      </span>
      <span className="fb-row-body">
        <span className="fb-row-title">
          {permission === "granted"
            ? "Browser notifications allowed"
            : permission === "denied"
              ? "Browser notifications blocked"
              : "Allow browser notifications"}
        </span>
        <span className="fb-row-desc">
          {permission === "granted"
            ? "You'll get alerts even when Freeborn is in another tab."
            : permission === "denied"
              ? "Blocked in this browser's settings — allow freeborn.netlify.app to change it."
              : "Get alerts even when Freeborn is in another tab."}
        </span>
      </span>
      {permission === "default" ? (
        <button
          type="button"
          onClick={() => void request()}
          disabled={busy}
          className="fb-btn fb-btn-ghost fb-btn-sm shrink-0"
        >
          {busy ? "Asking…" : "Allow"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * "Your data" — self-serve export (GDPR/CCPA pattern). Downloads a JSON of
 * everything that is the member's own data; other members appear only as
 * ids/timestamps, and verification selfies are excluded (they are evidence,
 * not profile data — the note says so).
 */
function DataCard() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setDone(false);
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/account/export", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `freeborn-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone(true);
      showToast({ tone: "success", title: "Export downloaded", body: "Your data is in the JSON file — keep it somewhere safe." });
    } catch {
      showToast({ tone: "error", title: "Couldn't build your export", body: "Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fb-card" data-search="download my data export gdpr privacy json backup">
      <p className="fb-eyebrow">Your data</p>
      <p className="fb-meta mt-1.5">
        Download everything that is yours — profile, photos list, preferences, activity,
        verification history. Other members appear only as ids; verification selfies are
        not part of the export.
      </p>
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="fb-btn fb-btn-ghost fb-btn-sm mt-3"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
        </svg>
        {busy ? "Building your export…" : done ? "Downloaded ✓" : "Download my data"}
      </button>
    </div>
  );
}

/**
 * Permanent deletion — deliberately harder than deactivate (which is
 * reversible): the member must type DELETE. Distinct, honest, no dark
 * patterns in either direction.
 */
function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const runDelete = async () => {
    if (typed !== "DELETE" || busy) return;
    setBusy(true);
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "delete" }),
      });
      if (res.ok) {
        try {
          const supabase = createSupabaseBrowserClient();
          await supabase.auth.signOut();
        } catch {
          /* the auth row is already gone */
        }
        window.location.href = "/?status=account-deleted";
        return;
      }
      const json = await res.json().catch(() => ({}));
      showToast({ tone: "error", title: "Couldn't delete the account", body: json.error ?? "Try again." });
    } catch {
      showToast({ tone: "error", title: "Couldn't delete the account", body: "Check your connection." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-400/30 bg-red-500/[0.06] p-4" data-search="delete account permanently erase remove destroy">
      <p className="text-[12px] font-bold uppercase tracking-wider text-red-300">Delete account — permanent</p>
      <p className="mt-1 text-[12px] leading-4 text-[var(--color-ash)]">
        Deletion is forever: your profile, photos, messages, matches, and sign-in are removed.
        This cannot be undone. (Pausing above is the reversible option.)
      </p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2.5 text-[12.5px] font-bold text-red-200 transition hover:bg-red-500/20"
        >
          Delete my account permanently
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-[12px] font-bold text-red-200">
            Type <span className="font-black">DELETE</span> to confirm — this cannot be undone.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="DELETE"
            aria-label="Type DELETE to confirm account deletion"
            className="min-h-[44px] w-full rounded-xl border border-red-400/30 bg-white/[0.03] px-4 text-[13.5px] font-bold tracking-widest text-[var(--color-pearl)] outline-none placeholder:text-[var(--color-ash)] focus:border-red-400"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || typed !== "DELETE"}
              onClick={() => void runDelete()}
              className="rounded-xl bg-red-500 px-4 py-2.5 text-[12.5px] font-black text-white transition hover:bg-red-400 disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete forever"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12.5px] font-bold text-[var(--color-mist)] transition hover:text-[var(--color-pearl)]"
            >
              Keep my account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [area, setArea] = useState<AreaId>("profile");
  /** Settings search — filters the rows of the active tab (Instagram/Android pattern). */
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  /* Hide rows that don't match the query; matching rows reveal their
     section context so the result still makes sense. */
  useEffect(() => {
    const root = panelRef.current;
    if (!root) return;
    const q = query.trim().toLowerCase();
    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-search]"));
    if (!q) {
      rows.forEach((r) => (r.style.display = ""));
      return;
    }
    rows.forEach((r) => {
      const hay = (r.getAttribute("data-search") ?? "").toLowerCase();
      r.style.display = hay.includes(q) ? "" : "none";
    });
  }, [query, area]);

  /* Account security state */
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [emailNew, setEmailNew] = useState("");
  const [accountMsg, setAccountMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const accountAction = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setAccountMsg(null);
    try {
      const token = await getAccessToken().catch(() => null);
      const res = await fetch("/api/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setAccountMsg({ ok: true, text: json.message ?? "Done." });
        const label =
          payload.action === "change-password"
            ? "Password changed"
            : payload.action === "change-email"
              ? "Email updated"
              : payload.action === "deactivate"
                ? "Account hidden"
                : "Account updated";
        showToast({
          tone: "success",
          title: label,
          body:
            payload.action === "change-password"
              ? "Your new password is active. Use it the next time you sign in."
              : json.message ?? "Saved.",
        });
      } else {
        setAccountMsg({ ok: false, text: json.error ?? "Something went wrong." });
        showToast({ tone: "error", title: "Couldn't save that change", body: json.error ?? "Try again." });
      }
      return res.ok;
    } catch {
      setAccountMsg({ ok: false, text: "Network error — try again." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (pwdNew !== pwdConfirm) {
      setAccountMsg({ ok: false, text: "The two password fields must match." });
      return;
    }
    const ok = await accountAction({ action: "change-password", newPassword: pwdNew });
    if (ok) {
      setPwdNew("");
      setPwdConfirm("");
    }
  };

  const signOutEverywhere = async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      /* fall through to redirect */
    }
    window.location.href = "/auth?mode=sign-in";
  };

  const deactivate = async () => {
    const ok = await accountAction({ action: "deactivate" });
    if (ok) {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      window.location.href = "/";
    }
  };
  const [accountFacts, setAccountFacts] = useState<{ email: string; createdAt: string | null; activeSignIns: number } | null>(null);
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
    (async () => {
      try {
        const token = await getAccessToken().catch(() => null);
        const res = await fetch("/api/account", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) setAccountFacts(await res.json());
      } catch {
        /* sessions card falls back to its generic copy */
      }
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
  const v = settings.privacy;

  const setP = (patch: Partial<typeof p>) => setSettings({ ...settings, profile: { ...p, ...patch } });
  const setD = (patch: Partial<typeof d>) => setSettings({ ...settings, discovery: { ...d, ...patch } });
  const setN = async (key: keyof typeof n, value: boolean) => {
    setSettings({ ...settings, notifications: { ...n, [key]: value } });
    await post({ notifications: { [key]: value } });
  };

  /* Privacy controls save the moment they flip — they are safety controls,
     so there is no Save button to forget. */
  const setV = async (patch: Partial<Settings["privacy"]>) => {
    setSettings({ ...settings, privacy: { ...v, ...patch } });
    await post({ privacy: patch });
  };

  return (
    <div className="fb-container pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="fb-h-hero">Settings</h1>
          <p className="fb-meta mt-1.5">Pick an area — everything lives in its place.</p>
        </div>
        <div className="fb-search w-full sm:w-72">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings"
            aria-label="Search settings"
            className="fb-input"
          />
        </div>
      </div>

      {/* Identity verification */}
      <div className="fb-row mt-5" data-search="identity verification verified seal selfie">
        {settings?.profile.isVerified ? (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[var(--color-teal-300)]">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 2.5l7.5 3v5.2c0 5-3.2 8.6-7.5 10.3-4.3-1.7-7.5-5.3-7.5-10.3V5.5l7.5-3z" />
                <path d="M8.8 12l2.2 2.2 4.2-4.6" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-black text-[var(--color-pearl)]">Identity check complete</p>
              <p className="mt-0.5 text-[11.5px] leading-4 text-[var(--color-mist)]">
                Your selfie check passed — your profile is confirmed as the real you.
              </p>
            </div>
          </>
        ) : (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/10 text-[var(--color-gold-300)]">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 2.5l7.5 3v5.2c0 5-3.2 8.6-7.5 10.3-4.3-1.7-7.5-5.3-7.5-10.3V5.5l7.5-3z" />
                <path d="M8.8 12l2.2 2.2 4.2-4.6" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-black text-[var(--color-pearl)]">Verify your identity</p>
              <p className="mt-0.5 text-[11.5px] leading-4 text-[var(--color-mist)]">
                Verified members get the teal seal, faster matches, and stronger protection.
              </p>
            </div>
            <button
              type="button"
              onClick={openVerifyFlow}
              className="shrink-0 rounded-full bg-[var(--gradient-ember-warm)] px-4 py-2 text-[12px] font-black text-white shadow-[var(--shadow-primary-btn)] transition active:scale-95"
            >
              Verify
            </button>
          </>
        )}
      </div>

      {/* Area navigation — sticks while long panels scroll */}
      <div className="sticky top-0 z-10 -mx-4 mt-5 bg-[#0a0d18]/95 px-4 py-3 backdrop-blur-lg sm:-mx-6 sm:px-6">
        <div className="flex gap-2 overflow-x-auto">
        {AREAS.map((a) => {
          const active = area === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setArea(a.id)}
              aria-pressed={active}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4.5 py-2.5 text-[13px] font-bold transition ${
                active
                  ? "border-transparent bg-[var(--gradient-ember-warm)] text-white shadow-[var(--shadow-primary-btn)]"
                  : "border-white/10 bg-white/[0.03] text-[var(--color-sand)] hover:border-white/25 hover:text-[var(--color-pearl)]"
              }`}
            >
              {active ? (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M2.2 6.4l2.4 2.4 5.2-5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
              {a.label}
            </button>
          );
        })}
        </div>
      </div>

      {/* Fixed area panel */}
      <div ref={panelRef} className="fb-card-lg animate-scale-in mt-5" key={area}>
        {area === "profile" ? (
          <div className="space-y-5">
            <PanelTitle title="Profile" blurb="The essentials people see. Honest works better." />
            <a
              href="/app/profile"
              data-search="full profile view preview photos prompts"
              className="fb-row transition hover:border-[var(--color-gold-500)]/40 hover:bg-[var(--color-gold-500)]/[0.05]"
            >
              <span className="fb-row-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </span>
              <span className="fb-row-body">
                <span className="fb-row-title">See your full profile</span>
                <span className="fb-row-desc">Photos, prompts, and how others read you — exactly as it appears.</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-ash)]" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </a>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name" search="display name what people call you">
                <input className={inputClass} value={p.displayName} maxLength={40} onChange={(e) => setP({ displayName: e.target.value })} />
                <span className="block text-right text-[11px] text-[var(--color-ash)] tabular-nums">{p.displayName.length}/40</span>
              </Field>
              <Field label="Occupation" search="occupation job work">
                <input className={inputClass} value={p.occupation} maxLength={80} placeholder="Optional" onChange={(e) => setP({ occupation: e.target.value })} />
                <span className="block text-right text-[11px] text-[var(--color-ash)] tabular-nums">{p.occupation.length}/80</span>
              </Field>
              <Field label="Education" search="education school degree study">
                <input className={inputClass} value={p.education} maxLength={80} placeholder="Optional" onChange={(e) => setP({ education: e.target.value })} />
                <span className="block text-right text-[11px] text-[var(--color-ash)] tabular-nums">{p.education.length}/80</span>
              </Field>
              <Field label="City" search="city town where you live location">
                <input className={inputClass} value={p.city} maxLength={60} onChange={(e) => setP({ city: e.target.value })} />
              </Field>
              <Field label="Region / state" search="region state province area">
                <input className={inputClass} value={p.region} maxLength={60} placeholder="Optional" onChange={(e) => setP({ region: e.target.value })} />
              </Field>
            </div>
            <Field label="Bio" search="bio about you story introduction">
              <textarea
                className={`${inputClass} min-h-[110px] resize-none leading-relaxed`}
                value={p.bio}
                maxLength={500}
                onChange={(e) => setP({ bio: e.target.value })}
              />
              <span className="block text-right text-[11px] text-[var(--color-ash)] tabular-nums">{p.bio.length}/500</span>
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
            <PanelTitle
              title="Discovery"
              blurb="Your standing preferences — the Filters panel fine-tunes a single session on top of these."
            />
            <p
              data-search="standing preferences filters session defaults note"
              className="fb-chip w-fit"
            >
              These apply to every session · the Filters panel can narrow one session further
            </p>
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
            <Field label="Maximum distance" search="maximum distance how far radius km anywhere range">
              <div className="flex flex-wrap gap-2">
                {DISTANCES.map((o) => {
                  const active = d.distanceKm === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setD({ distanceKm: o.value })}
                      aria-pressed={active}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold leading-4 transition ${
                        active
                          ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/15 text-[var(--color-pearl)] shadow-[0_0_12px_rgba(217,167,82,0.18)]"
                          : "border-white/10 bg-white/[0.02] text-[var(--color-sand)] hover:border-white/20"
                      }`}
                    >
                      {active ? (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                          <path d="M2.2 6.4l2.4 2.4 5.2-5.4" stroke="var(--color-gold-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Show me" search="show me genders who can see me women men non-binary gender preference">
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
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold leading-4 transition ${
                        active
                          ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/15 text-[var(--color-pearl)] shadow-[0_0_12px_rgba(217,167,82,0.18)]"
                          : "border-white/10 bg-white/[0.02] text-[var(--color-sand)] hover:border-white/20"
                      }`}
                    >
                      {active ? (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                          <path d="M2.2 6.4l2.4 2.4 5.2-5.4" stroke="var(--color-gold-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
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
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4" data-search="vaccination vaccine vax status preference filter">
              <p className="text-[13px] font-black text-[var(--color-pearl)]">Vaccination preference</p>
              <p className="mt-1 text-[12px] leading-4 text-[var(--color-mist)]">
                Who you see in the room — this is the one filter the whole platform is built around.
              </p>
              <div className="mt-2.5">
                <FreebornSelect
                  value={d.vaccinationPreference ?? "any"}
                  options={[
                    { value: "any", label: "Everyone" },
                    { value: "unvaccinated", label: "Only unvaccinated members" },
                    { value: "vaccinated", label: "Only vaccinated members" },
                  ]}
                  onChange={(v) => setD({ vaccinationPreference: v })}
                />
              </div>
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
            <NotificationPermissionRow />
            <ToggleRow label="New matches" body="When someone likes you back." value={n.matchAlerts} onChange={(v) => void setN("matchAlerts", v)} />
            <ToggleRow label="Messages" body="When a conversation gets a new message." value={n.messageAlerts} onChange={(v) => void setN("messageAlerts", v)} />
            <ToggleRow label="Likes" body="When someone likes your profile." value={n.likeAlerts} onChange={(v) => void setN("likeAlerts", v)} />
            <ToggleRow label="Profile activity" body="Occasional tips about your profile's reach." value={n.profileActivity} onChange={(v) => void setN("profileActivity", v)} />
          </div>
        ) : null}

        {area === "privacy" ? (
          <div className="space-y-3.5">
            <PanelTitle title="Privacy" blurb="You decide when you're visible. Every control saves as you flip it." />

            <p className="fb-eyebrow pt-1" data-search="visibility section">Visibility</p>
            <ToggleRow
              label="Discoverable"
              body="Off means you won't appear in anyone's Discover — matches and chats keep working."
              value={p.discoverable}
              onChange={async (val) => {
                setP({ discoverable: val });
                await post({ profile: { discoverable: val } });
              }}
            />
            <ToggleRow
              label="Pause discovery"
              body="Snooze — you leave the room but keep every match and conversation. Flip it off to come back."
              value={v.discoveryPaused}
              onChange={(val) => void setV({ discoveryPaused: val })}
            />
            <ToggleRow
              label="Incognito mode"
              body="Only members you've liked or matched with can see your profile. You still see everyone."
              value={v.incognito}
              onChange={(val) => void setV({ incognito: val })}
            />

            <p className="fb-eyebrow pt-1" data-search="location presence section">Location & presence</p>
            <ToggleRow
              label="Hide my distance"
              body="Others see your city, never how far away you are — exact location stays private."
              value={v.hideDistance}
              onChange={(val) => void setV({ hideDistance: val })}
            />
            <ToggleRow
              label="Hide my active status"
              body="No online indicator on your card or profile."
              value={v.hideActiveStatus}
              onChange={(val) => void setV({ hideActiveStatus: val })}
            />

            <p className="fb-eyebrow pt-1" data-search="messages section">Messages</p>
            <ToggleRow
              label="Read receipts"
              body="Let others see when you've read their messages. Turn off for full privacy."
              value={v.readReceipts}
              onChange={(val) => void setV({ readReceipts: val })}
            />

            {/* Who can see you in discovery */}
            <div className="fb-row !block" data-search="who can see you discover visible audience everyone verified unvaccinated">
              <p className="fb-row-title">Who can see you in Discover</p>
              <p className="fb-row-desc">Control who your card can appear to.</p>
              <div className="mt-2.5">
                <FreebornSelect
                  value={p.discoverPrivacy ?? "everyone"}
                  options={[
                    { value: "everyone", label: "Everyone" },
                    { value: "verified", label: "Only verified members" },
                    { value: "unvaccinated", label: "Only unvaccinated members" },
                  ]}
                  onChange={(val) => {
                    setP({ discoverPrivacy: val });
                    void post({ profile: { discoverPrivacy: val } });
                  }}
                />
              </div>
            </div>

            {/* Who can message you */}
            <div className="fb-row !block" data-search="who can message you contact start conversation everyone verified unvaccinated">
              <p className="fb-row-title">Who can message you</p>
              <p className="fb-row-desc">Applies when starting a conversation — and to every message after.</p>
              <div className="mt-2.5">
                <FreebornSelect
                  value={p.messagePrivacy ?? "everyone"}
                  options={[
                    { value: "everyone", label: "Everyone" },
                    { value: "verified", label: "Only verified members" },
                    { value: "unvaccinated", label: "Only unvaccinated members" },
                  ]}
                  onChange={(val) => {
                    setP({ messagePrivacy: val });
                    void post({ profile: { messagePrivacy: val } });
                  }}
                />
              </div>
            </div>

            <p className="fb-eyebrow pt-1" data-search="blocked members list unblock">Blocked members</p>
            <BlockedList />

            <p className="fb-caption" data-search="never shown publicly private email birth date coordinates fixed">
              Email, full birth date, and exact coordinates are never shown publicly — that&apos;s fixed, not a setting.
            </p>

            <div className="rounded-2xl border border-[var(--color-teal-500)]/20 bg-[var(--color-teal-500)]/[0.04] p-4" data-search="safety promise guarantee moderation">
              <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[var(--color-teal-300)]">
                Freeborn&apos;s safety promise
              </p>
              <ul className="mt-3 space-y-2 text-[12px] leading-5 text-[var(--color-mist)]">
                <li>· Identity checks use pose-mimic selfies with a moderation queue — never links sent in DMs.</li>
                <li>· Reports land in a moderation queue with rate limits, so one person can&apos;t weaponize them.</li>
                <li>· Chat media is stored privately per member — never sold, never handed to advertisers.</li>
                <li>· New profile photos require re-verification, so the teal seal always matches the face.</li>
                <li>· You can hide or deactivate your account at any time — one tap, no dark patterns.</li>
              </ul>
            </div>
          </div>
        ) : null}

        {area === "preferences" ? (
          <div className="space-y-4">
            <PanelTitle title="Preferences" blurb="How Freeborn feels for you. Saved on this device." />
            <div className="fb-card" data-search="distance units kilometers miles measurement">
              <p className="fb-eyebrow">Distance units</p>
              <div className="mt-3 flex gap-2">
                {(["km", "mi"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setPref("units", u)}
                    aria-pressed={prefs.units === u}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 text-[14px] font-bold transition ${
                      prefs.units === u
                        ? "border-[var(--color-gold-500)] bg-[var(--color-gold-500)]/15 text-[var(--color-pearl)] shadow-[0_0_12px_rgba(217,167,82,0.18)]"
                        : "border-white/10 bg-white/[0.02] text-[var(--color-sand)]"
                    }`}
                  >
                    {prefs.units === u ? (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M2.2 6.4l2.4 2.4 5.2-5.4" stroke="var(--color-gold-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
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
            <PanelTitle title="Account" blurb="Security, email, and control over your account." />

            {accountMsg ? (
              <p
                className={`rounded-xl border px-4 py-2.5 text-[12.5px] font-bold ${
                  accountMsg.ok
                    ? "border-[var(--color-teal-500)]/35 bg-[var(--color-teal-500)]/[0.08] text-[var(--color-teal-300)]"
                    : "border-red-400/30 bg-red-500/[0.08] text-red-300"
                }`}
              >
                {accountMsg.text}
              </p>
            ) : null}

            <div className="fb-card" data-search="email address private account sign in login">
              <p className="fb-eyebrow">Email (private)</p>
              <p className="mt-1 truncate text-[14px] font-medium text-[var(--color-mist)]">{settings.account.email}</p>
            </div>

            {/* Change email */}
            <div className="fb-card" data-search="change email new email address confirmation">
              <p className="fb-eyebrow">Change email</p>
              <p className="mt-1 text-[12px] leading-4 text-[var(--color-ash)]">
                We&apos;ll send a confirmation link to the new address before it takes effect.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={emailNew}
                  onChange={(e) => setEmailNew(e.target.value)}
                  type="email"
                  placeholder="new@email.com"
                  className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[13.5px] text-[var(--color-pearl)] outline-none placeholder:text-[var(--color-ash)] focus:border-white/25"
                />
                <button
                  type="button"
                  disabled={busy || !emailNew.trim()}
                  onClick={() => void accountAction({ action: "change-email", newEmail: emailNew.trim() }).then((ok) => ok && setEmailNew(""))}
                  className="rounded-xl bg-[var(--gradient-ember-warm)] px-4 text-[12.5px] font-black text-white transition active:scale-95 disabled:opacity-50"
                >
                  Update
                </button>
              </div>
            </div>

            {/* Change password */}
            <div className="fb-card" data-search="change password new password credentials security">
              <p className="fb-eyebrow">Change password</p>
              <p className="mt-1 text-[12px] leading-4 text-[var(--color-ash)]">
                At least 8 characters. Use one you don&apos;t reuse anywhere else.
              </p>
              <div className="mt-3 grid gap-2">
                <input
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="New password"
                  className="min-h-[44px] rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[13.5px] text-[var(--color-pearl)] outline-none placeholder:text-[var(--color-ash)] focus:border-white/25"
                />
                <input
                  value={pwdConfirm}
                  onChange={(e) => setPwdConfirm(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat new password"
                  className="min-h-[44px] rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[13.5px] text-[var(--color-pearl)] outline-none placeholder:text-[var(--color-ash)] focus:border-white/25"
                />
                <button
                  type="button"
                  disabled={busy || pwdNew.length < 8 || pwdNew !== pwdConfirm}
                  onClick={() => void changePassword()}
                  className="rounded-xl bg-[var(--gradient-ember-warm)] px-4 py-2.5 text-[12.5px] font-black text-white transition active:scale-95 disabled:opacity-50"
                >
                  Save new password
                </button>
              </div>
            </div>

            {/* Sessions */}
            <div className="fb-card" data-search="sessions devices sign out everywhere log out active sign ins">
              <p className="fb-eyebrow">Sessions</p>
              <p className="mt-1 text-[12px] leading-4 text-[var(--color-ash)]">
                {accountFacts
                  ? `${accountFacts.activeSignIns} active ${accountFacts.activeSignIns === 1 ? "sign-in" : "sign-ins"} on file. Signing out everywhere ends this session and every other device.`
                  : "Ends this session and every other device signed into your account."}
              </p>
              <button
                type="button"
                onClick={() => void signOutEverywhere()}
                className="fb-btn fb-btn-ghost fb-btn-sm mt-3"
              >
                Sign out of all devices
              </button>
            </div>

            <DataCard />

            {/* Danger zone */}
            <div className="fb-card border-red-400/25 bg-red-500/[0.05]" data-search="danger zone deactivate hide pause account">
              <p className="text-[12px] font-bold uppercase tracking-wider text-red-300">Danger zone</p>
              <p className="mt-1 text-[12px] leading-4 text-[var(--color-ash)]">
                Deactivating hides you from Discover immediately. Matches and history stay saved.
              </p>
              {!confirmDeactivate ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeactivate(true)}
                  className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-[12.5px] font-bold text-red-200 transition hover:bg-red-500/20"
                >
                  Deactivate my account
                </button>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deactivate()}
                    className="rounded-xl bg-red-500 px-4 py-2.5 text-[12.5px] font-black text-white transition hover:bg-red-400 disabled:opacity-50"
                  >
                    Yes, hide me now
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeactivate(false)}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12.5px] font-bold text-[var(--color-mist)] transition hover:text-[var(--color-pearl)]"
                  >
                    Keep my account
                  </button>
                </div>
              )}
            </div>

            <DeleteAccount />

            <MixerCard defaultCity={settings?.profile.city ?? ""} />
            <SupportCard />

            <form method="POST" action="/auth/signout">
              <button
                type="submit"
                className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-7 py-3.5 text-[13px] font-bold text-[var(--color-mist)] transition hover:border-white/25 hover:bg-white/[0.06] hover:text-[var(--color-pearl)]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <path d="M16 17l5-5-5-5M21 12H9" />
                </svg>
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
