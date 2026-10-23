import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { ArrowIcon, BadgeIcon, HeartIcon, ShieldIcon } from "@/components/icons";
import { OpenInNewTab } from "@/components/open-in-new-tab";

const trustPoints = [
  {
    icon: ShieldIcon,
    title: "Private essentials",
    body: "Email and full birth date stay out of discovery, while your public profile stays editable.",
  },
  {
    icon: BadgeIcon,
    title: "Badges have to be earned",
    body: "Verification status is visible only when a profile has it, never implied by default.",
  },
  {
    icon: HeartIcon,
    title: "Context before impulse",
    body: "Intentions, interests, location, and profile completeness sit beside the photos.",
  },
] as const;

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-[100dvh] overflow-x-clip bg-[var(--color-night)]">
      {/* Background elements */}
      <div className="aurora-field" />
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-20" />
      <div className="orb drift absolute -left-24 -top-24 h-[600px] w-[600px] rounded-full bg-[rgba(239,94,94,0.12)] blur-[80px]" />
      <div className="orb drift-alt absolute -right-24 top-20 h-[700px] w-[700px] rounded-full bg-[rgba(138,110,242,0.1)] blur-[100px]" />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col px-6 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-3 py-4">
          <Link href="/" className="transition hover:opacity-80">
            <Wordmark size="md" />
          </Link>
          <div className="flex items-center gap-2.5">
            <OpenInNewTab />
            <Link
              href="/"
              className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[13px] font-bold text-[var(--color-pearl)] transition-all hover:bg-white/[0.08]"
            >
              <ArrowIcon size={16} className="rotate-180 transition-transform group-hover:-translate-x-0.5" />
              Back to home
            </Link>
          </div>
        </header>

        <section className="grid flex-1 items-start gap-10 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-16">
          <div className="hidden lg:block">
            <div className="surface magic-border relative overflow-hidden rounded-[48px] p-10 shadow-[var(--shadow-card-lg)] xl:p-14">
              <div
                className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 rounded-full opacity-60 blur-[80px]"
                style={{ background: "radial-gradient(circle, rgba(217,167,82,0.2), transparent 70%)" }}
              />

              <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--color-sand)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ember-500)] shadow-[0_0_10px_rgba(239,94,94,0.6)]" />
                Dating with Intention
              </div>

              <h1
                className="relative mt-8 text-[clamp(2.5rem,4vw,3.75rem)] leading-[1.05] tracking-tight text-[var(--color-pearl)]"
                style={{ fontFamily: "var(--font-display-stack)", fontVariationSettings: "'opsz' 144, 'wght' 450" }}
              >
                Trust should feel <br />
                <span className="text-ember">effortless</span> from <br />
                the first step.
              </h1>

              <p className="relative mt-8 max-w-lg text-[18px] leading-relaxed text-[var(--color-mist)]">
                Freeborn is a calm space for health autonomy, natural living, and
                lasting love. Meet people who value informed choice as much as you do.
              </p>

              <div className="relative mt-12 space-y-5">
                {trustPoints.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="hover-lift group flex items-start gap-5 rounded-[24px] border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-white/10 hover:bg-white/[0.05]"
                    >
                      <span className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-[var(--color-ember-300)] shadow-[0_4px_12px_rgba(239,94,94,0.1)] transition-transform group-hover:scale-110">
                        <Icon size={22} />
                      </span>
                      <div>
                        <p className="text-[16px] font-bold text-[var(--color-pearl)]">{item.title}</p>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-mist)]">{item.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="animate-fade-in flex items-center justify-center">{children}</div>
        </section>
      </div>
    </main>
  );
}
