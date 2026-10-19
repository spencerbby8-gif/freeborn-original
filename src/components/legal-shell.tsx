import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from "@/lib/site";

/**
 * Shared chrome for /privacy, /terms and /cookies.
 *
 * Legal documents get treated as second-class pages in most products: a wall of
 * 12px grey text with no navigation and no way back. That is exactly the wrong
 * instinct for a platform asking people to trust it with health and identity data.
 * These pages are built in the same visual language as /safety, they are readable
 * at a comfortable measure, and they cross-link.
 *
 * Deliberately a Server Component. Legal text must be in the initial HTML so it is
 * indexable, printable, and readable with JavaScript disabled. Nothing here is
 * interactive except links.
 */

type LegalShellProps = {
  eyebrow: string;
  title: ReactNode;
  lede: ReactNode;
  children: ReactNode;
};

/** One numbered clause. The number is supplied so documents stay referencable. */
export function Clause({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mt-24" id={`s${n.replace(/\./g, "-")}`}>
      <h2 className="font-display text-[19px] font-semibold tracking-tight text-pearl sm:text-[21px]">
        <span className="mr-3 text-[13px] font-black tabular-nums text-gold-soft">{n}</span>
        {title}
      </h2>
      <div className="mt-3.5 space-y-4 text-[15px] leading-[1.85] text-mist">{children}</div>
    </section>
  );
}

/** Sub-list inside a clause. */
export function ClauseList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-[0.65em] h-[5px] w-[5px] shrink-0 rounded-full bg-gold-soft/70" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A bordered callout for the parts a reader genuinely must not miss.
 * Used sparingly; a document where everything is emphasised emphasises nothing.
 */
export function Callout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[var(--color-teal-500)]/20 bg-[var(--color-teal-500)]/[0.04] p-5 sm:p-6">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--color-teal-300)]">
        {label}
      </p>
      <div className="mt-2.5 space-y-3 text-[14px] leading-[1.8] text-mist">{children}</div>
    </div>
  );
}

/** Definition-style table for data categories and retention periods. */
export function LegalTable({
  head,
  rows,
}: {
  head: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px] leading-[1.7]">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="border-b hairline pb-2.5 pr-4 text-[11px] font-black uppercase tracking-[0.12em] text-pearl/70"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) => (
                <td
                  key={j}
                  className="border-b hairline py-3 pr-4 align-top text-mist last:pr-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Links between the three legal documents, so no reader hits a dead end. */
const siblings = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookies", label: "Cookie Policy" },
];

export function LegalShell({ eyebrow, title, lede, children }: LegalShellProps) {
  return (
    <main className="night-field min-h-[100dvh]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" className="transition hover:opacity-80">
          <Wordmark size="md" />
        </Link>
        <Link href="/" className="btn-ghost rounded-full px-5 py-2.5 text-[13px] font-bold">
          Back to home
        </Link>
      </header>

      <article className="mx-auto max-w-3xl px-5 pb-24 pt-8 sm:px-8 lg:pt-14">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-pearl">
          {title}
        </h1>
        <div className="mt-5 text-[15px] leading-[1.8] text-mist">{lede}</div>

        <p className="mt-6 text-[12.5px] uppercase tracking-[0.1em] text-pearl/45">
          Version {LEGAL_VERSION} · Effective {LEGAL_EFFECTIVE_DATE}
        </p>

        <div className="mt-10 space-y-11">{children}</div>

        <nav
          aria-label="Other legal documents"
          className="mt-16 flex flex-wrap gap-3 border-t hairline pt-8"
        >
          {siblings.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-full border hairline bg-abyss/60 px-5 py-2.5 text-[13px] font-semibold text-mist transition hover:border-ember/30 hover:text-pearl"
            >
              {s.label}
            </Link>
          ))}
          <Link
            href="/safety"
            className="rounded-full border hairline bg-abyss/60 px-5 py-2.5 text-[13px] font-semibold text-mist transition hover:border-ember/30 hover:text-pearl"
          >
            Safety &amp; trust
          </Link>
        </nav>
      </article>
    </main>
  );
}
