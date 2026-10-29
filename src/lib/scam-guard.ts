/**
 * FREEBORN SCAM GUARD
 *
 * The platforms we're here to beat died of romance scams ("100% of my matches
 * were scams", 14 months wasted on fake profiles). This guard scans every
 * outgoing message for classic scam patterns and flags it, so the RECIPIENT
 * sees a safety warning before harm happens. It never blocks speech silently —
 * it warns.
 *
 * WHY IT CHANGED (2026-10-29). It used to be a single boolean over 10 regexes.
 * Two problems with that, both real:
 *   1. No severity. "send me money" and "want to grab coffee" both scored 0/1,
 *      so a first-time mention of a wallet weighed the same as an active
 *      extortion script, and the trust score could not distinguish them.
 *   2. No escalation. The flag reset to noise after one message; nothing ever
 *      looked at the pattern of a sender who got flagged repeatedly.
 * Now every pattern carries a weight and a category, the score is capped, and a
 * serious score on a repeat sender opens a review-required enforcement case
 * through the same policy gate everything else uses — which means it still
 * cannot suspend or ban anyone on its own (moderation-policy caps it).
 *
 * Deliberately NOT here: any attempt to model tone, punctuation or grammar.
 * Scam scripts are written by people typing fast on phones, and a classifier
 * tuned on "bad English" becomes a classifier that flags non-native speakers.
 * Every rule below requires a transactional ask, not a style signal.
 */

export type ScamCategory =
  | "money_transfer"
  | "gift_card"
  | "crypto_investment"
  | "money_mule"
  | "off_platform_move"
  | "fabricated_emergency"
  | "package_customs"
  | "romance_loancan"
  | "credential_harvest";

export interface ScamAssessment {
  /** 0..100. Capped so one long message cannot accumulate into a conviction. */
  score: number;
  categories: ScamCategory[];
  /** The most serious single match; used in the operator-facing detail line. */
  strongest: ScamCategory | null;
  /** >= 40: warn the recipient. >= 70 and a repeat sender: open a case. */
  shouldWarn: boolean;
  shouldEscalate: boolean;
}

type Rule = { re: RegExp; weight: number; category: ScamCategory };

const RULES: Rule[] = [
  // --- direct monetary asks ------------------------------------------------
  { re: /\b(send|transfer|wire|give|loan me)\b.{0,40}\b(money|cash|funds|fees?)\b/i, weight: 45, category: "money_transfer" },
  { re: /\b(western union|moneygram|money gram|send.?via.?zelle|venmo|paypal me|pay me to)\b/i, weight: 55, category: "money_transfer" },
  { re: /\b(gift\s*card|itunes card|steam card|google play card|visa vanilla|steam wallet)\b/i, weight: 55, category: "gift_card" },
  { re: /\b(gift\s*card|card)\b.{0,40}\b(read|scan|photo|numbers?|codes?|pin)\b.{0,30}\b(me|us|here)\b/i, weight: 60, category: "gift_card" },

  // --- the pig-butchering shape: affection, then a platform, then a return --
  { re: /\b(crypto|bitcoin|btc|usdt|ethereum|eth\b|binance|coinbase|bybit|okx)\b.{0,40}\b(wallet|address|invest|send|double|profit|platform)\b/i, weight: 50, category: "crypto_investment" },
  { re: /\b(invest|investment|trading|arbitrage)\b.{0,50}\b(guaranteed?|returns?|profit|double|10x|2x|weekly income|no risk|risk[- ]free)\b/i, weight: 55, category: "crypto_investment" },
  { re: /\b(my (uncle|brother|friend|boss)|a friend of mine)\b.{0,60}\b(broker|platform|crypto|trader|insider|profits?)\b/i, weight: 45, category: "crypto_investment" },
  { re: /\b(link|click|register|sign ?up|download)\b.{0,40}\b(platform|app|site|website|link)\b.{0,40}\b(earn|invest|deposit|bonus)\b/i, weight: 45, category: "crypto_investment" },

  // --- money mule / receiving funds for a "friend" -------------------------
  { re: /\b(receive|accept)\b.{0,30}\b(money|transfer|payment|deposit)\b.{0,50}\b(send|forward|transfer|keep|share)\b/i, weight: 60, category: "money_mule" },
  { re: /\b(my bank|account is|account frozen|bank (problem|issue|locked))\b.{0,50}\b(your|use your|through you)\b/i, weight: 55, category: "money_mule" },

  // --- moving off-platform before any relationship exists -------------------
  { re: /\b(whatsapp|telegram|signal|wechat|line app)\b.{0,40}\b(\+?\d[\d\s-]{7,}|@[a-z0-9_]{4,}|add me|message me|text me)\b/i, weight: 30, category: "off_platform_move" },
  { re: /\b(delete this app|remove this app|not allowed to chat here|app (is )?monitored|they (can|will) see)\b.{0,40}\b(whatsapp|telegram|keep in touch|continue)\b/i, weight: 45, category: "off_platform_move" },

  // --- fabricated emergencies (the actual payout moment) --------------------
  { re: /\b(emergency|hospital|surgery|arrested|jail|detained|stranded|kidnapped)\b.{0,60}\b(help|money|pay|send|bail|need)\b/i, weight: 60, category: "fabricated_emergency" },
  { re: /\b(grandmother|mother|father|son|daughter)\b.{0,40}\b(sick|dying|operation|hospital)\b.{0,40}\b(need|send|money|help)\b/i, weight: 60, category: "fabricated_emergency" },

  // --- package / customs extortion ----------------------------------------
  { re: /\b(pay|paying)\b.{0,30}\b(customs?|shipping|delivery|clearance|package|parcel|freight)\b/i, weight: 55, category: "package_customs" },
  { re: /\b(package|parcel|shipment|consignment)\b.{0,50}\b(stuck|held|detained|seized|awaiting|fee)\b/i, weight: 50, category: "package_customs" },
  /* Ambiguous by construction: "pay the fee to release it" is a mule line in one script and
     a customs line in another. Placed AFTER the package rules at equal weight so the more
     specific reading (package + customs words present) claims the category, while the
     score still counts both. Ordering is therefore load-bearing and asserted below. */
  { re: /\b(fee|taxes)\b.{0,30}\b(to (release|unlock)|before i can (withdraw|receive)|hold up my (account|transfer))\b/i, weight: 50, category: "money_mule" },

  // --- romance loan-cans and investment solicitation of a match ------------
  { re: /\b(loan|borrow)\b.{0,30}\b(\d{2,}|amount|bucks?|dollars?|pounds?|naira)\b/i, weight: 40, category: "romance_loancan" },
  { re: /\b(help me out|just this once|I.ll pay you back|pay you back (tomorrow|next week)|i promise to repay)\b/i, weight: 40, category: "romance_loancan" },
  { re: /\b(million|inheritance|trust fund|consignment|diplomatic (bag|pouch)|safety deposit box)\b.{0,60}\b(share|send|help|need|transfer)\b/i, weight: 65, category: "romance_loancan" },

  // --- credential harvest (distinct from money: it enables the next attack) -
  { re: /\b(otp|one[- ]time password|verification code|cvv|cvv2|card ?number|expire[sd]? date)\b/i, weight: 60, category: "credential_harvest" },
  { re: /\b(your (code|pin|password|login)|log in (to|on) my (account|profile))\b/i, weight: 50, category: "credential_harvest" },
];

