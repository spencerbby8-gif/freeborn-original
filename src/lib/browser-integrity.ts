/**
 * FREEBORN BROWSER-INTEGRITY SIGNALS — risk indicators, never proof, never a fingerprint.
 *
 * WHY THIS EXISTS
 *   Bumble's public web bundle ships a browser *consistency* detector (observed in
 *   're/analysis-2026-10-29/bumble/7baa63ca4f39942f.js', webpack module 471 — my own read of the
 *   shipped bytes, not an REA finding, and not any company's backend). What that corpus actually
 *   demonstrates is a *shape*, and the shape is the useful part:
 *     - the browser computes cheap booleans;
 *     - the values those booleans were derived from are not shipped anywhere durable;
 *     - the result rides a first-party channel and is used to change review priority, not to
 *       deny service;
 *     - the user is never told they were flagged, so there is nothing to iterate against.
 *   Freeborn had *no* equivalent at all: 'verification/check' accepts a selfie from whoever holds
 *   a token and had no idea whether the caller was a real browser. That is the hole this fills.
 *
 * WHAT THIS IS NOT (each of these was considered and rejected deliberately)
 *   - NOT a fingerprint. There is no canvas read, no WebGL renderer string, no font or plugin
 *     enumeration, no audio-context hash, no 'deviceMemory'/'hardwareConcurrency' harvesting, and
 *     no persistent identifier. Competitors do collect some of those; that is exactly the part not
 *     worth copying, because it is undisclosed tracking attached to a person's face account.
 *   - NOT persistent. Nothing here is written to localStorage or IndexedDB by us, no cookie is
 *     set, no id is minted. Bumble persists a 'device_id'; Freeborn deliberately does not.
 *   - NOT proof of fraud, and never a sole cause of anything. Every check below has a mundane
 *     explanation (travel, VPN, a privacy extension, an old iOS, a Firefox that sends no
 *     Client Hints at all). Output is 'advisory: true', unconditionally.
 *   - NOT a claim about anyone's server. We cannot see Bumble's or Match's scoring and do not
 *     pretend to; only what a browser serves to an anonymous visitor was ever inspected.
 *
 * THE DESIGN DECISION THAT MAKES THIS PRIVACY-SAFE, NOT JUST PRIVACY-FRAMED
 *   The client sends *observations* (numbers and short strings it could not hide anyway). The
 *   server does the comparison, because the server holds one input the client cannot forge:
 *   the HTTP headers its own edge received ('Accept-Language', 'User-Agent', 'Sec-CH-UA-*').
 *   Comparing a claim against a trusted header is a consistency test. Storing the claim would be
 *   data collection. So 'persistableDetail()' returns only the NAMES of checks that fired —
 *   the raw observations are used to compute a boolean and then dropped. That is strictly less
 *   retained than Bumble's detector, which writes a 'device_id' to localStorage.
 *
 * PURE: no I/O, no clock, no randomness, no env. Two identical evaluations return identical
 * results, which is what lets an appeal answer quote the reason later.
 */

/** What the browser is asked to report. Every field is either already visible in the request or
 *  a coarse public property; nothing here is unique to one person. */
export type BrowserObservations = {
  /** 'new Date().getTimezoneOffset()', minutes behind UTC, sign as the platform defines it. */
  timezoneOffsetMinutes?: number;
  /** 'navigator.language', e.g. "en-GB". */
  language?: string;
  /** 'navigator.maxTouchPoints'. */
  maxTouchPoints?: number;
  /** 'navigator.userAgentData?.platform', e.g. "Android". */
  claimedPlatform?: string;
  /** '!!navigator.mediaDevices?.getUserMedia' — a capability bit, not an identifier. */
  hasCameraApi?: boolean;
  /** 'typeof navigator.permissions?.query === "function"'. */
  hasPermissionsApi?: boolean;
  /** True when the page runs in a secure context: camera capture requires one, so a false here
   *  means the capture did not happen on the page we shipped. */
  secureContext?: boolean;
};

/** What the server already trusts because it received it at its own edge. */
export type HttpContext = {
  acceptLanguage?: string | null;
  userAgent?: string | null;
  secChUaPlatform?: string | null;
  /** The 'Sec-CH-UA' brand list, as the literal header string. */
  secChUa?: string | null;
};

