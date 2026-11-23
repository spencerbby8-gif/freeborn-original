import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { Wordmark } from '@/components/wordmark';
import { PageStructuredData } from '@/components/seo/page-structured-data';
import { ogCard, OPERATOR_NAME } from '@/lib/site';
import { FREE_DATING_PATH, FREE_DATING_TITLE, FREE_DATING_DESCRIPTION, freeDatingFeatures, freeDatingQuestions } from '@/lib/free-dating-content';
import styles from './free-dating.module.css';

export const metadata: Metadata = {
  title: {absolute:FREE_DATING_TITLE},
  description:FREE_DATING_DESCRIPTION,
  alternates:{canonical:FREE_DATING_PATH},
  openGraph:ogCard(FREE_DATING_PATH,FREE_DATING_TITLE,FREE_DATING_DESCRIPTION),
};

const signup = '/auth?mode=sign-up';
const explainers = [
  {q:'“Someone liked me. Why are we not chatting?”',a:'A like shows one person’s interest. A match conversation requires both people to like each other. Even after mutual interest, privacy choices, blocks or the state of a conversation can restrict contact. A like is not permission to bypass someone’s boundaries.'},
  {q:'“We matched. Does that mean they will reply?”',a:'No. A match is a starting point, not a commitment. Write something considerate and give the other person room to choose whether to respond. Free messaging is access to a feature, not a promise of attention.'},
  {q:'“My chat is unavailable. Is that a paywall?”',a:'An unavailable conversation does not automatically mean a payment is required. Blocking, unmatching or privacy restrictions can prevent sending. Do not buy something elsewhere or contact someone through another channel to get around a boundary.'},
];

