/**
 * FREEBORN SCAM GUARD
 *
 * The platforms we're here to beat died of romance scams ("100% of my matches
 * were scams", 14 months wasted on fake profiles). This guard scans every
 * outgoing message for classic scam patterns and flags it, so the RECIPIENT
 * sees a safety warning before harm happens. It never blocks speech silently —
 * it warns.
 */

const SCAM_PATTERNS: RegExp[] = [
  /\b(send|transfer|wire|give)\b.{0,40}\b(money|cash|funds|fees?)\b/i,
  /\b(gift\s*card|itunes card|steam card|google play card|visa vanilla)\b/i,
  /\b(crypto|bitcoin|btc|usdt|ethereum|eth\b|binance|cashapp|cash app)\b.{0,40}\b(wallet|address|invest|send|double)\b/i,
  /\b(invest|investment)\b.{0,50}\b(guaranteed?|returns?|profit|double|10x|weekly income)\b/i,
  /\b(western union|moneygram|money gram|iban|swift code|zelle|venmo)\b/i,
  /\b(pay|paying)\b.{0,30}\b(customs?|shipping|delivery|clearance|package|parcel)\b/i,
  /\b(loan|borrow)\b.{0,30}\b(\d{2,})/i,
  /\bwhatsapp\b.{0,40}\b(\+?\d[\d\s-]{7,})/, // phone-number harvesting
  /\b(tg|telegram)\b.{0,20}@?[a-z0-9_]{4,}.{0,30}\b(invest|money|crypto|earn)\b/i,
  /\bemergency\b.{0,40}\b(hospital|surgery|arrested|jail|customs)\b.{0,40}\b(help|money|pay|send)\b/i,
];

/** Returns true when the message matches known scam shapes. */
export function looksLikeScam(body: string): boolean {
  // Media markers and quotes never carry scam text themselves.
  const text = body.replace(/\[\[(image|video|voice|quote)[^\]]*\]\]/g, " ");
  return SCAM_PATTERNS.some((re) => re.test(text));
}
