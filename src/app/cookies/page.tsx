import type { Metadata } from "next";
import { Callout, Clause, ClauseList, LegalShell, LegalTable } from "@/components/legal-shell";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Every cookie, every localStorage key and every sessionStorage key Freeborn uses, what each one does, how long it lasts, and how to remove it. No advertising cookies exist.",
  alternates: { canonical: "/cookies" },
  robots: { index: true, follow: true },
};

/**
 * Freeborn Cookie Policy.
 *
 * Every entry below was read out of the codebase, not copied from a generator.
 * Cookie attributes come from `src/lib/supabase/proxy.ts`, storage keys from the
 * literal constants in `src/components/app/*`, and the service worker from
 * `public/sw.js`. Verified 2026-10-19.
 *
 * THE HONEST BIT: the session cookies are not HttpOnly. That is the default in
 * `@supabase/ssr` (dist/main/utils/constants.js sets `httpOnly: false`) and this app
 * uses the library's browser client, which needs to read the session in order to
 * attach Bearer tokens to API calls. The session is additionally persisted in
 * localStorage for the same reason. So session material is reachable by script by
 * design of the authentication mode, and saying otherwise in a legal document would
 * be a false security claim.
 *
 * The compensating controls are an enforced Content Security Policy with an
 * allowlisted connect-src, so a token read by script has no origin to be sent to,
 * plus the complete absence of third-party scripts, which removes the vector that
 * delivers most real-world XSS. What the CSP cannot do is block an injected INLINE
 * script: these routes are statically prerendered, so a per-request nonce never
 * reaches them. Measured 2026-10-19 (20 scripts on /, 0 nonced; 15 on /auth, 15
 * nonced) and documented in src/middleware.ts. The clause below describes that limit
 * to the reader instead of claiming a protection we do not have.
 */
