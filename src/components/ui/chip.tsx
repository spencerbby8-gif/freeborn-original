"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";


/**
 * A selectable chip, with its pressed state stated rather than implied by colour.
 *
 * The filter panel, the interest grid and the unmatch-reason picker each built this control;
 * only one of them set `aria-pressed`, so on the others a screen reader reported "button" and the
 * selection state was carried entirely by a background tint. `aria-pressed` is required by the
 * type here for the same reason `aria-label` is on IconButton: the property that was being
 * forgotten is the one that has to be impossible to forget.
 *
 * Not a replacement for a radio group when the choice is exclusive — pass the value in and let
 * the caller decide which chip is true, which is what keeps single-select panels honest.
 */
export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  "aria-pressed": boolean;
  size?: "sm" | "md";
  leading?: ReactNode;
};

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { size = "md", className, children, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={["fb-chip", size === "sm" ? "fb-chip--sm" : "", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
});

export default Chip;