export type IntegrityFactorKey =
  | "tzVsAcceptLanguage"
  | "languageNotInAcceptLanguage"
  | "platformContradictsUserAgent"
  | "chromeWithoutClientHints";

export type IntegrityFactor = { key: IntegrityFactorKey; label: string };

export type IntegrityResult = {
  /** Empty for an ordinary browser. The point is a small set of named contradictions. */
  fired: IntegrityFactor[];
  count: number;
  /** Always true. This is not evidence, it is context. Enforced by a test, not by a comment. */
  advisory: true;
};

/** Offsets that are legitimately common outside the US. Deliberately short and coarse: this list
 *  is used only as a *hint that something is odd*, never as a location claim, and the check no
 *  longer says anything at all when the language list is mixed (a traveller, an expat, a
 *  developer). Precision is worthless here; a false positive costs a human a wasted look. */
const US_OFFSETS = new Set([0, 60, 120, 180, 240, 300, 420, 480]);

/** Platform families we can name from a User-Agent without guessing. Deliberately only the
 *  mobile tokens: 'Sec-CH-UA-Platform' uses "Windows"/"macOS"/"Chrome OS"/"Linux", which do not
 *  appear literally in a desktop UA, and inventing a mapping for them is how a check starts
 *  firing on honest Safari users. Absent evidence therefore means "no opinion". */
const UA_PLATFORM = /\b(Android|iPhone|iPad|iPod)\b/i;

/** iOS devices report as 'iOS' to the page but as 'iPhone'/'iPad' in the UA. Everything else
 *  must match on its primary subtag. */
function samePlatformFamily(claimed: string, uaFam: string): boolean {
  if (claimed === uaFam) return true;
  const ios = new Set(["iphone", "ipad", "ipod", "ios"]);
  return ios.has(claimed) || (ios.has(uaFam) && claimed === "ios");
}

/** Parse 'Accept-Language' down to bare primary tags, dropping ';q=' weights. */
function acceptTags(header?: string | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((p) => p.trim().split(";")[0]!.trim().toLowerCase())
    .filter(Boolean);
}

/** The region-less primary subtag of a BCP-47 language. */
function primary(tag?: string | null): string {
  return unquote(tag).split("-")[0] ?? "";
}

/** 'Sec-CH-UA-Platform' is a *structured* header: its value arrives quoted ('"Windows"').
 *  Comparing that against a page's 'userAgentData.platform' without unquoting fires
 *  'platformContradictsUserAgent' on every honest Chrome user on Earth — which is exactly
 *  the false positive that would make the whole signal worthless. Unquote first. */
function unquote(v?: string | null): string {
  return (v ?? "").trim().replace(/^"|"$/g, "").toLowerCase();
}

function isChromeUa(ua?: string | null): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  /* Edge, Opera, Vivaldi and Brave all identify as Chrome too, and all of them send Client
     Hints — so treating them as Chrome is correct for this check and cannot punish them. */
  return lower.includes("chrome/") && !lower.includes("chromium-based");
}

/**
 * Evaluate the consistency checks.
 *
 * Every check fires only on a CONTRADICTION between two independent views of the same client,
 * never on mere rarity. Absent input silences the relevant check rather than firing it: a client
 * that declines to send observations is handled by the camera challenge it must still pass, not
 * by a guess about its motives.
 */
