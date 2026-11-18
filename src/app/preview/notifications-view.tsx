"use client";

import { useMemo, useState } from "react";
import { PhotoImage } from "@/components/ui/photo-image";
import { SrEmpty, SrPill, SrPillRow, SrScreen, SrSectionLabel, SrTitle } from "@/components/app/sr-ui";
import { NOTICES, type Notice } from "./fixtures";

/**
 * Notifications.
 *
 * From the reference's fifth screen: serif "Notifications" title with a "Clear all"
 * action, five filter pills (All / Likes / Messages / Matches / System), a "New"
 * section label, then one card per event. Each card carries a tinted circular icon
 * on the left — red for likes and matches, teal for messages, slate for views,
 * gold for nearby — the event text, and a rounded thumbnail on the right.
 */

type Kind = "All" | "Likes" | "Messages" | "Matches" | "System";

const TONE: Record<Notice["kind"], string> = {
  like: "ember",
  match: "ember",
  message: "mint",
  view: "slate",
  nearby: "gold",
};

function Icon({ kind }: { kind: Notice["kind"] }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "like") {
    return (
      <svg {...common}>
        <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.5 10.4-8.5 10.4z" />
      </svg>
    );
  }
  if (kind === "match") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3.2" />
        <circle cx="16.4" cy="9.4" r="2.6" />
        <path d="M3.4 19c.6-3 2.9-4.6 5.6-4.6s5 1.6 5.6 4.6" />
        <path d="M15.4 14.8c2.4.1 4.2 1.6 4.7 4.2" />
      </svg>
    );
  }
  if (kind === "message") {
    return (
      <svg {...common}>
        <path d="M20 12.2c0 3.9-3.6 7-8 7a8.9 8.9 0 01-2.6-.38L5 20.5l1.2-3.3A6.7 6.7 0 014 12.2c0-3.9 3.6-7 8-7s8 3.1 8 7z" />
      </svg>
    );
  }
  if (kind === "view") {
    return (
      <svg {...common}>
        <path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12z" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M18 15.6V10a6 6 0 10-12 0v5.6L4.4 18h15.2L18 15.6z" />
      <path d="M10 20.4a2.2 2.2 0 004 0" />
    </svg>
  );
}

export function NotificationsView() {
  const [filter, setFilter] = useState<Kind>("All");
  const [cleared, setCleared] = useState<string[]>([]);

  const visible = useMemo(() => {
    const live = NOTICES.filter((n) => !cleared.includes(n.id));
    if (filter === "All") return live;
    if (filter === "Likes") return live.filter((n) => n.kind === "like");
    if (filter === "Messages") return live.filter((n) => n.kind === "message");
    if (filter === "Matches") return live.filter((n) => n.kind === "match");
    return live.filter((n) => n.kind === "view" || n.kind === "nearby");
  }, [filter, cleared]);

  return (
    <SrScreen>
      <SrTitle
        right={
          <button
            type="button"
            onClick={() => setCleared(NOTICES.map((n) => n.id))}
            className="fb-sr-clearbtn"
            disabled={visible.length === 0}
          >
            Clear all
          </button>
        }
      >
        Notifications
      </SrTitle>

      <SrPillRow>
        {(["All", "Likes", "Messages", "Matches", "System"] as Kind[]).map((k) => (
          <SrPill key={k} active={filter === k} onClick={() => setFilter(k)}>
            {k}
          </SrPill>
        ))}
      </SrPillRow>

      {visible.length === 0 ? (
        <SrEmpty
          title="You're all caught up"
          body="New likes, messages and matches will land here. Nothing is waiting on you right now."
        />
      ) : (
        <>
          <SrSectionLabel>New</SrSectionLabel>
          <div className="fb-sr-noticelist">
            {visible.map((n) => (
              <article key={n.id} className="fb-sr-notice">
                <span className="fb-sr-notice__icon" data-tone={TONE[n.kind]}>
                  <Icon kind={n.kind} />
                </span>
                <div className="fb-sr-notice__body">
                  <p className="fb-sr-notice__title">{n.title}</p>
                  <p className="fb-sr-notice__sub">{n.body}</p>
                </div>
                {n.photo ? (
                  <span className="fb-sr-notice__thumb">
                    <PhotoImage src={n.photo} alt="" className="h-full w-full" imgClassName="h-full w-full object-cover" />
                  </span>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
    </SrScreen>
  );
}
