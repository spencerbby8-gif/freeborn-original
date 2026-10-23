"use client";

import type { FormEvent, ReactNode } from "react";
import { ArrowIcon, CheckIcon } from "@/components/icons";

export type StepShellProps = {
  stepIndex: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  onBack?: () => void;
  onContinue: (e?: FormEvent) => void;
  continueLabel?: string;
  pending?: boolean;
  saveStatus?: string;
  error?: string | null;
  notice?: { tone: "success" | "error"; title: string; body: string } | null;
  footerTip?: string;
  /** When true, shows the researched "save & finish later" exit (progress is
      already saved server-side; the member resumes this step next visit). */
  allowFinishLater?: boolean;
};

export function StepShell({
  stepIndex,
  totalSteps,
  title,
  subtitle,
  children,
  onBack,
  onContinue,
  continueLabel = "Continue",
  pending = false,
  saveStatus,
  error,
  notice,
  footerTip,
  allowFinishLater = true,
}: StepShellProps) {
  const percent = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div className="animate-scale-in w-full space-y-6">
      {/* Progress — step counter + a filling line + live save status */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.2em] text-[var(--color-sand)]">
          <span>
            Step {stepIndex + 1} of {totalSteps}
          </span>
          <span className="text-[var(--color-ash)]">{saveStatus ?? `${percent}%`}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-[var(--gradient-ember)] transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="fb-card-lg rounded-[32px] border-white/10 bg-white/[0.025] p-6 shadow-xl sm:p-8">
        <div className="mb-6 space-y-2 sm:mb-8">
          <h1 className="fb-h-display">{title}</h1>
          <p className="fb-meta">{subtitle}</p>
        </div>

        {notice ? (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 text-sm ${
              notice.tone === "success"
                ? "border-[rgba(109,211,176,0.2)] bg-[rgba(109,211,176,0.05)] text-[var(--color-success)]"
                : "border-[rgba(255,107,122,0.2)] bg-[rgba(255,107,122,0.05)] text-[var(--color-danger)]"
            }`}
          >
            <span className="font-bold">{notice.tone === "success" ? "✓" : "!"}</span>
            <div>
              <p className="font-black text-[var(--color-pearl)]">{notice.title}</p>
              <p className="mt-0.5 text-xs text-[var(--color-mist)]">{notice.body}</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mb-6 flex items-center gap-2 rounded-2xl border border-[rgba(255,107,122,0.25)] bg-[rgba(255,107,122,0.08)] p-4 text-xs font-bold text-red-200"
          >
            <span className="flex h-2 w-2 rounded-full bg-red-400" />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={onContinue} noValidate className="space-y-6">
          <div className="space-y-5">{children}</div>

          {footerTip ? (
            <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs leading-5 text-[var(--color-mist)]">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[var(--color-gold-500)]/20 text-[var(--color-gold-300)]">
                <CheckIcon size={11} />
              </span>
              <p>{footerTip}</p>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                disabled={pending}
                className="fb-btn fb-btn-ghost sm:w-auto"
              >
                <ArrowIcon size={16} className="rotate-180" />
                Back
              </button>
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={pending}
              className="fb-btn fb-btn-primary group w-full sm:w-auto"
            >
              {pending ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : null}
              <span>{pending ? "Saving…" : continueLabel}</span>
              {!pending ? <ArrowIcon size={16} className="transition-transform group-hover:translate-x-1" /> : null}
            </button>
          </div>

          {allowFinishLater ? (
            <div className="flex justify-center">
              <a
                href="/app"
                className="text-[12px] font-bold text-[var(--color-ash)] underline-offset-4 transition hover:text-[var(--color-pearl)] hover:underline"
              >
                Save &amp; finish later, and you&apos;ll pick up right here
              </a>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
