import type { Metadata } from 'next';
import Link from 'next/link';
import { ogCard } from '@/lib/site';
import { PageStructuredData } from '@/components/seo/page-structured-data';
import { ValuesConversation } from '@/components/guides/values-conversation';
import { relationshipValues } from '@/lib/relationship-values';

const path = '/guides/relationship-values-questions';
const title = 'Relationship values questions: build a conversation, not a score';
const description = 'Choose the relationship values that matter to you and get thoughtful questions to discuss. Free, no sign-up, no compatibility score and no answers collected.';
export const metadata: Metadata = {title, description, alternates:{canonical:path}, openGraph:ogCard(path,title,description)};

export default function RelationshipValuesQuestionsPage() {
  return <>
    <PageStructuredData path={path} name={title} description={description}/>
    <main className="night-field min-h-[100dvh] text-[var(--color-pearl)]">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-6">
        <Link href="/" className="font-display text-2xl">Freeborn</Link>
        <nav aria-label="Guide navigation" className="flex gap-5 text-sm"><Link href="/guides" className="underline!">Guides</Link><Link href="/safety" className="underline!">Safety</Link></nav>
      </header>
      <article className="mx-auto max-w-3xl px-5 pb-20 pt-8 leading-relaxed">
        <p className="text-xs uppercase tracking-widest text-[var(--color-gold-500)]">Free conversation tool · adults 18+</p>
        <h1 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">Relationship values questions</h1>
        <p className="mt-5 text-lg">Shared values are something to discuss, not a compatibility percentage. Use these original prompts to talk about everyday choices, boundaries and the future—with someone you are dating, or simply to reflect on what matters to you.</p>
        <p className="mt-4">Choose a few topics below and copy the questions if you want. There is no sign-up requirement, no answer box and no message is sent. These are conversation suggestions, not a validated assessment, therapy or a prediction that a relationship will work.</p>
        <ValuesConversation/>
        <h2 className="mt-10 font-display text-2xl">How to use these questions without turning a date into an interview</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-6">
          <li>Ask if the other person is comfortable talking about a topic. A useful opening is: “Would you like to compare what a good relationship looks like to each of us?”</li>
          <li>Start with one question and offer your own answer. Listen to the example behind an answer instead of hunting for a perfect phrase.</li>
          <li>Distinguish a preference from a boundary. Different hobbies may be easy to accommodate; pressure to ignore a clear boundary is a different issue.</li>
          <li>Let people skip questions. You do not need to disclose your finances, health information, identity documents or home address to demonstrate compatibility.</li>
          <li>Revisit what you learn over time. A thoughtful answer is not proof of someone’s intentions; notice whether actions are consistent with it.</li>
        </ol>
        <h2 className="mt-10 font-display text-2xl">Twelve topics and questions to start with</h2>
        <p className="mt-3">You can read the complete question list here even without using the tool.</p>
        <dl className="mt-5 space-y-5">{relationshipValues.map(value=><div key={value.id}><dt className="font-semibold">{value.label}</dt><dd className="mt-1">{value.question}</dd></div>)}</dl>
        <h2 className="mt-10 font-display text-2xl">What if our answers differ?</h2>
        <p className="mt-3">Try asking what the difference would mean in an ordinary week. “I need time alone” could mean a quiet evening, not a lack of interest. “Family matters” could mean weekly visits, financial responsibilities or simply staying in touch. Make room for specifics before deciding whether a difference is workable. You do not have to negotiate away a boundary or persuade someone to stay.</p>
        <h2 className="mt-10 font-display text-2xl">Is this a compatibility test?</h2>
        <p className="mt-3">No. There is no right-answer key, score or diagnosis. Selecting the same topics does not establish that two people are compatible, and selecting different topics does not establish that they are not.</p>
        <h2 className="mt-10 font-display text-2xl">Before sharing anything personal</h2>
        <p className="mt-3">Only copy or share what you are comfortable with. The tool creates questions, not a public profile. For warning signs around money requests and pressure, read our <Link className="underline!" href="/guides/scam-spotting">romance-scam guide</Link> and <Link className="underline!" href="/safety">safety information</Link>. You can also explore our <Link className="underline!" href="/guides/long-distance">long-distance dating guide</Link>.</p>
        <aside className="mt-10 rounded-2xl border border-[var(--color-line)] p-6">
          <h2 className="font-display text-xl">Want to explore Freeborn?</h2>
          <p className="mt-3">This tool is useful on its own. If you would also like to explore values-led dating, <Link className="underline!" href="/">learn about Freeborn</Link> and its safety and privacy information before deciding whether to create an account. This tool does not show member availability near you.</p>
          <p className="mt-3">Before joining, <Link className="underline!" href="/free-dating">see what is included in free matching and messaging</Link>, including contact and privacy limits.</p>
          <Link href="/auth?mode=sign-up" style={{color:'var(--color-night)'}} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[var(--color-gold-500)] px-5 py-2 font-semibold">Create a profile</Link>
        </aside>
      </article>
    </main>
  </>;
}
