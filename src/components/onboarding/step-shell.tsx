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
}: StepShellProps) {
  const percent = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div className="animate-scale-in w-full space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.2em] text-[var(--color-sand)]">
          <span>Step {stepIndex + 1} of {totalSteps}</span>
          <span>{saveStatus ?? `${percent}%`}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-[var(--gradient-ember)] transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-white/[0.025] p-6 shadow-xl sm:p-8">
        <div className="mb-6 space-y-2 sm:mb-8">
          <h1
            className="text-2xl font-black leading-[1.1] tracking-tight text-[var(--color-pearl)] sm:text-3xl lg:text-4xl"
            style={{ fontFamily: "var(--font-display-stack)" }}
          >
            {title}
          </h1>
          <p className="text-sm leading-6 text-[var(--color-mist)] sm:text-base">{subtitle}</p>
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
                className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-bold leading-4 text-[var(--color-pearl)] transition hover:bg-white/[0.07] active:scale-[0.98] disabled:opacity-50"
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
              className="magic-button btn-shine group relative inline-flex min-h-[54px] w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-[var(--color-pearl)] px-8 py-3.5 text-sm font-black leading-4 text-[var(--color-ink)] shadow-lg transition hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {pending ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : null}
              <span>{pending ? "Saving…" : continueLabel}</span>
              {!pending ? <ArrowIcon size={16} className="transition-transform group-hover:translate-x-1" /> : null}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
