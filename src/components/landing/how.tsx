const steps=[
 {title:'Tell your story',body:'Add photos, a short bio and the things that matter to you.'},
 {title:'Find common ground',body:'Explore profiles and choose your age, distance and lifestyle preferences.'},
 {title:'Start a conversation',body:'Like someone, match when the interest is mutual, and take it from there.'},
];
export function HowItWorks(){return <section id="how" className="landing-section" aria-labelledby="landing-how-title"><div className="landing-container"><div className="landing-section-heading"><p className="landing-kicker">HOW IT WORKS</p><h2 id="landing-how-title">From a profile<br/><em>to a proper hello.</em></h2></div><ol className="landing-steps">{steps.map((s,i)=><li key={s.title}><span aria-hidden="true">0{i+1}</span><h3>{s.title}</h3><p>{s.body}</p></li>)}</ol></div></section>;}