export default async function FreeDatingPage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const faqData = {'@context':'https://schema.org','@type':'FAQPage',mainEntity:freeDatingQuestions.map(f=>({'@type':'Question',name:f.q,acceptedAnswer:{'@type':'Answer',text:f.a}}))};
  return <div className={styles.page}>
    <PageStructuredData path={FREE_DATING_PATH} name={FREE_DATING_TITLE} description={FREE_DATING_DESCRIPTION}/>
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{__html:JSON.stringify(faqData).replace(/</g,'\\u003c')}}/>
    <a className={styles.skip} href="#main-content">Skip to content</a>
    <header className={styles.header}>
      <div className={`${styles.wrap} ${styles.nav}`}>
        <Link href="/" aria-label="Freeborn home" className={styles.brandLink}><Wordmark size="sm"/></Link>
        <nav aria-label="Main navigation" className={styles.navLinks}>
          <Link href="/guides">Guides</Link>
          <Link href="/safety">Safety</Link>
          <Link className={styles.signIn} href="/auth?mode=sign-in">Sign in <span aria-hidden="true">↗</span></Link>
        </nav>
      </div>
    </header>
    <main id="main-content">
      <section className={styles.hero} aria-labelledby="free-dating-title">
        <div className={`${styles.wrap} ${styles.heroGrid}`}>
          <div>
            <p className={styles.eyebrow}>Free dating · for adults 18+</p>
            <h1 id="free-dating-title">Free to match.<br/>Free to <em>talk.</em></h1>
            <p className={styles.lead}>A good conversation starts with mutual interest—not a paid messaging plan. Create a profile, discover people, like, match and chat on Freeborn.</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href={signup}>Create your profile <span aria-hidden="true">↗</span></Link>
              <a className={styles.secondary} href="#included">See what’s included <span aria-hidden="true">↓</span></a>
            </div>
            <p className={styles.micro}>Use a supported browser. No app-store download required.</p>
          </div>
          <aside className={styles.promise} aria-label="Current access at a glance">
            <div className={styles.promiseTop}><p>The current offer</p><span>No paid plan available</span></div>
            <h2>The basics.<br/>Without the guesswork.</h2>
            <ul className={styles.promiseList}>
              <li><span className={styles.tick} aria-hidden="true">✓</span><div><strong>Profile, discovery &amp; likes</strong><small>Find a starting point that feels like you.</small></div></li>
              <li><span className={styles.tick} aria-hidden="true">✓</span><div><strong>Matching &amp; chat</strong><small>Mutual interest. Real choices about contact.</small></div></li>
              <li><span className={styles.tick} aria-hidden="true">✓</span><div><strong>Photos &amp; voice notes in chat</strong><small>Supported formats and safety limits apply.</small></div></li>
            </ul>
            <p className={styles.promiseFoot}>This describes current core access, not a forever-free promise. Planned membership is not an available purchase.</p>
          </aside>
        </div>
      </section>
      <nav className={styles.sectionNav} aria-label="On this page"><div className={styles.wrap}>
        <a href="#included">01 / Included features</a><a href="#how-it-works">02 / How it works</a><a href="#contact">03 / Contact &amp; boundaries</a><a href="#questions">04 / Questions</a>
      </div></nav>
      <section className={styles.section} id="included" aria-labelledby="included-title"><div className={styles.wrap}>
        <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>Know before you join</p><h2 id="included-title">What “free”<br/>actually covers.</h2></div><p>Free to join and free to hold a conversation are different claims. Here is what is included on Freeborn—and the conditions that still matter.</p></div>
        <div className={styles.tableWrap}><table className={styles.featureTable}>
          <caption>Current core features · no paid plan required · account, privacy and safety requirements still apply</caption>
          <thead><tr><th scope="col">Feature</th><th scope="col">Access</th><th scope="col">What to know</th></tr></thead>
          <tbody>{freeDatingFeatures.map(feature=><tr key={feature.id} data-feature={feature.id}><th scope="row">{feature.name}</th><td><span className={styles.access}>{feature.access}</span></td><td><p className={styles.detail}>{feature.detail}</p><p className={styles.boundary}>{feature.boundary}</p></td></tr>)}</tbody>
        </table></div>
        <p className={styles.inlineNote}>“Included” does not mean unrestricted contact or a guaranteed reply. The current feature set is not a promise about future pricing, local availability or someone else’s interest.</p>
      </div></section>
      <section className={styles.section} id="how-it-works" aria-labelledby="how-title"><div className={styles.wrap}>
        <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>From profile to conversation</p><h2 id="how-title">Three different steps.<br/>One clear distinction.</h2></div><p>You do not need to guess whether a like is a match or whether a match guarantees a response. Each step means something different.</p></div>
        <ol className={styles.steps}>
          <li><span className={styles.stepNumber} aria-hidden="true">01 / INTEREST</span><h3>A like is a hello.</h3><p>It says you are interested in getting to know someone. It does not create an obligation or establish mutual interest.</p></li>
          <li><span className={styles.stepNumber} aria-hidden="true">02 / MUTUAL INTEREST</span><h3>A match goes both ways.</h3><p>Opening a match conversation requires reciprocal likes. Privacy and contact restrictions still apply.</p></li>
          <li><span className={styles.stepNumber} aria-hidden="true">03 / CONVERSATION</span><h3>A reply is a choice.</h3><p>Chat is included when the conversation is available. What happens next depends on both people—not on a promise from a dating site.</p></li>
        </ol>
      </div></section>
      <section className={styles.section} id="contact" aria-labelledby="contact-title"><div className={`${styles.wrap} ${styles.journey}`}>
        <div className={styles.journeyIntro}><p className={styles.eyebrow}>Free does not mean without boundaries</p><h2 id="contact-title">Access to chat.<br/>Not access to everyone.</h2><p>Being able to send a message and being entitled to someone’s attention are not the same thing. Blocks, privacy settings and conversation status remain in place.</p><Link className={styles.textLink} href="/safety">Read the safety information <span aria-hidden="true">↗</span></Link></div>
        <div className={styles.explainers}>{explainers.map(f=><details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div></section>
      <section className={styles.section} aria-labelledby="before-title"><div className={styles.wrap}>
        <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>Your pace. Your decision.</p><h2 id="before-title">Two things worth<br/>checking first.</h2></div><p>A free feature is only useful if the product fits your needs. Take a moment to understand how you will use it and what you want to share.</p></div>
        <div className={styles.twoCards}>
          <article className={styles.infoCard}><p className={styles.eyebrow}>01 / Using your browser</p><h3>No download is a convenience.<br/>Not a different set of safeguards.</h3><p>Open Freeborn in a supported browser. Internet access is still needed, and camera or microphone features may need permission. Do not assume offline messaging or closed-app notifications.</p><p>This page does not promise members near you. Results depend on availability, preferences and visibility choices.</p><Link href="/guides/meet-without-apps" className={styles.textLink}>Explore browser-based dating <span aria-hidden="true">↗</span></Link></article>
          <article className={styles.infoCard}><p className={styles.eyebrow}>02 / Choosing what matters</p><h3>Start with a question.<br/>Keep your private details private.</h3><p>You do not need to share documents, financial information or private health details to have a thoughtful conversation. A verification badge does not guarantee safe intentions.</p><p>Try twelve original conversation topics. Pick a few questions to discuss—without entering answers or creating an account.</p><Link href="/guides/relationship-values-questions" className={styles.textLink}>Try the values conversation tool <span aria-hidden="true">↗</span></Link></article>
        </div>
      </div></section>
      <section className={styles.section} id="questions" aria-labelledby="questions-title"><div className={`${styles.wrap} ${styles.journey}`}>
        <div className={styles.journeyIntro}><p className={styles.eyebrow}>Straight answers</p><h2 id="questions-title">Still wondering<br/>what’s included?</h2><p>Read the current access details before creating an account. For how information is handled, see the <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms</Link>.</p></div>
        <div className={styles.explainers}>{freeDatingQuestions.map(f=><details key={f.q} data-free-dating-faq><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div></section>
      <section className={styles.final} aria-labelledby="next-title"><div className={`${styles.wrap} ${styles.finalInner}`}>
        <div><p className={styles.eyebrow}>When you are ready</p><h2 id="next-title">Make a little room<br/>for a real conversation.</h2><p>For adults 18+. Account, onboarding, privacy and safety requirements apply. No promise of a particular match, response or outcome.</p></div>
        <Link href={signup} className={styles.primary}>Create your profile <span aria-hidden="true">↗</span></Link>
      </div></section>
    </main>
    <footer className={styles.footer}><div className={styles.wrap}><p>Freeborn · Operated by {OPERATOR_NAME} · Adults 18+</p><nav aria-label="Policies and guides" className={styles.footerLinks}><Link href="/guides">Guides</Link><Link href="/safety">Safety</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/cookies">Cookies</Link></nav></div></footer>
  </div>;
}
