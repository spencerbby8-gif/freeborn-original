import Image from "next/image";

/** Owner-requested decorative asset copied from PR #89 only. It is generated
 * marketing art, not members, a testimonial, or proof of matchmaking results. */
export function Hero() {
  return <section className="couple-hero" aria-labelledby="landing-title">
    <Image src="/images/couples-hero.jpg" alt="An illustrative couple together on a mountain ridge above the clouds" fill priority sizes="100vw" className="couple-hero-image"/>
    <div className="couple-hero-shade"/>
    <div className="couple-hero-content"><p className="couple-hero-eyebrow">FREEBORN · MEET WITH INTENTION</p><h1 id="landing-title">Designed for <em>real<br/>connections.</em></h1><p className="couple-hero-sub">Smart matches, real conversations,<br/>meaningful relationships.</p>
      <div className="couple-hero-actions"><a href="/auth?mode=sign-up" className="couple-hero-cta">Find your connection <span aria-hidden="true">↗</span></a><a href="/auth?mode=sign-in" className="couple-hero-login">Sign in</a></div>
      <ul className="couple-hero-points"><li><span aria-hidden="true">◇</span><div><b>Intent-based Matching</b><small>Focus on what truly matters to you.</small></div></li><li><span aria-hidden="true">♧</span><div><b>Privacy First</b><small>Control your visibility and who can contact you.</small></div></li><li><span aria-hidden="true">♡</span><div><b>Better Conversations</b><small>Start with something you share.</small></div></li></ul><p className="couple-hero-art-note">Illustrative generated artwork. Not member photography.</p>
    </div>
  </section>;
}