export function evaluateIntegrity(
  b: BrowserObservations,
  h: HttpContext = {}
): IntegrityResult {
  const fired: IntegrityFactor[] = [];
  const fire = (key: IntegrityFactorKey, label: string) => fired.push({ key, label });

  const tags = acceptTags(h.acceptLanguage);
    /* A star-only list (a lone star, or star-slash-star) is what a client sends when it has no
       preference at all — curl's default. Treating that as an explicit list would make the
       language checks fire on every script, and would also fire on the privacy extensions that
       strip the header. A wildcard list therefore means: no trusted side, so no comparison, so
       no opinion. (Note: this comment cannot contain the literal token itself, because the
       two-character sequence that ends a block comment appears inside it.) */
  const hasExplicitList = tags.length > 0 && !tags.every((t) => t === "*" || t === "*/*" || t.startsWith("*"));

  /* 1. Claimed clock offset vs the edge's own copy of the browser's language list.
        A *mixed* list is normal (traveller, expat, dev) and is explicitly ignored. */
  const offset = Number(b.timezoneOffsetMinutes);
  if (
    Number.isFinite(offset) &&
    hasExplicitList &&
    tags.every((t) => primary(t) === "en") &&
    tags.every((t) => !t.includes("-") || t.endsWith("-us")) &&
    !US_OFFSETS.has(offset)
  ) {
    fire(
      "tzVsAcceptLanguage",
      "The device clock is outside every US zone while the browser lists only US English — typical of a machine set by a script rather than by its owner."
    );
  }

  /* 2. The browser's own primary language should appear in the list the server received.
        Real browsers keep these in agreement; a hand-built fetch does not, because whoever wrote
        it copy-pasted one header and forgot the other. */
  const lang = primary(b.language);
  if (lang && hasExplicitList && !tags.some((t) => primary(t) === lang)) {
    fire(
      "languageNotInAcceptLanguage",
      "The browser reports a primary language that its own accepted-language list does not contain."
    );
  }

  /* 3. Platform claim vs the platform the edge can see. 'navigator.userAgentData.platform' and
        the 'Sec-CH-UA-Platform' header are the SAME value read from two directions — one
        scriptable, one not — so a mismatch means the page is lying about which device it is on.
        The User-Agent is the third opinion. A desktop UA carries no platform token that matches
        'Windows', so an unmatched UA contributes NOTHING rather than contradicting: firing on
        "we could not tell" is precisely the false positive that makes a signal worthless. */
  const claimed = primary(b.claimedPlatform);
  const edge = primary(h.secChUaPlatform);
  const ua = h.userAgent ?? "";
  const uaFam = ua.match(UA_PLATFORM)?.[1]?.toLowerCase() ?? "";
  if (claimed && edge && claimed !== edge) {
    fire(
      "platformContradictsUserAgent",
      "The platform reported by the page differs from the platform header its browser sent."
    );
  } else if (claimed && uaFam && !samePlatformFamily(claimed, uaFam)) {
    fire(
      "platformContradictsUserAgent",
      "The platform the page reports disagrees with the platform in its own user-agent string."
    );
  }

  /* 4. A Chrome-shaped User-Agent with no Client Hints at all. Real Chrome always sends
        Sec-CH-UA; curl/undici/Playwright-with-a-swapped-UA usually does not. Firefox and Safari
        are unaffected because they send no such header to begin with, so they never trip this. */
  if (isChromeUa(ua) && !(h.secChUa ?? "").trim()) {
    fire(
      "chromeWithoutClientHints",
      "The request claims to be Chrome but carries none of the headers Chrome always sends."
    );
  }

  return { fired, count: fired.length, advisory: true };
}

/**
 * The ONLY form of this evaluation that may be persisted.
 *
 * Factor names, nothing else: no timezone, no language string, no platform, no observations.
 * That is what makes the retention story true rather than reassuring — a reader of
 * 'security_events.detail' learns which rule fired and cannot reconstruct anything about the
 * member's device from it.
 */
export function persistableDetail(r: IntegrityResult): string {
  if (!r.count) return "none";
  return r.fired.map((f) => f.key).join(",").slice(0, 120);
}

/**
 * Factors a member may be told about. The clock/language ones are safe to say out loud — the
 * member owns that information and it is about their own machine. The platform mismatch is
 * withheld for the same reason 'sharedDeviceAccounts' is: naming it tells a determined abuser
 * which two headers they forgot to make consistent, which is the whole game.
 */
export const MEMBER_VISIBLE_INTEGRITY_KEYS: readonly IntegrityFactorKey[] = [
  "tzVsAcceptLanguage",
  "languageNotInAcceptLanguage",
];

export function memberVisibleIntegrity(fired: IntegrityFactor[]): IntegrityFactor[] {
  return fired.filter((f) => MEMBER_VISIBLE_INTEGRITY_KEYS.includes(f.key));
}

/**
 * What this module will never read. Present as code so the harness can assert it and a reviewer
 * can grep it: a privacy claim that exists only in prose is a wish.
 */
export const NEVER_COLLECTED: readonly string[] = [
  "canvas",
  "webgl",
  "webgl.vendor",
  "fonts",
  "plugins",
  "audioContext",
  "deviceMemory",
  "hardwareConcurrency",
  "screen.width",
  "screen.colorDepth",
  "battery",
  "localStorage",
  "indexedDB",
  "document.cookie",
];
