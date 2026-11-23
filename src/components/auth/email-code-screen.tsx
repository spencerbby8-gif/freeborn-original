"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { TurnstileGate, turnstileEnabled } from "./turnstile";
import { Button } from "@/components/ui/button";
import { PrototypeIcon } from "@/components/prototype/frame";

type Props = { email: string; code: string; onCode: (code: string) => void; busy: boolean; error: string | null; onVerify: (e: FormEvent) => void; onResend: (captchaToken?: string) => Promise<void>; onBack: () => void };

/** One native autofill/paste field, not six independent keyboard traps.
 * Supabase supports configurable OTP lengths; accept the emailed 6–8 digits. */
export function EmailCodeScreen({ email, code, onCode, busy, error, onVerify, onResend, onBack }: Props) {
  const [captcha,setCaptcha]=useState<string|null>(null);
  const [captchaRound,setCaptchaRound]=useState(0);
  const resendAt=useRef(0);
  const [cooldown, setCooldown] = useState(60);
  useEffect(() => { resendAt.current=Date.now()+60000;const t=window.setInterval(()=>setCooldown(Math.max(0,Math.ceil((resendAt.current-Date.now())/1000))),1000);return()=>clearInterval(t); }, []);
  return <section className="screen active" aria-label="Verify your email"><div className="scroll email-code-scroll">
    <div className="bare-head"><Button unstyled className="bare-icon" aria-label="Change email" onClick={onBack} disabled={busy}><PrototypeIcon name="back"/></Button><span className="step-center">ONE LAST CHECK</span><span className="bare-icon"/></div>
    <div className="email-code-seal"><PrototypeIcon name="lock"/><span/></div>
    <p className="email-code-eyebrow">YOUR CONNECTION STARTS HERE</p>
    <h1 className="display">Check your<br/><em>inbox.</em></h1>
    <p className="onboard-sub">We sent a confirmation code to<br/><strong>{email}</strong></p>
    <form onSubmit={onVerify} noValidate className="email-code-form">
      <label htmlFor="email-confirmation-code" className="setup-label">Email confirmation code</label>
      <input id="email-confirmation-code" className="email-code-input" autoFocus value={code} onChange={e => onCode(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" placeholder="••••••" aria-invalid={Boolean(error)} aria-describedby="email-code-help email-code-error" disabled={busy}/>
      <p id="email-code-help" className="fineprint">Enter the code from your email. Check spam if it hasn’t arrived.</p>
      <div id="email-code-error" role="alert">{error && <p className="fb-error">{error}</p>}</div>
      <Button unstyled type="submit" className="btn-grad big wide" disabled={busy || code.length < 6} aria-busy={busy}>{busy ? "Confirming…" : "Confirm and continue"}<PrototypeIcon name="next"/></Button>
      {turnstileEnabled()&&<TurnstileGate key={captchaRound} onToken={setCaptcha}/>}
      <Button unstyled className="email-code-resend" type="button" disabled={busy || cooldown > 0 || (turnstileEnabled()&&!captcha)} onClick={() => { resendAt.current=Date.now()+60000;setCooldown(60); void onResend(captcha??undefined).finally(()=>{setCaptcha(null);setCaptchaRound(v=>v+1);}); }}>{cooldown ? `Resend code in ${cooldown}s` : "Resend code"}</Button>
      <Button unstyled type="button" className="email-code-change" onClick={onBack} disabled={busy}>Use a different email</Button>
    </form>
    <p className="fineprint center email-code-private"><PrototypeIcon name="shield"/>Your email stays private. Always.</p>
  </div></section>;
}
