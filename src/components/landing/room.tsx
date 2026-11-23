const examples = [
  {name:'Aria',age:27,city:'Brooklyn',photo:'/images/prototype/welcome.jpg',interests:['Hiking','Music','Matcha'],bio:'Usually planning my next hike. Always up for coffee.'},
  {name:'Jonah',age:34,city:'Boise',photo:'/images/samples/jonah.jpg',interests:['Cooking','Live music','Hiking'],bio:'A slow Sunday, a good meal and phones away at dinner.'},
  {name:'Elena',age:31,city:'Franklin',photo:'/images/samples/elena.jpg',interests:['Travel','Nature','Reading'],bio:'A book for the train and a new trail for the weekend.'},
];

/** Static, disclosed examples; no fake member activity or pretend dating controls. */
export function Room(){return <section id="why-freeborn" className="landing-section landing-showcase" aria-labelledby="landing-room-title"><div className="landing-container">
  <div className="landing-section-heading"><p className="landing-kicker">MORE THAN A PHOTO</p><h2 id="landing-room-title">A little in common.<br/><em>A place to start.</em></h2><p>See someone’s interests and what they’re looking for before you say hello.</p></div>
  <div className="landing-profile-grid">{examples.map(p=><article className="landing-profile" key={p.name} aria-label={`${p.name}, sample profile`}><div className="landing-profile-photo"><img src={p.photo} alt={`${p.name}, generated sample portrait`} loading="lazy" width={400} height={440}/><span>Sample profile</span></div><div className="landing-profile-copy"><h3>{p.name}, {p.age}</h3><p className="landing-profile-city">{p.city} · Looking for a relationship</p><ul aria-label="Interests">{p.interests.map(t=><li key={t}>{t}</li>)}</ul><p>{p.bio}</p></div></article>)}</div>
  <p className="landing-sample-note">Illustrative profiles with generated portraits. These are not member accounts.</p>
 </div></section>;}
