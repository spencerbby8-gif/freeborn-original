const features=[
 {title:'Choose your visibility',body:'Pause discovery or adjust who can see and contact you in privacy settings.'},
 {title:'Keep personal details private',body:'Your email and full date of birth are not displayed on your profile.'},
 {title:'Stay in control',body:'Block or report a member from their profile. End a match when you need to.'},
];
export function Safety(){return <section id="safety" className="landing-section landing-safety" aria-labelledby="landing-safety-title"><div className="landing-container landing-split"><div className="landing-section-heading"><p className="landing-kicker">SAFETY & PRIVACY</p><h2 id="landing-safety-title">Your pace.<br/><em>Your boundaries.</em></h2><p>Getting to know someone takes time. No badge or safety tool can guarantee who a person is, so stay cautious and share only what you’re comfortable with.</p><a href="/safety" className="landing-text-link">Read our safety guidance <span aria-hidden="true">↗</span></a></div><div className="landing-safety-list">{features.map(f=><div key={f.title}><h3>{f.title}</h3><p>{f.body}</p></div>)}</div></div></section>;}
