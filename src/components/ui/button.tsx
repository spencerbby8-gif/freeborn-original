"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * The button the app was missing.
 *
 * 155 hand-written <button> class strings had drifted into four heights, three radius
 * vocabularies and inconsistent disabled styling, so "primary action" meant something
 * different on every screen. The *mechanism* here is Bumble's, read off its shipped
 * stylesheet rather than imitated from memory: a button is themed through custom
 * properties (`--button-background-color`, `--button-color`, `--button-border-color`,
 * `--button-border-width`, `--button-overlay-background-hover`,
 * `--button-overlay-background-pressed`) and hover/pressed are painted as an OVERLAY
 * layer instead of recolouring the surface — which is what keeps a variant's label
 * contrast identical in every state, the failure mode of ad-hoc `hover:bg-*` classes.
 * Tinder contributes the capability gate (`(hover:hover) and (pointer:fine)`) because a
 * :hover style on touch sticks after tap and reads as broken, and its explicit
 * `:focus-visible` rule rather than reliance on the UA ring.
 *
 * Palette, type and radii are Freeborn's own. Same contract, not Bumble's appearance.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "fb-cta--primary",
  secondary: "fb-cta--secondary",
  ghost: "fb-cta--ghost",
  danger: "fb-cta--danger",
  quiet: "fb-cta--quiet",
};

const SIZE: Record<ButtonSize, string> = { sm: "fb-cta--sm", md: "fb-cta--md", lg: "fb-cta--lg" };

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full-width, for the bottom-of-screen primary action on mobile. */
  block?: boolean;
  loading?: boolean;
  /** Announced while `loading`; the label stays visible so nothing jumps. */
  loadingLabel?: string;
  trailing?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    block = false,
    loading = false,
    loadingLabel,
    disabled,
    className = "",
    children,
    trailing,
    type = "button",
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        "fb-cta",
        VARIANT[variant],
        SIZE[size],
        block ? "fb-cta--block" : "",
        loading ? "fb-cta--loading" : "",
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      <span className="fb-btn__label">
        {children}
        {trailing ? <span className="fb-btn__trailing" aria-hidden="true">{trailing}</span> : null}
      </span>
      {loading ? <span className="sr-only">{loadingLabel ?? "Working\u2026"}</span> : null}
    </button>
  );
});

export default Button;
