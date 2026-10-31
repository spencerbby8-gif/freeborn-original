"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * The four states a screen can be in besides "showing content".
 *
 * They are components because the app's states were prose: a loading screen was a spinner in one
 * place and nothing in another, and an error that never offers an action leaves the member stuck.
 * What the primitives add is the part no one hand-rolls consistently — the live-region semantics.
 * `LoadingState` is `role="status" aria-live="polite"` so "Loading your matches" is announced when
 * it appears and its replacement is announced when it goes; `ErrorState` is `role="alert"`, because
 * a failure the member has to discover by reading is a failure they may never notice.
 */

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`fb-skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function LoadingState({ label = "Loading\u2026", children }: { label?: string; children?: ReactNode }) {
  return (
    <div className="fb-state" role="status" aria-live="polite">
      <span className="fb-cta--loading" aria-hidden="true" style={{ width: "1.25rem", height: "1.25rem" }} />
      <span className="fb-state__title">{label}</span>
      {children ? <span className="fb-state__body">{children}</span> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="fb-state">
      <span className="fb-state__title">{title}</span>
      {body ? <span className="fb-state__body">{body}</span> : null}
      {action ? (
        <span className="fb-state__action">
          <Button variant="quiet" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </span>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  body,
  onRetry,
  retryLabel = "Try again",
}: {
  title?: string;
  body?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="fb-state fb-state--error" role="alert">
      <span className="fb-state__title">{title}</span>
      {body ? <span className="fb-state__body">{body}</span> : null}
      {onRetry ? (
        <span className="fb-state__action fb-state__action--danger">
          <Button variant="danger" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </span>
      ) : null}
    </div>
  );
}
