"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PhotoImage } from "@/components/ui/photo-image";
import { SrEmpty, SrScreen, SrTitle } from "@/components/app/sr-ui";
import { PEOPLE, type Person } from "./fixtures";
import { ChatIcon, HeartIcon, MoreIcon } from "@/components/ui/line-icons";

/**
 * Messages — conversation list.
 *
 * From the reference's third screen: a serif "Messages" title with a search icon
 * and a compose button, a search field, a horizontally scrolling row of stories
 * (each a ringed portrait with the name beneath), then the conversation rows —
 * ringed avatar, name, last message, time, and an unread count in red.
 */

function StoryRing({ p }: { p: Person }) {
  return (
    <button type="button" className="fb-sr-story" aria-label={`${p.name}'s story`}>
      <span className="fb-sr-story__ring" data-new={p.story ? "true" : "false"}>
        <PhotoImage src={p.photo} alt="" className="h-full w-full" imgClassName="h-full w-full object-cover" />
      </span>
      <span className="fb-sr-story__name">{p.name}</span>
    </button>
  );
}

function Thread({ p, onOpen }: { p: Person; onOpen: () => void }) {
  const mine = p.lastMessage.startsWith("You:");
  return (
    <button type="button" onClick={onOpen} className="fb-sr-thread">
      <span className="fb-sr-thread__ring" data-unread={p.unread > 0 ? "true" : "false"}>
        <PhotoImage src={p.photo} alt="" className="h-full w-full" imgClassName="h-full w-full object-cover" />
      </span>
      <span className="fb-sr-thread__body">
        <span className="fb-sr-thread__top">
          <span className="fb-sr-thread__name">{p.name}</span>
          <span className="fb-sr-thread__time">{p.lastAt}</span>
        </span>
        <span className="fb-sr-thread__bottom">
          <span className="fb-sr-thread__msg" data-mine={mine ? "true" : "false"}>
            {p.lastMessage}
          </span>
          {p.unread > 0 ? <span className="fb-sr-thread__badge">{p.unread}</span> : null}
        </span>
      </span>
    </button>
  );
}

export function MessagesView({
  onOpenThread,
}: {
  onOpenThread?: (p: Person) => void;
}) {
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);

  const threads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PEOPLE;
    return PEOPLE.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.occupation.toLowerCase().includes(q) ||
        p.lastMessage.toLowerCase().includes(q),
    );
  }, [query]);

  const unread = PEOPLE.reduce((n, p) => n + p.unread, 0);

  return (
    <SrScreen>
      <SrTitle
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="fb-sr-iconbtn"
              aria-label="Search conversations"
              onClick={() => document.getElementById("fb-sr-thread-search")?.focus()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M16.5 16.5L21 21" />
              </svg>
            </button>
            <button
              type="button"
              className="fb-sr-iconbtn fb-sr-iconbtn--solid"
              aria-label="New message"
              aria-pressed={composing}
              onClick={() => setComposing((v) => !v)}
            >
              <ChatIcon size={17} />
            </button>
          </div>
        }
      >
        Messages
      </SrTitle>

      <div className="px-5 pt-3">
        <div className="fb-sr-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5L21 21" />
          </svg>
          <input
            id="fb-sr-thread-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="fb-sr-search__input"
            aria-label="Search conversations"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="fb-sr-search__clear">
              ×
            </button>
          ) : null}
        </div>
      </div>

      {composing ? (
        <div className="fb-sr-compose">
          <p className="fb-sr-compose__title">Start a conversation</p>
          <p className="fb-sr-compose__body">
            People you matched with are the ones you can message. You have {PEOPLE.length} open conversations.
          </p>
          <button type="button" onClick={() => setComposing(false)} className="fb-sr-compose__close">
            Close
          </button>
        </div>
      ) : null}

      {/* stories */}
      <div className="fb-sr-storyrow">
        <button type="button" className="fb-sr-story" aria-label="Add to your story">
          <span className="fb-sr-story__ring fb-sr-story__ring--add">
            <span aria-hidden className="text-[22px] leading-none">+</span>
          </span>
          <span className="fb-sr-story__name">Your story</span>
        </button>
        {PEOPLE.slice(0, 5).map((p) => (
          <StoryRing key={p.id} p={p} />
        ))}
      </div>

      <div className="fb-sr-threadlist">
        {threads.length === 0 ? (
          <SrEmpty
            title="No conversations found"
            body={`Nothing matches “${query}”. Try a name, a role, or a word from a message.`}
            action={
              <button type="button" onClick={() => setQuery("")} className="fb-sr-pill" style={{ height: 38, padding: "0 18px" }}>
                Clear search
              </button>
            }
          />
        ) : null}

        {threads.map((p) => (
          <Thread key={p.id} p={p} onOpen={() => onOpenThread?.(p)} />
        ))}
      </div>

      {unread > 0 && threads.length > 0 ? (
        <p className="fb-sr-threadfoot">
          {unread} unread {unread === 1 ? "message" : "messages"} ·{" "}
          <Link href="/preview?screen=notifications" className="text-[var(--fb-sr-gold)]">
            see notifications
          </Link>
        </p>
      ) : null}
    </SrScreen>
  );
}

/** A single conversation, opened from the list. */
export function ThreadView({ p, onBack }: { p: Person; onBack: () => void }) {
  const [messages, setMessages] = useState<{ from: "me" | "them"; text: string }[]>([
    { from: "them", text: p.bio },
  ]);
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [...m, { from: "me", text }]);
    setDraft("");
  };

  return (
    <SrScreen>
      <div className="fb-sr-threadhead">
        <button type="button" onClick={onBack} className="fb-sr-back" aria-label="Back to messages">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span className="fb-sr-threadhead__ring">
          <PhotoImage src={p.photo} alt="" className="h-full w-full" imgClassName="h-full w-full object-cover" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="fb-sr-threadhead__name">{p.name}</p>
          <p className="fb-sr-threadhead__sub">{p.occupation} · {p.city}</p>
        </div>
        <button type="button" className="fb-sr-iconbtn" aria-label="Conversation options">
          <MoreIcon size={18} />
        </button>
      </div>

      <div className="fb-sr-bubbles">
        {messages.map((m, i) => (
          <div key={i} className="fb-sr-bubble" data-from={m.from}>
            {m.text}
          </div>
        ))}
      </div>

      <div className="fb-sr-composer">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder={`Message ${p.name}…`}
          className="fb-sr-composer__input"
          aria-label={`Message ${p.name}`}
        />
        <button type="button" onClick={send} disabled={!draft.trim()} className="fb-sr-composer__send" aria-label="Send message">
          <HeartIcon size={16} />
        </button>
      </div>
    </SrScreen>
  );
}
