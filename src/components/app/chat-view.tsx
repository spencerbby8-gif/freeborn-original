"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";
import { ProfileView } from "./profile-view";

type MatchRow = {
  id: string;
  with: { id: string; name: string; city: string; photo: string };
  lastMessage: { body: string; mine: boolean; at: string } | null;
  unread: number;
};

type MessageRow = { id: string; body: string; mine: boolean; at: string; read: boolean };

function authHeaders(token: string | null) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function Avatar({ photo, name, size = 48 }: { photo: string; name: string; size?: number }) {
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full border border-white/10 object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] font-black text-white"
    >
      {name.charAt(0)}
    </span>
  );
}

function Thread({
  match,
  token,
  onBack,
  onChanged,
  onTapProfile,
}: {
  match: MatchRow;
  token: string | null;
  onBack: () => void;
  onChanged: () => void;
  onTapProfile: (id: string) => void;
}) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/chat/messages?match=${match.id}`, {
      headers: authHeaders(token),
    });
    if (res.ok) {
      const json = await res.json();
      setMessages(json.messages);
    }
  }, [match.id, token]);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 4000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const send = async () => {
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    setText("");
    await fetch("/api/chat/messages", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ match: match.id, text: clean }),
    }).catch(() => undefined);
    setSending(false);
    setTimeout(() => void load(), 600);
    setTimeout(() => {
      void load();
      onChanged();
    }, 3000);
  };

  // --- media uploads (image / video / voice) → Supabase Storage ---
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const uploadAndSend = async (dataUrl: string, kind: "image" | "video" | "voice") => {
    setUploading(true);
    try {
      const res = await fetch("/api/chat/upload", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ data: dataUrl, kind }),
      });
      if (!res.ok) throw new Error("upload failed");
      const json = await res.json();
      const marker = `[[${kind}:${json.url}]]`;
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ match: match.id, text: marker }),
      });
      setTimeout(() => void load(), 600);
      setTimeout(() => {
        void load();
        onChanged();
      }, 2500);
    } finally {
      setUploading(false);
    }
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "video") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => void uploadAndSend(String(reader.result), kind);
    reader.readAsDataURL(file);
  };

  const toggleVoice = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => void uploadAndSend(String(reader.result), "voice");
        reader.readAsDataURL(blob);
        setRecording(false);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  // Render a message body, expanding [[kind:url]] media markers.
  const renderBody = (body: string, mine: boolean) => {
    const media = /^\[\[(image|video|voice):(.+)\]\]$/.exec(body);
    if (media) {
      const kind = media[1];
      const url = media[2];
      if (kind === "image") {
        return <img src={url} alt="Shared photo" className="max-h-[320px] w-full rounded-xl object-cover" />;
      }
      if (kind === "video") {
        return <video src={url} controls className="max-h-[320px] w-full rounded-xl" />;
      }
      return (
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0014 0M12 18v3" />
          </svg>
          <audio src={url} controls className="h-9 max-w-[220px]" />
        </div>
      );
    }
    return body;
  };

  return (
    <div className="flex h-[calc(100dvh-200px)] flex-col lg:h-[calc(100dvh-120px)]">
      <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-mist)] transition hover:text-[var(--color-pearl)]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onTapProfile(match.with.id)}
          aria-label={`View ${match.with.name}'s profile`}
          className="flex items-center gap-3 text-left transition hover:opacity-85"
        >
          <Avatar photo={match.with.photo} name={match.with.name} size={40} />
          <div>
            <p className="text-[15px] font-black">{match.with.name}</p>
            <p className="text-[12px] text-[var(--color-mist)]">
              {match.with.city || "Freeborn member"} · view profile
            </p>
          </div>
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-5">
        {messages.length === 0 ? (
          <p className="pt-10 text-center text-sm text-[var(--color-mist)]">
            The conversation is open — say hello.
          </p>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[78%] rounded-[20px] px-4 py-2.5 text-[14px] leading-6 ${
                m.mine
                  ? "rounded-br-md bg-[var(--gradient-ember-warm)] text-white shadow-[0_8px_20px_-10px_rgba(239,94,94,0.6)]"
                  : "rounded-bl-md border border-white/[0.07] bg-white/[0.045] text-[var(--color-ivory)]"
              }`}
            >
              {renderBody(m.body, m.mine)}
              <span className={`mt-1 block text-[10px] ${m.mine ? "text-white/70" : "text-[var(--color-ash)]"}`}>
                {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Hidden file pickers */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFilePicked(e, "image")} />
      <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => void onFilePicked(e, "video")} />

      <div className="flex items-center gap-2 border-t border-white/[0.06] pt-4">
        {/* Image */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Send a photo"
          title="Send a photo"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-sand)] transition hover:bg-white/[0.08] hover:text-[var(--color-pearl)] disabled:opacity-40"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="M21 16l-4.5-4.5L9 18" />
          </svg>
        </button>
        {/* Video */}
        <button
          type="button"
          onClick={() => videoRef.current?.click()}
          disabled={uploading}
          aria-label="Send a video"
          title="Send a video"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-sand)] transition hover:bg-white/[0.08] hover:text-[var(--color-pearl)] disabled:opacity-40"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="6" width="13" height="12" rx="2.5" />
            <path d="M16 10.5l5-3v9l-5-3" />
          </svg>
        </button>
        {/* Voice note */}
        <button
          type="button"
          onClick={() => void toggleVoice()}
          disabled={uploading}
          aria-label={recording ? "Stop recording" : "Record a voice note"}
          title={recording ? "Stop recording" : "Voice note"}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-40 ${
            recording
              ? "border-red-400/60 bg-red-500/20 text-red-300"
              : "border-white/10 bg-white/[0.04] text-[var(--color-sand)] hover:bg-white/[0.08] hover:text-[var(--color-pearl)]"
          }`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0014 0M12 18v3" />
          </svg>
        </button>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={recording ? "Recording… tap mic to stop" : `Message ${match.with.name}…`}
          maxLength={2000}
          className="min-h-[48px] flex-1 rounded-full border border-white/10 bg-white/[0.04] px-5 text-[14px] text-[var(--color-pearl)] outline-none transition placeholder:text-[var(--color-ash)] focus:border-[var(--color-gold-500)]"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || uploading || !text.trim()}
          aria-label="Send message"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] text-white shadow-[var(--shadow-primary-btn)] transition active:scale-95 disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function ChatView() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMatch, setOpenMatch] = useState<MatchRow | null>(null);
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await getAccessToken();
    setToken(t);
    const res = await fetch("/api/chat/matches", {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    if (res.ok) {
      const json = await res.json();
      setMatches(json.matches);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep link: /app/chat?match=<id> opens that conversation directly.
  useEffect(() => {
    if (loading) return;
    const param = new URLSearchParams(window.location.search).get("match");
    if (!param) return;
    const found = matches.find((m) => m.id === param);
    if (found) {
      setOpenMatch(found);
    } else {
      // Match may have been created just now — refresh once.
      void load();
    }
  }, [loading, matches, load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
      </div>
    );
  }

  const profileOverlay = openProfileId ? (
    <ProfileView profileId={openProfileId} onClose={() => setOpenProfileId(null)} />
  ) : null;

  if (openMatch) {
    return (
      <>
        <Thread
          match={openMatch}
          token={token}
          onBack={() => setOpenMatch(null)}
          onChanged={() => void load()}
          onTapProfile={(id) => setOpenProfileId(id)}
        />
        {profileOverlay}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[680px]">
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Chat</h1>
      <p className="mt-1.5 text-sm text-[var(--color-mist)]">
        Your matches and conversations — values already on the table.
      </p>

      {matches.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-white/[0.07] bg-white/[0.02] p-10 text-center">
          <p className="font-display text-xl font-semibold">No conversations yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--color-mist)]">
            When you like someone in Discover and it's mutual, the conversation opens here.
          </p>
          <a
            href="/app"
            className="btn-ember btn-shine relative mt-6 inline-flex overflow-hidden rounded-full px-7 py-3 text-sm font-bold"
          >
            Go to Discover
          </a>
        </div>
      ) : (
        <div className="mt-6 space-y-2.5">
          {matches.map((m) => (
            <div
              key={m.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenMatch(m)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setOpenMatch(m);
              }}
              className="flex w-full cursor-pointer items-center gap-4 rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-4 text-left transition hover:border-white/[0.14] hover:bg-white/[0.05]"
            >
              <button
                type="button"
                aria-label={`View ${m.with.name}'s profile`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenProfileId(m.with.id);
                }}
                className="shrink-0 transition hover:opacity-85"
              >
                <Avatar photo={m.with.photo} name={m.with.name} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[15px] font-black">{m.with.name}</p>
                  {m.lastMessage ? (
                    <span className="shrink-0 text-[11px] text-[var(--color-ash)]">
                      {timeAgo(m.lastMessage.at)}
                    </span>
                  ) : null}
                </div>
                <p className={`truncate text-[13px] ${m.unread > 0 ? "font-bold text-[var(--color-pearl)]" : "text-[var(--color-mist)]"}`}>
                  {m.lastMessage
                    ? `${m.lastMessage.mine ? "You: " : ""}${m.lastMessage.body}`
                    : "Say hello — the conversation is open."}
                </p>
              </div>
              {m.unread > 0 ? (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] px-1.5 text-[11px] font-black text-white">
                  {m.unread}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {profileOverlay}
    </div>
  );
}
