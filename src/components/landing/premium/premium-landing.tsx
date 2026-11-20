import type { ReactNode } from "react";
import Image from "next/image";
import { Wordmark } from "@/components/wordmark";
import { CONTACT_EMAIL, MIN_AGE, OPERATOR_NAME, SITE_NAME } from "@/lib/site";
import { LandingNav } from "./landing-nav";
import { landingFaqs } from "./landing-faqs";

type IconName =
  | "spark"
  | "lock"
  | "chat"
  | "heart"
  | "compass"
  | "shield"
  | "sliders"
  | "check"
  | "arrow"
  | "camera"
  | "eye"
  | "flag"
  | "user"
  | "globe"
  | "info";

const PATHS: Record<IconName, ReactNode> = {
  spark: <path d="M12 2.5 13.8 9l6.5 1.8-6.5 1.8L12 19l-1.8-6.4-6.5-1.8L10.2 9 12 2.5Z" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  chat: <path d="M20.5 11.6a8.3 8.3 0 0 1-8.4 8.2 9 9 0 0 1-3.6-.7L3.8 20.4l1.3-4.4a8 8 0 0 1-1-3.9 8.3 8.3 0 0 1 8.4-8.2 8.3 8.3 0 0 1 8 7.7Z" />,
  heart: <path d="M12 20.2S4.2 15.5 4.2 9.9A4.2 4.2 0 0 1 12 7.7a4.2 4.2 0 0 1 7.8 2.2c0 5.6-7.8 10.3-7.8 10.3Z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.4 8.6-2 4.8-4.8 2 2-4.8 4.8-2Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.8 19.5 6v5.3c0 4.7-3.1 8-7.5 9.8-4.4-1.8-7.5-5.1-7.5-9.8V6L12 2.8Z" />
      <path d="m9.2 12 2 2 3.8-4" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="11" cy="17" r="2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  camera: (
    <>
      <path d="M4 7h3l1.5-2h7L17 7h3v12H4V7Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  flag: <path d="M6 21V4m0 1c3-2 6 2 9 0v9c-3 2-6-2-9 0" />,
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.8" />
      <path d="M4.8 20.2c.5-3.9 3.4-6.1 7.2-6.1s6.7 2.2 7.2 6.1" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 3.6 5.6 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.6-3.6-9S9.6 5.5 12 3Z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
};

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`lp-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

function SectionHead({
  kicker,
  title,
  sub,
  center = false,
  id,
}: {
  kicker: string;
  title: ReactNode;
  sub: string;
  center?: boolean;
  id?: string;
}) {
  return (
    <div className={`lp-section-head ${center ? "lp-section-head--center" : ""}`}>
      <p className="lp-kicker">{kicker}</p>
      <h2 className="lp-h2" id={id}>{title}</h2>
      <p className={`lp-section-sub ${center ? "lp-section-sub--center" : ""}`}>{sub}</p>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <article className="lp-card">
      <span className="lp-card-icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <article className="lp-step">
      <span className="lp-step-number">{n}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-hero-media">
        <Image
          src="/images/landing/sunset-portrait.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
        />
      </div>
      <div className="lp-wrap lp-hero-grid">
        <div className="lp-hero-copy">
          <p className="lp-kicker">Dating with intention</p>
          <h1 className="lp-display" id="lp-hero-title">
            Someone you’ll
            <br />
            <em>remember.</em>
          </h1>
          <p className="lp-lede">
            Meet people who see the real you. Share what matters, start a conversation,
            and discover what happens next.
          </p>
          <div className="lp-actions">
            <a className="lp-button lp-button--primary lp-button--wide" href="/auth?mode=sign-up">
              Create account <Icon name="arrow" />
            </a>
            <a className="lp-button lp-button--ghost lp-button--wide" href="#story">
              Discover Freeborn
            </a>
          </div>
          <p className="lp-hero-note">
            <span className="lp-status-dot" aria-hidden="true" />
            For adults 18 and over
          </p>
        </div>


      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <div className="lp-wrap lp-trust" aria-label="Product principles">
      <div className="lp-trust-item">
        <span className="lp-icon-badge"><Icon name="spark" /></span>
        <div>
          <h3>More than a photo</h3>
          <p>Share the interests and intentions that make you, you.</p>
        </div>
      </div>
      <div className="lp-trust-item">
        <span className="lp-icon-badge"><Icon name="lock" /></span>
        <div>
          <h3>Choose what matters</h3>
          <p>Set preferences for how you discover people.</p>
        </div>
      </div>
      <div className="lp-trust-item">
        <span className="lp-icon-badge"><Icon name="chat" /></span>
        <div>
          <h3>Start a conversation</h3>
          <p>Connect with someone who catches your interest.</p>
        </div>
      </div>
    </div>
  );
}

function Story() {
  return (
    <section className="lp-section lp-wrap" id="story">
      <div className="lp-story-grid">
        <div className="lp-story-media">
          <Image
            src="/images/landing/sunset-connection.jpg"
            alt=""
            fill
            sizes="(max-width: 1000px) 100vw, 50vw"
          />
          <p className="lp-story-quote">It starts with a conversation.</p>
        </div>
        <div className="lp-story-copy">
          <p className="lp-eyebrow-sm">The idea</p>
          <h2 className="lp-h2">
            More than a profile. <em>A person.</em>
          </h2>
          <p className="lp-section-sub">
            There’s more to attraction than a photo. Share your interests, your intentions, and the little
            things that make you you. Get to know someone beyond the first impression.
          </p>
          <ul className="lp-story-list">
            <li><span className="lp-check"><Icon name="check" /></span><span>Share the interests and intentions that matter to you.</span></li>
            <li><span className="lp-check"><Icon name="check" /></span><span>Choose your age, distance and discovery preferences.</span></li>
            <li><span className="lp-check"><Icon name="check" /></span><span>Like, match and start a conversation.</span></li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="lp-section lp-wrap" aria-labelledby="lp-features-title">
      <SectionHead
        id="lp-features-title"
        kicker="Built for the whole person"
        title={<>A little more room <em>to connect.</em></>}
        sub="From the first look to the first hello, Freeborn gives you space to find your own way."
        center
      />
      <div className="lp-feature-grid">
        <FeatureCard icon="user" title="Profiles with depth" body="Intentions, interests, photos and words sit together without reducing a person to a single label." />
        <FeatureCard icon="sliders" title="Discovery with boundaries" body="Age, distance and compatibility preferences shape the deck while privacy controls stay visible." />
        <FeatureCard icon="chat" title="Messages that feel human" body="Match with people and start conversations based on what matters to you." />
        <FeatureCard icon="shield" title="Trust and control" body="Use reporting, blocking, privacy controls and appeals when you need them." />
      </div>
    </section>
  );
}

function Compatibility() {
  return (
    <section className="lp-section lp-wrap" id="compatibility">
      <div className="lp-compatibility">
        <div>
          <p className="lp-kicker">Optional compatibility</p>
          <h2 className="lp-h2">
            Your kind of connection. <em>Your choice.</em>
          </h2>
          <p className="lp-section-sub">
            Everyone brings something different to dating. Share the interests and values that matter to you,
            and choose the preferences that feel right for you. Health and vaccination views are optional —
            not a condition of joining.
          </p>
          <div className="lp-actions">
            <a className="lp-button lp-button--ghost" href="/guides">
              Read the guides <Icon name="arrow" />
            </a>
          </div>
        </div>
        <div className="lp-compat-panel">
          <p>Choose what is relevant to you. Leave the rest alone.</p>
          <div className="lp-chips" aria-label="Examples of profile details and discovery preferences">
            <span className="lp-chip lp-chip--accent">Intentions</span>
            <span className="lp-chip">Lifestyle</span>
            <span className="lp-chip">Wellness rhythm</span>
            <span className="lp-chip">Health autonomy</span>
            <span className="lp-chip">Vaccination view</span>
            <span className="lp-chip">Faith &amp; philosophy</span>
            <span className="lp-chip">Family direction</span>
            <span className="lp-chip">Interests</span>
            <span className="lp-chip">Distance</span>
          </div>
          <p className="lp-compat-note">
            <Icon name="info" />
            These are examples of details members may choose to share and preferences they may set.
            They do not define who can join Freeborn.
          </p>
        </div>
      </div>
    </section>
  );
}

function Safety() {
  return (
    <section className="lp-safety" id="safety">
      <div className="lp-safety-media">
        <Image
          src="/images/landing/evening-city.jpg"
          alt="A quiet city street at blue hour"
          fill
          sizes="100vw"
        />
      </div>
      <div className="lp-wrap lp-safety-inner">
        <div>
          <p className="lp-kicker">Privacy &amp; safety</p>
          <h2 className="lp-h2">
            Your pace. <em>Your boundaries.</em>
          </h2>
          <p className="lp-section-sub">
            Feel more in control of your experience with privacy settings, reporting and blocking.
            Our safety resources are there whenever you need them.
          </p>
          <div className="lp-safety-links">
            <a href="/safety">Safety center <Icon name="arrow" /></a>
            <a href="/privacy">Privacy policy <Icon name="arrow" /></a>
            <a href="/appeal">Appeal a decision <Icon name="arrow" /></a>
          </div>
        </div>
        <ul className="lp-safety-list">
          <li><Icon name="eye" /><span>Approximate location and visibility controls rather than exact-location exposure.</span></li>
          <li><Icon name="shield" /><span>Age-gated onboarding, member standards and profile completeness cues.</span></li>
          <li><Icon name="flag" /><span>Report or block someone when you need to.</span></li>
          <li><Icon name="lock" /><span>Manage your privacy, discoverability and account.</span></li>
        </ul>
      </div>
    </section>
  );
}

function How() {
  return (
    <section className="lp-section lp-wrap" id="how">
      <SectionHead
        kicker="How it works"
        title={<>From first hello to <em>real conversation.</em></>}
        sub="Start with a profile, choose your preferences and get to know someone."
        center
      />
      <div className="lp-steps">
        <StepCard n="01" title="Create a real profile" body="Sign up, complete age-gated onboarding and add the intentions, interests and photos you choose to share." />
        <StepCard n="02" title="Set your preferences" body="Shape discovery with age, distance and optional compatibility filters. Keep privacy and visibility controls in your hands." />
        <StepCard n="03" title="Start a conversation" body="Like, match and message through the real app flows, with reporting and blocking available when you need them." />
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="lp-section lp-wrap lp-faq" id="faq">
      <div className="lp-faq-grid">
        <div className="lp-faq-aside">
          <p className="lp-kicker">Questions, answered</p>
          <h2 className="lp-h2">
            A few things <em>worth knowing.</em>
          </h2>
          <p>
            Learn more about how Freeborn helps you meet people on your own terms.
          </p>
        </div>
        <div>
          {landingFaqs.map((faq) => (
            <details key={faq.q}>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="lp-final lp-wrap">
      <p className="lp-kicker">Begin with intention</p>
      <h2 className="lp-display">
        Ready to meet <em>someone real?</em>
      </h2>
      <p className="lp-section-sub">
        Create an account or sign in to start making meaningful connections.
      </p>
      <div className="lp-actions">
        <a className="lp-button lp-button--primary lp-button--wide" href="/auth?mode=sign-up">
          Create account <Icon name="arrow" />
        </a>
        <a className="lp-button lp-button--ghost lp-button--wide" href="/auth?mode=sign-in">
          Sign in
        </a>
      </div>
    </section>
  );
}

function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <Wordmark size="md" />
            <p>
              A general premium dating platform for adults who want real profiles, clear intentions and
              compatibility on their own terms.
            </p>
            <p className="lp-footer-tag">Date like you mean it.</p>
          </div>

          <div className="lp-footer-col">
            <h3>Product</h3>
            <ul>
              <li><a href="#story">The idea</a></li>
              <li><a href="#how">How it works</a></li>
              <li><a href="#compatibility">Compatibility</a></li>
              <li><a href="#safety">Safety &amp; privacy</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </div>

          <div className="lp-footer-col">
            <h3>Legal</h3>
            <ul>
              <li><a href="/privacy">Privacy Policy</a></li>
              <li><a href="/terms">Terms of Service</a></li>
              <li><a href="/cookies">Cookie Policy</a></li>
              <li><a href="/safety">Safety</a></li>
              <li><a href="/guides">Guides</a></li>
              <li><a href="/appeal">Appeal a decision</a></li>
            </ul>
          </div>

          <div className="lp-footer-col">
            <h3>Account</h3>
            <ul>
              <li><a href="/auth?mode=sign-up">Create account</a></li>
              <li><a href="/auth?mode=sign-in">Sign in</a></li>
              <li><a href="/app">Open app</a></li>
              <li><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
            </ul>
          </div>
        </div>

        <div className="lp-footer-bottom">
          <p>
            © {year} {OPERATOR_NAME}. {SITE_NAME} is operated by {OPERATOR_NAME}. All rights reserved.
          </p>
          <p>
            Dating on your terms · {MIN_AGE}+
          </p>
        </div>
      </div>
    </footer>
  );
}

export function PremiumLanding() {
  return (
    <>
      <LandingNav />
      <main>
        <Hero />
        <TrustStrip />
        <Story />
        <Features />
        <Compatibility />
        <Safety />
        <How />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </>
  );
}
