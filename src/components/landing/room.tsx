import { DiscoveryCard } from "@/components/prototype/discovery-card";
import type { DeckProfile } from "@/components/prototype/data";
import "@/components/prototype/prototype.css";

const examples:DeckProfile[]=[
 {id:'example-aria',name:'Aria',age:27,city:'Brooklyn',occupation:'Graphic Designer',headline:'Designing by day, chasing sunsets by night. I believe in deep talks, random adventures, and good coffee.',traits:['Hiking','Ambient music','Matcha'],photo:'/images/prototype/welcome.jpg',photos:[],verified:false,presence:null,distanceKm:null,isNew:false,heightCm:168},
 {id:'example-jonah',name:'Jonah',age:34,city:'Boise',occupation:'Architect',headline:'Sunrise coffee, a long walk, and phones away by dinner. What does a good Sunday look like to you?',traits:['Hiking','Cooking','Live music'],photo:'/images/samples/jonah.jpg',photos:[],verified:false,presence:null,distanceKm:null,isNew:false},
 {id:'example-elena',name:'Elena',age:31,city:'Franklin',occupation:'Teacher',headline:'Curious conversations, new trails and a home full of laughter. Looking for something thoughtful and real.',traits:['Travel','Nature walks','Reading'],photo:'/images/samples/elena.jpg',photos:[],verified:false,presence:null,distanceKm:null,isNew:false},
];
/** Same card component as authenticated Discover. All landing examples are
 * explicit design samples, never member records, verification or activity claims. */
export function Room(){return <section className="landing-room fb-prototype" aria-labelledby="new-room-title"><div className="landing-room-inner"><p className="eyebrow">A LITTLE MORE THAN A PHOTO</p><h2 id="new-room-title" className="display">A glimpse of<br/><em>your next connection.</em></h2><p className="landing-room-sub">Intentions, interests and a little personality—before the first hello.</p><p className="landing-sample-disclosure">Illustrative profiles and generated sample portraits. No accounts exist for these examples. Their buttons open sign-up, not a real member’s inbox.</p><div className="landing-new-card-grid">{examples.map(profile=><div className="landing-deck-card" key={profile.id}><DiscoveryCard profile={profile} illustrative/></div>)}</div><a href="/auth?mode=sign-up" className="landing-room-join">Make room for your story <span aria-hidden="true">↗</span></a></div></section>;}
