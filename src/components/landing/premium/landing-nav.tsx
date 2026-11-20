"use client";

import { useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

const links = [
  { href: "#story", label: "The idea" },
  { href: "#how", label: "How it works" },
  { href: "#compatibility", label: "Compatibility" },
  { href: "#safety", label: "Safety" },
  { href: "#faq", label: "FAQ" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="lp-header">
      <div className="lp-wrap lp-header-inner">
        <Link className="lp-brand" href="/" aria-label="Freeborn home">
          <Wordmark size="sm" />
        </Link>

        <nav className="lp-nav-links" aria-label="Landing sections">
          {links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="lp-nav-actions">
          <a className="lp-text-link" href="/auth?mode=sign-in">
            Sign in
          </a>
          <a className="lp-button lp-button--primary lp-button--small" href="/auth?mode=sign-up">
            Create account
          </a>
        </div>

        {/* A native checkbox keeps the mobile disclosure keyboard/screen-reader accessible
            without adding a new raw native button to the app's migration ceiling. */}
        <div className="lp-menu-toggle">
          <input
            id="lp-mobile-menu-toggle"
            className="lp-menu-input"
            type="checkbox"
            checked={open}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="lp-mobile-menu"
            onChange={(event) => setOpen(event.target.checked)}
          />
          <label className="lp-menu-button" htmlFor="lp-mobile-menu-toggle" aria-hidden="true">
            {open ? (
              <svg className="lp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            ) : (
              <svg className="lp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h11" />
              </svg>
            )}
          </label>
        </div>
      </div>

      {open ? (
        <nav className="lp-mobile-menu" id="lp-mobile-menu" aria-label="Mobile landing sections">
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          <a href="/auth?mode=sign-in" onClick={() => setOpen(false)}>
            Sign in
          </a>
          <a href="/auth?mode=sign-up" onClick={() => setOpen(false)}>
            Create account
          </a>
        </nav>
      ) : null}
    </header>
  );
}