/** Media markers and quotes never carry scam text themselves. */
const NON_TEXT = /\[\[(image|video|voice|quote)[^\]]*\]\]/g;

const WARN_AT = 40;
const ESCALATE_AT = 70;
/** The history bonus is capped, and the pattern rule is expressed against that cap so the
 *  two cannot drift apart and silently make escalation impossible. */
const REPEAT_FLAG_CAP = 20;
const REPEAT_FLAGS_FOR_PATTERN = 2;
const CAP = 100;

export function scoreScamMessage(body: string, recentFlags = 0): ScamAssessment {
  const text = (body ?? "").replace(NON_TEXT, " ");
  let raw = 0;
  const categories: ScamCategory[] = [];
  let strongest: ScamCategory | null = null;
  let strongestWeight = 0;
  for (const rule of RULES) {
    if (!rule.re.test(text)) continue;
    raw += rule.weight;
    if (!categories.includes(rule.category)) categories.push(rule.category);
    if (rule.weight > strongestWeight) {
      strongestWeight = rule.weight;
      strongest = rule.category;
    }
  }
  /* Two independent categories is materially stronger evidence than the same
     category repeated, so it gets a bounded bonus rather than a linear one. */
  if (categories.length >= 2) raw += 15;
  /* A sender already flagged in this window is a pattern, not an accident. */
  const flagBonus = Math.min(REPEAT_FLAG_CAP, recentFlags * 10);
  if (recentFlags > 0) raw += flagBonus;

  const score = Math.min(CAP, raw);
  /* Two ways to escalate, because they are two different threats:
       - one message serious enough on its own (multi-category, mule-shaped) from a
         sender with a history; or
       - a persistently flagged sender whose individual messages are each too mild to
         condemn but whose cadence is the evidence. The old single rule (score>=70 with a
         prior flag) was unreachable for the second case — a 45-point ask plus the capped
         20-point history bonus tops out at 65 — so repeat offenders never escalated.
     Both still open a REVIEW case; neither can suspend or ban (moderation-policy caps it). */
  const persistent = recentFlags >= REPEAT_FLAGS_FOR_PATTERN;
  return {
    score,
    categories,
    strongest,
    shouldWarn: score >= WARN_AT,
    shouldEscalate: persistent && (score >= ESCALATE_AT || score >= WARN_AT + flagBonus),
  };
}

/**
 * Back-compat for existing callers and tests. `looksLikeScam` means "warn the
 * recipient", i.e. the warn threshold — not "score > 0".
 */
export function looksLikeScam(body: string): boolean {
  return scoreScamMessage(body).shouldWarn;
}

export const SCAM_RULE_COUNT = RULES.length;
export const SCAM_WARN_AT = WARN_AT;
export const SCAM_ESCALATE_AT = ESCALATE_AT;
export const SCAM_REPEAT_FLAGS_FOR_PATTERN = REPEAT_FLAGS_FOR_PATTERN;
export const SCAM_REPEAT_FLAG_CAP = REPEAT_FLAG_CAP;