export default function CookiesPage() {
  return (
    <LegalShell
      eyebrow="Cookie Policy"
      title={
        <>
          Every cookie,{" "}
          <em className="font-medium italic text-gold-soft">named and explained.</em>
        </>
      }
      lede={
        <p>
          Most cookie policies describe categories of cookie in the abstract and hope
          you stop reading. This one lists what {SITE_NAME} actually stores on your
          device, under what name, for how long and why. There are no advertising
          cookies, no cross-site trackers and no analytics cookies, so there is no
          consent banner: everything below is either strictly necessary to keep you
          signed in, or a preference you set yourself.
        </p>
      }
    >
      <Clause n="1" title="The summary">
        <Callout label="What is on your device">
          <ClauseList
            items={[
              <><strong className="text-pearl">Cookies:</strong> authentication cookies set by our auth provider so your session survives a page reload. Nothing else.</>,
              <><strong className="text-pearl">localStorage:</strong> five keys holding your own preferences, plus the session copy the browser client uses.</>,
              <><strong className="text-pearl">sessionStorage:</strong> two keys that vanish when you close the tab.</>,
              <><strong className="text-pearl">A service worker:</strong> registered so the site is installable. It caches nothing.</>,
              <><strong className="text-pearl">No advertising cookies. No third-party analytics. No tracking pixels. No ad networks.</strong></>,
            ]}
          />
        </Callout>
      </Clause>

      <Clause n="2" title="Cookies we set">
        <p>
          All cookies on {SITE_NAME} are set by the authentication layer. Their names
          begin with <code className="rounded bg-night px-1.5 py-0.5 font-mono text-[12.5px] text-gold-soft">sb-</code>{" "}
          followed by our project identifier. A long session value is split across
          numbered parts, so you may see more than one.
        </p>
        <LegalTable
          head={["Cookie", "Purpose", "Lifetime", "Attributes"]}
          rows={[
            [
              <code key="k1" className="font-mono text-[12.5px] text-pearl">sb-…-auth-token</code>,
              "Keeps you signed in. Holds your session so you do not have to authenticate on every page.",
              "Session-scoped, refreshed automatically. Signing out clears it immediately.",
              "Secure; SameSite=Lax in production; Path=/",
            ],
            [
              <code key="k2" className="font-mono text-[12.5px] text-pearl">sb-…-auth-token.0, .1</code>,
              "Continuation parts of the same session value when it exceeds a single cookie's size limit.",
              "Same as above.",
              "Same as above.",
            ],
          ]}
        />
        <p>
          <strong className="text-pearl">SameSite=Lax</strong> in production means the
          browser will not attach your session cookie to a cross-site request. That is
          a deliberate cross-site request forgery control. It is set to
          <code className="mx-1 rounded bg-night px-1.5 py-0.5 font-mono text-[12.5px] text-gold-soft">None</code>{" "}
          only in local development, where an embedded preview frame needs it.
        </p>
        <Callout label="One limitation we are not going to hide">
          <p>
            These cookies are <strong className="text-pearl">not</strong> marked
            HttpOnly, which means a script running on a {SITE_NAME} page could read
            them. That is the documented default of the authentication library we use,
            and it is not an oversight we can simply switch off: the browser client
            reads the session in order to attach bearer tokens to API requests, and the
            session is also persisted in localStorage for the same reason. Marking the
            cookie HttpOnly alone would not remove the exposure, because the
            localStorage copy would remain.
          </p>
          <p>
            The controls that actually matter here are working. {SITE_NAME} loads{" "}
            <strong className="text-pearl">no third-party scripts at all</strong>, which
            removes the way most script injection reaches a site in the first place. A
            Content Security Policy is enforced on every response and allowlists the
            origins the page may connect to, so even script that did manage to run would
            have nowhere to send a session token. The same policy blocks this site from
            being framed, from posting a form to another origin, and from loading
            plugins. What it does not do is block an injected inline script, because
            these pages are pre-rendered at build time and cannot carry the per-request
            secret that would allow it. We are describing the limit rather than claiming
            a protection we do not have. If you find a way to run script on this site,
            tell us at{" "}
            <a className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{" "}
            and we will treat it as a security report.
          </p>
        </Callout>
      </Clause>

      <Clause n="3" title="localStorage: your preferences">
        <p>
          localStorage persists after you close the browser. Every key below stores
          something you chose, on your own device, and none of it is transmitted to us
          as a tracking identifier.
        </p>
        <LegalTable
          head={["Key", "What it holds", "Why"]}
          rows={[
            [
              <code key="k3" className="font-mono text-[12.5px] text-pearl">freeborn.preferences</code>,
              "Your notification preferences.",
              "So the alerts you turned off stay off.",
            ],
            [
              <code key="k4" className="font-mono text-[12.5px] text-pearl">freeborn.filters</code>,
              "Your discovery filters: age range, distance, genders shown, intentions, verified-only.",
              "So your settings are already applied when you open the deck.",
            ],
            [
              <code key="k5" className="font-mono text-[12.5px] text-pearl">fb-notif-asked</code>,
              "Whether we have already asked for browser notification permission.",
              "So you are asked once and never nagged again.",
            ],
            [
              <code key="k6" className="font-mono text-[12.5px] text-pearl">fb-seen-alerts</code>,
              "How many alerts you have already seen.",
              "So the unread indicator is accurate.",
            ],
            [
              <code key="k7" className="font-mono text-[12.5px] text-pearl">fb-verify-invite-shown</code>,
              "Whether the invitation to verify your identity has been shown.",
              "So it appears once rather than every session.",
            ],
            [
              <code key="k8" className="font-mono text-[12.5px] text-pearl">session keys (sb-…)</code>,
              "The browser client's copy of your session.",
              "So API calls can be authenticated. See the limitation in clause 2.",
            ],
          ]}
        />
      </Clause>

      <Clause n="4" title="sessionStorage: cleared when the tab closes">
        <LegalTable
          head={["Key", "What it holds", "Why"]}
          rows={[
            [
              <code key="k9" className="font-mono text-[12.5px] text-pearl">fb-security-checked</code>,
              "A timestamp of the last routine security check.",
              "So the check runs at most once per interval rather than on every navigation.",
            ],
            [
              <code key="k10" className="font-mono text-[12.5px] text-pearl">freeborn.origin</code>,
              "Your location fix for the current session.",
              "So distances keep working without re-requesting GPS on every screen.",
            ],
          ]}
        />
        <p>
          Neither survives the tab. Neither is a tracking identifier and neither is
          readable by another site.
        </p>
      </Clause>

      <Clause n="5" title="The service worker">
        <p>
          {SITE_NAME} registers a service worker so the site can be installed as an
          app on your home screen. It is deliberately minimal: it is a network
          passthrough. It does not cache your content, it does not store anything for
          offline use, and it does not intercept requests to add tracking. Removing it
          costs you the install prompt and nothing else.
        </p>
        <p>
          It is not a cookie and does not appear in cookie settings, so to remove it
          use your browser&rsquo;s site data controls, described in clause 7.
        </p>
      </Clause>

      <Clause n="6" title="What we deliberately do not use">
        <ClauseList
          items={[
            <>Advertising cookies or advertising networks of any kind.</>,
            <>Third-party analytics. There is no Google Analytics, no Meta Pixel, no TikTok Pixel, no Hotjar, no Clarity and no PostHog on this site.</>,
            <>Cross-site tracking or fingerprinting.</>,
            <>Social media widgets that set cookies before you interact with them.</>,
            <>Retargeting audiences or lookalike audiences built from your data.</>,
            <>Any cookie set by a domain other than the one you are visiting.</>,
          ]}
        />
        <p>
          Because nothing here needs consent under the ePrivacy Directive or the UK
          Regulations, there is no cookie banner. Everything is either strictly
          necessary to keep you signed in or a preference you set. A banner asking you
          to accept strictly necessary storage would be theatre.
        </p>
      </Clause>

      <Clause n="7" title="How to control and remove all of it">
        <p>
          Every browser is different, but all of them give you the same three controls:
        </p>
        <ClauseList
          items={[
            <><strong className="text-pearl">Delete the cookies.</strong> In your browser&rsquo;s privacy or site-data settings, clear cookies and site data for this domain. You will be signed out and your filters and notification preferences will reset.</>,
            <><strong className="text-pearl">Block cookies.</strong> You can block cookies for this domain entirely. The site will load and you can read the public pages, but you will not be able to stay signed in, so the product will not work.</>,
            <><strong className="text-pearl">Clear storage.</strong> The same site-data control removes localStorage, sessionStorage, the service worker and any cached files in one action.</>,
            <>Private or incognito windows discard all of it automatically when the window closes.</>,
          ]}
        />
        <p>
          To delete your data from our servers rather than your device, that is a
          different action: Settings, danger zone, delete account. It is described in
          the <a className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4" href="/privacy">Privacy Policy</a>.
        </p>
      </Clause>

      <Clause n="8" title="Changes and contact">
        <p>
          Version 1.0, effective 19 October 2026. If we add anything that stores data
          on your device, this page gets updated in the same change, and if it is not
          strictly necessary we will ask you first.
        </p>
        <p>
          Questions:{" "}
          <a className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Clause>
    </LegalShell>
  );
}
