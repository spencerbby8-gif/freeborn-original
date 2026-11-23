import type { ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { Wordmark } from '@/components/wordmark';
import { PageStructuredData } from '@/components/seo/page-structured-data';
import type { DatingGuide } from '@/lib/dating-guides';
import styles from './editorial.module.css';

/** Shared SSR editorial shell. Updated means edited, not live/provider certification. */
export async function GuidePage({path,title,eyebrow,updated,description,faqs=[],children,toc=[],intro,closing=true}:{
 path:string;title:string;eyebrow:string;updated:string;description:string;faqs?:readonly {q:string;a:string}[];children:ReactNode;toc?:readonly {id:string;title:string}[];intro?:string;closing?:boolean;
}){
 const nonce=(await headers()).get('x-nonce')??undefined;
 const faqLd={'@context':'https://schema.org','@type':'FAQPage',mainEntity:faqs.map(f=>({'@type':'Question',name:f.q,acceptedAnswer:{'@type':'Answer',text:f.a}}))};
 return <div className={styles.page}>
  <PageStructuredData path={path} name={title} description={description}/>
  {faqs.length>0&&<script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{__html:JSON.stringify(faqLd).replace(/</g,'\\u003c')}}/>}
  <a className={styles.skip} href="#guide-content">Skip to guide</a>
  <header className={styles.header}><Link href="/" aria-label="Freeborn home" className={styles.brand}><Wordmark size="sm"/></Link><nav aria-label="Guide navigation"><Link href="/guides">Guides</Link><Link href="/free-dating">Free features</Link><Link href="/safety">Safety</Link></nav></header>
  <main id="guide-content">
   <div className={styles.hero}><p className={styles.kicker}>{eyebrow}</p><h1>{title}</h1>{intro&&<p className={styles.intro}>{intro}</p>}<p className={styles.date}>Freeborn editorial · edited {updated} · Practical guidance, not a guarantee of outcomes.</p></div>
   <div className={styles.layout}><nav className={styles.toc} aria-label="On this guide"><h2>On this guide</h2>{toc.map(s=><a key={s.id} href={'#'+s.id}>{s.title}</a>)}{faqs.length>0&&<a href="#quick-answers">Quick answers</a>}<a href="#keep-reading">Keep reading</a></nav>
    <article className={styles.body}>{children}
     {faqs.length>0&&<section id="quick-answers" aria-labelledby="answers-title"><h2 id="answers-title">Quick answers</h2>{faqs.map(f=><details key={f.q} data-guide-faq><summary>{f.q}</summary><p>{f.a}</p></details>)}</section>}
     {closing&&<aside className={styles.closing}><h2>Explore at your own pace</h2><p>Read the current free features and safety information before deciding whether Freeborn fits your needs. No local matches or replies are promised.</p><div className={styles.inlineLinks}><Link href="/free-dating">See current access</Link><Link href="/privacy">Read the privacy policy</Link></div><Link href="/auth?mode=sign-up" className={styles.cta}>Create a profile</Link></aside>}
    </article>
   </div>
  </main><footer className={styles.footer}>Freeborn · Adults 18+ · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></footer>
 </div>;
}
export function GuideBody({guide}:{guide:DatingGuide}){
 return <>
  <aside className={styles.callout} aria-label="Key point">{guide.takeaway}</aside>
  {guide.sections.map(section=><section key={section.id} id={section.id} aria-labelledby={section.id+'-title'}><h2 id={section.id+'-title'}>{section.title}</h2>{section.paragraphs?.map(p=><p key={p}>{p}</p>)}{section.items&&(section.ordered?<ol>{section.items.map(p=><li key={p}>{p}</li>)}</ol>:<ul>{section.items.map(p=><li key={p}>{p}</li>)}</ul>)}{section.example&&<figure className={styles.example}><figcaption>Fictional writing example · not a member testimonial</figcaption><blockquote>{section.example}</blockquote></figure>}</section>)}
  {guide.sources&&<section className={styles.sources} aria-labelledby="sources-title"><h2 id="sources-title">Sources and scope</h2><p>External references support the topics identified here; they do not certify Freeborn’s implementation or your device. Linked guidance can change.</p><ul>{guide.sources.map(s=><li key={s.href}><a href={s.href} rel="noreferrer">{s.label}</a></li>)}</ul></section>}
  <section id="keep-reading" aria-labelledby="related-title"><h2 id="related-title">Keep reading</h2><div className={styles.related}>{guide.related.map(link=><Link key={link.href} href={link.href}>{link.label} <span aria-hidden="true"> ↗</span></Link>)}</div></section>
 </>;
}
