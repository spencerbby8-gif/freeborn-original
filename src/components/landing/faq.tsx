/** Single source for visible answers and FAQ structured data. */
export const faqs=[
 {q:'Who is Freeborn for?',a:'Freeborn is for adults looking for a relationship with someone who shares their values, including natural living, health autonomy and personal choice.'},
 {q:'Do we need to agree on everything?',a:'No. You choose what matters to you. Use your profile and preferences to share your lifestyle, interests and relationship goals.'},
 {q:'Is Freeborn free?',a:'You can create a profile, discover people, like, match and message for free. There is no paid plan available at the moment.'},
 {q:'What can other members see?',a:'Members may see your photos, display name, age, city and the profile details you choose to share, subject to your privacy settings. Your email and full date of birth are not displayed.'},
 {q:'Is vaccination status verified?',a:'No. Vaccination status is optional and self-reported for profile details and filtering. New declarations refer to COVID-19 vaccines; older entries may predate that clarification. Neither choosing a status nor completing face verification earns an unvaccinated badge. No health badge is currently issued.'},
 {q:'What does profile verification mean?',a:'A verification badge indicates that a profile completed the available verification process. It is not a background check or a guarantee of identity, intentions or safety.'},
];
export function Faq(){return <section id="faq" className="landing-section" aria-labelledby="landing-faq-title"><div className="landing-container landing-split"><div className="landing-section-heading"><p className="landing-kicker">A FEW QUESTIONS</p><h2 id="landing-faq-title">Before you <em>join.</em></h2></div><div className="landing-faq-list">{faqs.map(f=><details key={f.q}><summary>{f.q}<span aria-hidden="true">+</span></summary><p>{f.a}</p></details>)}</div></div></section>;}
