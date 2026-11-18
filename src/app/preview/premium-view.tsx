"use client";

import { useState } from "react";
import { SrScreen, SrTitle } from "@/components/app/sr-ui";

/**
 * Premium.
 *
 * From the reference's eighth screen: back arrow, a glowing crown at the top right,
 * a two-line serif "Get more meaningful matches", a short subtitle, seven ticked
 * benefits, three plan cards with the middle one raised under a "Most popular"
 * ribbon, and the gradient "Upgrade Now" button with a reassurance line beneath.
 *
 * Prices are the reference's. Nothing here charges anything — selecting a plan
 * only updates local state, so the screen can be reviewed without a payment path.
 */

const BENEFITS = [
  "See who likes you",
  "Unlimited likes",
  "Advanced filters",
  "See profile views",
  "Priority in discovery",
  "Read receipts",
  "Incognito mode",
];

const PLANS = [
  { id: "1m", term: "1 Month", price: "$19.99/mo", save: null as string | null, popular: false },
  { id: "3m", term: "3 Months", price: "$14.99/mo", save: "Save 25%", popular: true },
  { id: "6m", term: "6 Months", price: "$9.99/mo", save: "Save 50%", popular: false },
];

function Crown({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.4 8.4l4 3.2 4.6-5.4 4.6 5.4 4-3.2-1.6 10H5L3.4 8.4z" />
    </svg>
  );
}

export function PremiumView() {
  const [plan, setPlan] = useState("3m");
  const [done, setDone] = useState(false);

  return (
    <SrScreen>
      <SrTitle back="/preview?screen=settings" right={<span className="fb-sr-crown"><Crown /></span>}>
        <span className="block">Get more</span>
        <span className="block">meaningful matches</span>
      </SrTitle>

      <p className="px-5 pt-2 text-[12.5px] leading-[1.6] text-[var(--fb-sr-mist)]">
        Unlock powerful features and take your dating experience further.
      </p>

      <ul className="fb-sr-benefits">
        {BENEFITS.map((b) => (
          <li key={b} className="fb-sr-benefit">
            <span className="fb-sr-benefit__tick" aria-hidden>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 12.5l5 5 10-11" />
              </svg>
            </span>
            {b}
          </li>
        ))}
      </ul>

      <div className="fb-sr-plans">
        {PLANS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlan(p.id)}
            aria-pressed={plan === p.id}
            data-active={plan === p.id}
            className="fb-sr-plan"
          >
            {p.popular ? <span className="fb-sr-plan__ribbon">Most popular</span> : null}
            <span className="fb-sr-plan__term">{p.term}</span>
            <span className="fb-sr-plan__price">{p.price}</span>
            {p.save ? <span className="fb-sr-plan__save">{p.save}</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-auto px-5 pt-6 pb-5">
        <button type="button" onClick={() => setDone(true)} className="fb-sr-upgrade">
          {done ? "Selected — premium checkout opens here" : "Upgrade Now"}
        </button>
        <p className="mt-3 text-center text-[11px] text-[var(--fb-sr-ash)]">
          Cancel anytime. Your data stays private and secure.
        </p>
      </div>
    </SrScreen>
  );
}
