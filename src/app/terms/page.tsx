import type { Metadata } from "next";
import { Callout, Clause, ClauseList, LegalShell, LegalTable } from "@/components/legal-shell";
import {
  CONTACT_EMAIL,
  GOVERNING_LAW,
  MIN_AGE,
  OPERATOR_FORM,
  OPERATOR_NAME,
  SITE_NAME,
} from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The agreement between you and Freeborn: eligibility, your account, the community standard, verification and moderation, your content, liability, and how either side ends it.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

/**
 * Freeborn Terms of Service.
 *
 * Written to be enforceable and readable in the same document. A terms page nobody
 * can parse is not consent, it is a formality, and a platform that asks people for
 * health beliefs and a photograph of their face should not hide behind one.
 *
 * Clause 9 (health content) is the clause that matters most for this particular
 * product. Freeborn is built around medical freedom and natural health, which means
 * members will discuss medical decisions with each other. The service must be
 * unambiguous that it is not a source of medical advice and that member statements
 * about health are the member's own. That protects members from bad advice, and it
 * protects the operator from being characterised as having endorsed it.
 */
export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Terms of Service"
      title={
        <>
          The agreement,{" "}
          <em className="font-medium italic text-gold-soft">in plain language.</em>
        </>
      }
      lede={
        <p>
          These are the terms on which you may use {SITE_NAME}. They are a contract
          between you and {OPERATOR_NAME}. Read them properly: they cover what you
          can be suspended for, what happens to the photographs you upload, and what
          we are and are not liable for. Where a clause limits your rights we have
          said so in the clause itself rather than in small print at the end.
        </p>
      }
    >
      <Clause n="1" title="Who we are and what this covers">
        <p>
          {SITE_NAME} is operated by {OPERATOR_NAME}, an {OPERATOR_FORM}. These terms
          govern your use of the {SITE_NAME} website and web application, including
          every page, feature and API we make available to you.
        </p>
        <p>
          By creating an account you confirm you have read these terms, you are {MIN_AGE}{" "}
          or older, and you agree to be bound by them. If you do not agree, do not
          create an account.
        </p>
        <p>
          Our <a className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4" href="/privacy">Privacy Policy</a>{" "}
          and <a className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4" href="/cookies">Cookie Policy</a>{" "}
          form part of this agreement. Where they conflict with these terms on a
          question about your personal data, the Privacy Policy prevails.
        </p>
      </Clause>

      <Clause n="2" title="Eligibility">
        <ClauseList
          items={[
            <>You must be at least {MIN_AGE} years old. There is no exception and no parental consent route, because this is a dating service.</>,
            <>You must provide your real date of birth. We validate it on the server and the database enforces it, so an understated age will be caught.</>,
            <>You must not have been removed from {SITE_NAME} previously and be evading that removal.</>,
            <>You must not use the service to promote a business, solicit money, recruit, or advertise. {SITE_NAME} is for people meeting people.</>,
            <>You must be legally capable of entering a contract in your jurisdiction.</>,
          ]}
        />
        <p>
          If we discover an account held by someone under {MIN_AGE}, we delete the
          account and its data without notice.
        </p>
      </Clause>

      <Clause n="3" title="Your account">
        <p>
          You are responsible for everything that happens under your account,
          including activity by someone who obtained access because you shared your
          password or left a device logged in. Do not share credentials. Tell us
          immediately at{" "}
          <a className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{" "}
          if you believe your account has been compromised.
        </p>
        {/* Satisfied by code, 2026-10-23. /api/account now requires
            currentPassword for action=change-password and verifies it with
            signInWithPassword on a sessionless client before calling updateUser,
            returning 403 on a mismatch and a generic message instead of the
            provider's own error text. The sessionless client matters: checking the
            credential on the request's own client would replace its tokens, and the
            refresh token minted by the check is revoked afterwards so it does not
            inflate the "active sign-ins" count that the same route reports.
            Two provider switches remain OFF and are deliberately not flipped as part
            of this change: security_update_password_require_current_password and
            security_update_password_require_reauthentication. Turning either on makes
            GoTrue impose its own re-authentication requirement on updateUser, which
            this route's flow (verify on a separate sessionless client, then update on
            the request's own session) may not satisfy, and there is no way to test
            that without live account credentials. The promise in this clause is
            enforced by the route itself, so it does not depend on them. Flipping them
            is defence in depth for other callers of updateUser and should be trialled
            on a preview deployment first. See also src/lib/password.ts, which records
            that the provider's password_min_length is still 6 and can only be raised
            in the Supabase dashboard. */}
        <p>
          Changing your password requires your current password. Changing your email
          address requires you to confirm a link sent to the new address. Both are
          there so that a stolen session cannot quietly become a stolen account.
        </p>
        <p>
          One person, one account. Duplicate accounts are removed, and if you created
          the second one to circumvent a suspension, both go.
        </p>
      </Clause>

      <Clause n="4" title="What Freeborn is, and what it is not">
        <p>
          {SITE_NAME} is a dating and relationship platform for people who prioritise
          health autonomy, natural living and long-term intention. Membership is
          currently free. There is no paid tier, no paywall hiding who liked you, and
          no premium visibility boost to buy. If that changes, these terms change with
          it and you will be told before it takes effect.
        </p>
        <p>What {SITE_NAME} is not:</p>
        <ClauseList
          items={[
            <>It is not a medical service, a clinic, a pharmacy or a source of medical advice. See clause 9.</>,
            <>It is not a guarantee of any outcome. We match people; we cannot make a relationship work and we do not promise that anyone will.</>,
            <>It is not a vetting service. Verification confirms a live person stands behind a profile. It does not certify character, intentions, criminal history, health status or honesty.</>,
            <>It is not a purity test. Members hold a wide range of views on health and medicine. Sharing a value is not a requirement of membership, and no member is entitled to interrogate another about medical decisions.</>,
            <>It is not a place to conduct commerce. Soliciting clients, selling products, fundraising or recruiting are all grounds for removal.</>,
          ]}
        />
        <Callout label="About the verified seal">
          <p>
            The teal seal means one specific thing: at a recorded moment, two
            independent AI models agreed that a live person completed a pose-mimic
            check and that the person in the selfie is consistent with the profile
            photographs. It means nothing beyond that. It is not a background check,
            not an identity document check, not a character reference and not a
            safety guarantee. Uploading a new face photograph revokes the seal until
            you verify again, so the seal always corresponds to the face currently
            shown.
          </p>
          <p>
            One thing to know before you rely on it: new seals are not being issued
            at the moment. Verification depends on two vision engines reached through
            a free third-party relay, and that relay currently strips the image out of
            the request before it reaches a model, so no selfie can be assessed.
            Requests are held as pending rather than approved or rejected, and a
            pending request never grants the seal. If you try to verify today you will
            be told your request is pending, and it will stay pending until the relay
            is repaired. Seals already issued stay in place.
          </p>
        </Callout>
      </Clause>

      <Clause n="5" title="Your content, and the licence you grant us">
        <p>
          You keep ownership of everything you post: your photographs, your bio, your
          prompt answers, your messages. We do not claim it.
        </p>
        <p>
          To operate the service we need a licence to host and display it. By posting
          content you grant {OPERATOR_NAME} a worldwide, non-exclusive, royalty-free,
          transferable and sublicensable licence to use, host, store, reproduce,
          display, distribute and adapt that content for the specific purposes of:
        </p>
        <ClauseList
          items={[
            <>Showing your profile to other members who meet your discovery settings.</>,
            <>Delivering your messages and media to the people you sent them to.</>,
            <>Running identity verification and content moderation on it.</>,
            <>Creating the derivative versions that displaying an image technically requires, such as resized or reformatted copies.</>,
          ]}
        />
        <p>
          That licence ends when you delete the content or your account, except where
          we must retain a copy to comply with law, to resolve a dispute, or to
          complete a moderation investigation already under way. We do not use your
          content to train machine learning models, we do not license it to third
          parties for their own purposes, and we do not use it in marketing without
          your separate written permission.
        </p>
        <p>You represent and warrant that:</p>
        <ClauseList
          items={[
            <>You own your content or have the right to post it.</>,
            <>Every identifiable person in your photographs has consented to being on a dating platform.</>,
            <>Your content is not unlawful, defamatory, harassing, hateful, sexually explicit involving any person under 18, or infringing anyone&rsquo;s rights.</>,
            <>Your content is not generated to deceive, including impersonation and AI-generated faces presented as your own.</>,
          ]}
        />
      </Clause>

      <Clause n="6" title="Our intellectual property">
        <p>
          The {SITE_NAME} name, the flame monogram, the interface, the source code,
          the copy, and the design are ours or licensed to us. These terms do not
          transfer any of it to you. You may not copy, scrape, reverse engineer,
          resell, or build a competing service from it.
        </p>
        <p>
          Automated collection of member data is prohibited outright. Scraping
          profiles, photographs, messages or member lists by any means, including
          through our API, is a material breach and we will pursue it.
        </p>
      </Clause>

      <Clause n="7" title="The community standard">
        <p>
          Membership depends on conduct, not on beliefs. You may hold any view about
          health, medicine, food, faith or politics that is lawful to hold. What you
          may not do is use {SITE_NAME} to harm people.
        </p>
        <p>The following will result in a warning, suspension or removal:</p>
        <ClauseList
          items={[
            <>Harassment, threats, intimidation, or continued contact after being asked to stop.</>,
            <>Hate speech or demeaning treatment based on race, ethnicity, religion, disability, sex, sexual orientation, gender identity, age, or health status. This includes health status. Mocking someone for a medical decision, in either direction, is not debate.</>,
            <>Coercion around medical decisions. Pressuring a member to disclose, justify, change or defend a health choice is a violation. So is pressuring them toward treatment or away from it.</>,
            <>Sending unsolicited sexual imagery, or sexual content to anyone who has not clearly welcomed it.</>,
            <>Impersonation, fake profiles, or misrepresenting who you are.</>,
            <>Soliciting money, gifts or financial assistance from other members, in any framing.</>,
            <>Promoting a business, service, product, fundraiser, recruitment scheme or political campaign.</>,
            <>Sharing another member&rsquo;s personal information, photographs or messages outside the platform. This includes screenshots.</>,
            <>Using the service for commercial research, journalism, surveillance or data collection without written permission.</>,
            <>Attempting to access another member&rsquo;s account, or probing or disrupting the service technically.</>,
            <>Any conduct that is unlawful in the jurisdiction where it occurs.</>,
          ]}
        />
      </Clause>

      <Clause n="8" title="Reports, moderation, suspension and appeal">
        <p>How enforcement actually works, in order:</p>
        <LegalTable
          head={["Step", "What happens"]}
          rows={[
            ["A report is filed", "Report tools are rate limited per account so one person cannot weaponise them with volume. A report opens an investigation; it never punishes anyone on its own."],
            ["Evidence is assessed", "Two AI models from different providers assess reported content independently, judging observable evidence only. They do not read your private conversations."],
            ["Disagreement is held, not decided", "If the models do not agree, nothing is done to your account. A report never suspends anyone and never removes content on its own. Where the engines cannot both run, the report is recorded without a verdict and no action follows."],
            ["Warning first", "For a first substantiated breach that is not severe, you receive a warning with the reason stated. Warnings are recorded in your trust history."],
            ["Suspension", "One ground suspends an account automatically: your sign-in address resolving to a hosting or datacenter range, which the acceptable-use terms do not permit. You are told the reason. Nothing else suspends an account automatically, and being reported is not one of those grounds."],
            ["Appeal", `Every suspension can be appealed at /appeal, and your appeal is read and decided by the operator rather than by a model. Two things stated honestly: reinstatement is a manual act, because the product does not yet lift a suspension automatically when an appeal succeeds, and we do not promise a turnaround time. If your appeal has gone quiet, write to ${CONTACT_EMAIL} and say so.`],
          ]}
        />
        <p>
          We may also remove content or restrict an account immediately, without the
          steps above, where there is an urgent risk to a person&rsquo;s safety, or
          where we are required to by law.
        </p>
        <p>
          We may decline to act on a report, and we will not always tell you the
          outcome of a report you filed about someone else. That is to protect the
          other member&rsquo;s privacy, not to avoid accountability. If you are the
          subject of action, you are always told why.
        </p>
      </Clause>

      <Clause n="9" title="Health content: the clause that matters most here">
        <Callout label="Read this one carefully">
          <p>
            <strong className="text-pearl">{SITE_NAME} does not provide medical
            advice.</strong> Nothing on this service, and nothing said by any member
            on it, is medical advice, diagnosis or treatment.
          </p>
          <p>
            Members will discuss health with each other, because health values are
            part of why this platform exists. Those are their own statements and their
            own beliefs. {OPERATOR_NAME} does not endorse, verify, review or adopt any
            member&rsquo;s views on medicine, vaccination, treatment, nutrition,
            supplements or any other health matter. A profile field such as
            vaccination status is information a member chose to publish about
            themselves. It is not a claim we have checked and it is not a
            recommendation.
          </p>
          <p>
            Do not act on anything you read here instead of consulting a qualified
            professional. If you are in a medical emergency, contact your local
            emergency services.
          </p>
        </Callout>
        <p>
          The identity verification and moderation systems described in clause 8 use
          AI models. They make mistakes. They are deliberately set to escalate rather
          than decide when uncertain, and a human reviews anything doubtful, but no
          automated system is infallible and we do not represent that ours is.
        </p>
      </Clause>

      <Clause n="10" title="Meeting people: your safety">
        <p>
          We build verification, moderation, blocking, reporting and discovery controls
          because they reduce risk. They do not eliminate it. You are meeting
          strangers.
        </p>
        <ClauseList
          items={[
            <>Meet in public first. Tell someone where you are going.</>,
            <>Do not send money to anyone you met here, for any reason, however urgent or sympathetic the reason sounds. Romance fraud follows a recognisable script and urgency is part of it.</>,
            <>Keep the conversation on {SITE_NAME} until you genuinely trust the person. Moving to another platform early removes the record that protects you.</>,
            <>A verified seal confirms a live person matched their photographs at one moment. It tells you nothing about their intentions.</>,
            <>Trust discomfort. You can block or report at any time and you never owe anyone an explanation.</>,
          ]}
        />
        <p>
          We cannot guarantee that any member is who they say they are, that any
          member is safe, or that the service will be free of people behaving badly.
          Anyone who promises you that on a dating platform is not being honest with
          you.
        </p>
      </Clause>

      <Clause n="11" title="Availability, changes and third-party services">
        <p>
          The service is provided as available. We do not commit to an uptime figure
          and there is no service level agreement. We may change, suspend or
          discontinue features, including verification and moderation, and we may need
          to take the service down without notice to fix a security problem.
        </p>
        <p>
          Some features depend on third parties we do not control: infrastructure
          hosting, database and authentication providers, the AI engines used for
          verification and moderation, network geolocation lookups, and a relay used
          for voice and video calls. When one of them fails, the feature that depends
          on it degrades or stops. Where we know about a failure we say so in the
          product rather than letting you assume the fault is yours.
        </p>
        <p>
          Links to other sites are provided for convenience. We do not control them
          and we are not responsible for them.
        </p>
      </Clause>

      <Clause n="12" title="Ending your membership">
        <p>
          You can leave at any time. Settings has a deactivate option that removes you
          from discovery immediately and keeps your data, and a delete option that
          removes your account and your data permanently. Deletion reaches the
          authentication system as well as the application database. It cannot be
          undone and it cannot be recovered afterwards.
        </p>
        <p>
          We may suspend or terminate your account for a breach of these terms, for
          conduct that harms other members, or where we are required to by law. We
          will tell you why, and clause 8 gives you an appeal.
        </p>
        <p>
          Clauses 5, 6, 9, 13, 14, 15 and 16 continue to apply after your membership
          ends.
        </p>
      </Clause>

      <Clause n="13" title="Liability">
        <p>
          We provide the service with care and we stand behind the way we describe it.
          The following limits apply to the fullest extent permitted by law.
        </p>
        <ClauseList
          items={[
            <>The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, whether express, implied or statutory, including implied warranties of merchantability, fitness for a particular purpose and non-infringement.</>,
            <>We are not liable for the conduct of any member, online or offline, including anything that happens when members meet.</>,
            <>We are not liable for content members post, for the accuracy of anything a member states about themselves, or for the accuracy of any profile field a member chose to publish.</>,
            <>We are not liable for indirect, incidental, consequential, special, exemplary or punitive damages, or for lost profits, lost data, loss of goodwill or loss of anticipated savings.</>,
            <>Our total aggregate liability to you for any claim arising out of or relating to these terms or the service is limited to the greater of the amount you paid us in the twelve months before the claim, or one hundred US dollars. Since membership is currently free, that means one hundred US dollars.</>,
          ]}
        />
        <Callout label="What we never exclude">
          <p>
            Nothing in these terms excludes or limits our liability for death or
            personal injury caused by negligence, for fraud or fraudulent
            misrepresentation, for breach of your statutory rights as a consumer, or
            for anything else that cannot lawfully be excluded or limited. Those
            exclusions are not ours to make and we do not attempt them.
          </p>
          <p>
            If you are a consumer, you also keep the benefit of any mandatory
            protections given to you by the law of the country where you live. Nothing
            in these terms deprives you of them.
          </p>
        </Callout>
      </Clause>

      <Clause n="14" title="Your responsibility to us">
        <p>
          You agree to compensate and hold harmless {OPERATOR_NAME} and its operator
          from claims, liabilities, losses, damages and expenses, including reasonable
          legal fees, arising from your breach of these terms, your violation of any
          law or the rights of another person, or your content.
        </p>
        <p>
          This does not apply where the claim arises from our own negligence, from our
          breach of these terms, or from anything we could not lawfully ask you to
          indemnify us for.
        </p>
      </Clause>

      <Clause n="15" title="Governing law and disputes">
        <p>
          These terms are governed by the law of {GOVERNING_LAW}, and the courts of{" "}
          {GOVERNING_LAW} have jurisdiction over any dispute, without prejudice to any
          mandatory consumer protection available to you where you live.
        </p>
        <p>
          Before either of us starts proceedings, please write to{" "}
          <a className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{" "}
          and set out the problem. There is one person operating this service and most
          disputes reaching a person directly get resolved. We would rather fix it than
          litigate it.
        </p>
      </Clause>

      <Clause n="16" title="Changes to these terms and severability">
        <p>
          We may update these terms. When we make a change that materially affects
          your rights or obligations, we will tell you in the product before it takes
          effect and give you a reasonable chance to decide whether to continue.
          Continuing to use {SITE_NAME} after a change takes effect means you accept
          the revised terms.
        </p>
        <p>
          If any part of these terms is found unenforceable, that part is severed or
          read down to the minimum necessary, and the rest continues in full force.
        </p>
        <p>
          If we do not insist on a provision immediately, that is not a waiver of it.
          We can enforce it later.
        </p>
        <p className="pt-2 text-[13px] text-ash">
          Version 1.0. Effective 19 October 2026. Questions:{" "}
          <a className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Clause>
    </LegalShell>
  );
}
