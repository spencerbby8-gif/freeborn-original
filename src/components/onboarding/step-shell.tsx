"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PrototypeIcon } from "@/components/prototype/frame";

export type StepShellProps = {
  stepIndex: number;
  totalSteps: number;
  title: ReactNode;
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
  allowFinishLater?: boolean;
};

export function StepShell({stepIndex,totalSteps,title,subtitle,children,onBack,onContinue,continueLabel="Continue",pending=false,saveStatus,error,notice,footerTip,allowFinishLater=true}:StepShellProps){
  return <div className="fb-step-shell" data-onboarding-step={stepIndex+1}><div className="bare-head">{onBack?<Button unstyled className="bare-icon" aria-label="Back" onClick={onBack} disabled={pending}><PrototypeIcon name="back"/></Button>:<Link href="/auth" className="bare-icon" aria-label="Back"><PrototypeIcon name="back"/></Link>}<span className="step-center">Step {stepIndex+1} of {totalSteps}</span>{allowFinishLater?<Link href="/app" className="skip-btn" title="Saved steps are kept; required profile steps still need completion">Skip</Link>:<span/>}</div><div className="seg-progress" role="progressbar" aria-label="Profile setup" aria-valuemin={0} aria-valuemax={totalSteps} aria-valuenow={stepIndex+1}>{Array.from({length:totalSteps},(_,i)=><i key={i} className={i<=stepIndex?'done':''}/>)}</div><h1 className="display onboard-head">{title}</h1><p className="onboard-sub">{subtitle}</p>{notice&&<div className="fb-notice" role={notice.tone==='error'?'alert':'status'}><b>{notice.title}</b><p>{notice.body}</p></div>}{error&&<p className="fb-error" role="alert">{error}</p>}<form onSubmit={onContinue} noValidate><div className="setup-fields">{children}</div>{footerTip&&<p className="fineprint" style={{marginTop:16}}>{footerTip}</p>}<div className="onboard-foot"><Button unstyled type="submit" className="btn-grad big wide" disabled={pending} aria-busy={pending}>{pending?'Saving…':continueLabel}</Button><p className="fineprint center" role="status">{saveStatus??'Your progress is saved when you continue.'}</p>{allowFinishLater&&<Link className="fineprint center" style={{display:'block'}} href="/app">Save &amp; finish later — we&apos;ll keep your place.</Link>}</div></form></div>;
}
