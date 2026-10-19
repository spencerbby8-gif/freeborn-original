import { Wordmark } from "@/components/wordmark";
import { OPERATOR_NAME, SITE_NAME } from "@/lib/site";

export function Footer() {
  return (
    <footer className="relative border-t hairline bg-void/80">
      <div className="mx-auto max-w-6xl px-5 pb-10 pt-16 sm:px-8">
        <div className="flex flex-col justify-between gap-12 md:flex-row">
          <div className="max-w-sm">
            <Wordmark />
            <p className="mt-5 text-[14px] leading-[1.8] text-mist">
              The relationship platform for people who value health autonomy,
              natural wellness, and intentional long-term commitment.
            </p>
            <p className="mt-6 font-display text-[15px] italic text-gold-soft">
              Date like you mean it.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-12 lg:grid-cols-3 lg:gap-16">
            <div>
              <p className="text-[10px] uppercase tracking-[0.32em] text-sand">Product</p>
              <ul className="mt-5 space-y-3 text-[14px] text-sand">
                <li><a className="transition-colors hover:text-pearl" href="#how">How it works</a></li>
                <li><a className="transition-colors hover:text-pearl" href="#standard">The standard</a></li>
                <li><a className="transition-colors hover:text-pearl" href="#safety">Safety & privacy</a></li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.32em] text-sand">Legal</p>
              <ul className="mt-5 space-y-3 text-[14px] text-sand">
                <li><a className="transition-colors hover:text-pearl" href="/privacy">Privacy Policy</a></li>
                <li><a className="transition-colors hover:text-pearl" href="/terms">Terms of Service</a></li>
                <li><a className="transition-colors hover:text-pearl" href="/cookies">Cookie Policy</a></li>
                <li><a className="transition-colors hover:text-pearl" href="/appeal">Appeal a decision</a></li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.32em] text-sand">Account</p>
              <ul className="mt-5 space-y-3 text-[14px] text-sand">
                <li><a className="transition-colors hover:text-pearl" href="/auth?mode=sign-up">Create account</a></li>
                <li><a className="transition-colors hover:text-pearl" href="/auth?mode=sign-in">Sign in</a></li>
                <li><a className="transition-colors hover:text-pearl" href="#faq">FAQ</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t hairline pt-7 sm:flex-row sm:items-center">
          <p className="text-[12px] tracking-wide text-ash">
            © {new Date().getFullYear()} {OPERATOR_NAME}. {SITE_NAME} is operated by {OPERATOR_NAME}. Built with intention, and no invented numbers.
          </p>
          <p className="text-[12px] tracking-wide text-ash">
            Values-aligned · Private by default · 18+
          </p>
        </div>
      </div>
    </footer>
  );
}
