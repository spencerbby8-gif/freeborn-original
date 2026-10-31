"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";


/**
 * The icon-only control the app kept hand-rolling.
 *
 * Why this exists as a component rather than a class: an icon button has no visible label, so
 * its accessible name has to come from somewhere, and in the audited markup it usually did not.
 * `aria-label` is therefore required by the TYPE — omitting it is a compile error, which is the
 * only enforcement that survives a future edit. A 28px "remove photo" disc that announces nothing
 * is invisible to a screen reader and barely visible to a finger, and both problems are fixed here
 * once instead of at 40 call sites.
 *
 * The sizes are tokens (`--control-h-sm/md/lg`), so this cannot drift the way the raw markup did
 * (40/42/46/48/52px for the same role). `xs` is the deliberate exception: it is the size a photo
 * tile can carry without eating the image, and it stays a real 44px target because the pseudo-
 * element `.fb-icon-btn--xs::before` extends the hit area, not the paint.
 */
export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /** Required: an icon button without an accessible name is not a control, it is a guess. */
  "aria-label": string;
  size?: "xs" | "sm" | "md" | "lg";
  /** No border or surface — for controls that sit on top of a photo. */
  bare?: boolean;
  /** Destructive tint (unmatch, remove). Not "danger action"; that is `Button variant="danger"`. */
  tone?: "default" | "danger";
  children: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = "md", bare = false, tone = "default", className, children, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        "fb-icon-btn",
        size !== "md" ? `fb-icon-btn--${size}` : "",
        bare ? "fb-icon-btn--bare" : "",
        tone === "danger" ? "fb-icon-btn--danger" : "",
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      <span className="inline-flex items-center justify-center" aria-hidden="true">
        {children}
      </span>
    </button>
  );
});

export default IconButton;
