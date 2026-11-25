import { EDITORIAL_DESCRIPTIONS } from "@/lib/editorial-descriptions";
import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/wordmark';
import { ogCard } from '@/lib/site';
import { PageStructuredData } from '@/components/seo/page-structured-data';
import { datingGuides, GUIDE_REVIEW_DATE } from '@/lib/dating-guides';
import styles from '@/components/guides/editorial.module.css';
const title='Practical dating guides: values, privacy and conversations';
const description=EDITORIAL_DESCRIPTIONS['/guides'];
export const metadata:Metadata={title:{absolute:title+' | Freeborn'},description,alternates:{canonical:'/guides'},openGraph:ogCard('/guides',title,description)};
// Permanent guide URLs stay connected through the editorial registry.
const resources=[
 {href:'/free-dating',category:'Current product access',title:'Free matching and messaging',description:'What is included, how likes and matches differ, and why privacy and contact boundaries still apply.'},
 {href:'/guides/relationship-values-questions',category:'Free conversation tool',title:'Relationship values questions',description:'Pick up to five topics and copy original questions. No answers collected and no compatibility score.'},
 ...datingGuides.map(g=>({href:'/guides/'+g.slug,category:g.category,title:g.title,description:g.description})),
 {href:'/alternatives',category:'Sourced comparison',title:'Considering an Unjected alternative?',description:'Current first-party sources, explicit unknowns and no stale rating headline. Free chat and browser access are not exclusive to Freeborn.'},
];
export default function GuidesPage(){return <div className={styles.page}>
 <PageStructuredData path="/guides" name={title} description={description}/>
 <a className={styles.skip} href="#guides-content">Skip to guides</a>
 <header className={styles.header}><Link href="/" aria-label="Freeborn home" className={styles.brand}><Wordmark size="sm"/></Link><nav aria-label="Guide navigation"><Link href="/free-dating">Free features</Link><Link href="/safety">Safety</Link><Link href="/auth?mode=sign-in">Sign in</Link></nav></header>
 <main id="guides-content"><section className={styles.hero}><p className={styles.kicker}>Freeborn field notes</p><h1>Useful questions.<br/>Clearer choices.</h1><p className={styles.intro}>Practical help for getting to know someone—without oversharing, treating a badge as proof of safety, or expecting a tool to guarantee a relationship.</p><p className={styles.date}>Edited {GUIDE_REVIEW_DATE}. Original examples are labeled fictional. External safety and comparison sources are identified where used.</p></section>
 <section className={styles.hub} aria-label="Dating guides and tools"><div className={styles.hubCards}>{resources.map(r=><Link key={r.href} href={r.href}><small>{r.category}</small><h2>{r.title}</h2><p>{r.description}</p></Link>)}</div></section></main>
 <footer className={styles.footer}>Freeborn · Adults 18+ · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></footer>
 </div>}
