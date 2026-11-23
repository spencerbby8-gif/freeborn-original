import Image from "next/image";

export function Hero() {
  return <section className="landing-hero" aria-labelledby="landing-title">
    <div className="landing-hero-art"><Image src="/images/couples-hero.jpg" alt="Illustrative artwork of a couple on a mountain ridge" fill priority sizes="(max-width: 760px) 180vh, (max-width: 1160px) 1160px, 100vw"/></div>
    <div className="landing-hero-inner">
      <p className="landing-kicker">DATING WITH SHARED VALUES</p>
      <h1 id="landing-title">Someone who<br/>gets <em>your world.</em></h1>
      <p className="landing-intro">Meet singles who care about natural living, personal choice and a lasting relationship.</p>
      <a href="/auth?mode=sign-up" className="landing-button">Create your profile <span aria-hidden="true">↗</span></a>
      <p className="landing-hero-note">Free to join. For adults 18 and over.</p>
    </div>
    <p className="landing-art-note">Illustrative artwork, not member photography.</p>
  </section>;
}
