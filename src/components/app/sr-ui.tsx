"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BackArrowIcon } from "@/components/ui/line-icons";

/**
 * The shared screen kit.
 *
 * Every screen in the reference is built from the same six parts: a header
 * (optional back arrow, serif title, optional right-hand action or count disc),
 * an optional subtitle, a row of pill filters, the content, and the pinned tab
 * bar supplied by the shell. Before this file those parts were re-typed inline
 * on Discover only; the other tabs used the older card/chip components and
 * looked like a different product.
 *
 * Measurements come from the eight-screen reference sheet. Its screens are
 * stylised renders at slightly different pixel widths, so these are the
 * proportions that hold across all eight rather than one screen's raw pixels:
 *
 *   screen gutter        20px  (title, subtitle, rows all share it)
 *   title                Fraunces, 27px/1.12, 400
 *   subtitle             12.5px/1.55, --fb-sr-mist
 *   pill (filter)        32px tall, 14px side pad, radius 999
 *   pill (selected)      cream fill, dark ink
 *   row card             radius 16, 1px --fb-sr-line, --fb-sr-card fill
 *   list divider         inset 1px --fb-sr-line
 */

export function SrScreen({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`fb-sr-sheet-screen mx-auto flex w-full max-w-[440px] flex-col ${className}`}>
      {children}
    </div>
  );
}

/** Serif page title, optionally preceded by a back arrow. */
export function SrTitle({
  children,
  back,
  right,
  className = "",
}: {
  children: ReactNode;
  back?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`fb-sr-title-row ${className}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        {back ? (
          <Link href={back} aria-label="Go back" className="fb-sr-back">
            <BackArrowIcon size={19} />
          </Link>
        ) : null}
        <h1 className="fb-sr-title">{children}</h1>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/** Small round count badge that sits beside a title, e.g. "People who like you (12)". */
export function SrCount({ value }: { value: number }) {
  if (!value) return null;
  return <span className="fb-sr-count">{value > 99 ? "99+" : value}</span>;
}

export function SrSubtitle({ children }: { children: ReactNode }) {
  return <p className="fb-sr-subtitle">{children}</p>;
}

/** A row of selectable pills. */
export function SrPillRow({ children }: { children: ReactNode }) {
  return <div className="fb-sr-pillrow">{children}</div>;
}

export function SrPill({
  children,
  active = false,
  onClick,
  badge,
  label,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  badge?: number | string | null;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      data-active={active}
      className="fb-sr-pill"
    >
      {children}
      {badge ? <span className="fb-sr-pill__badge">{badge}</span> : null}
    </button>
  );
}

/** Standard section label ("New", "Interests", …). */
export function SrSectionLabel({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "gold";
}) {
  return <p className="fb-sr-sectionlabel" data-tone={tone}>{children}</p>;
}

/** A bordered group of rows, as Settings, About me and My photos use. */
export function SrGroup({ children }: { children: ReactNode }) {
  return <div className="fb-sr-group">{children}</div>;
}

/** One navigational row inside a group. */
export function SrRow({
  icon,
  children,
  href,
  onClick,
  hint,
  danger = false,
}: {
  icon?: ReactNode;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  hint?: ReactNode;
  danger?: boolean;
}) {
  const inner = (
    <>
      {icon ? <span className="fb-sr-row__icon">{icon}</span> : null}
      <span className="fb-sr-row__label">{children}</span>
      {hint ? <span className="fb-sr-row__hint">{hint}</span> : null}
      <span className="fb-sr-row__chev" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="fb-sr-row" data-danger={danger}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="fb-sr-row" data-danger={danger}>
      {inner}
    </button>
  );
}

/**
 * The cream primary button. The reference uses it for "Save preferences" and
 * "Upgrade Now"; the deck's "Say hello" is the same control at a different size.
 */
export function SrPrimary({
  children,
  onClick,
  href,
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const cls = `fb-sr-primary ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/** Simple centred empty state used by Likes, Messages and Notifications. */
export function SrEmpty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="fb-sr-empty">
      <p className="fb-sr-empty__title">{title}</p>
      <p className="fb-sr-empty__body">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Skeleton shimmer used while a tab's data loads. */
export function SrLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="mt-4 flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="fb-sr-skel" style={{ height: 76 }} />
      ))}
    </div>
  );
}
