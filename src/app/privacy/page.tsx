import type { Metadata } from "next";
import { Callout, Clause, ClauseList, LegalShell, LegalTable } from "@/components/legal-shell";
import { CONTACT_EMAIL, OPERATOR_FORM, OPERATOR_NAME, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Freeborn collects, why it collects it, who it shares it with, how long it keeps it, and how to get it deleted. Written to describe the system that actually ships.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

/**
 * Freeborn Privacy Policy.
 *
 * HOW THIS WAS WRITTEN
 * --------------------
 * Every factual statement below was checked against the database schema in
 * `src/db/schema.ts`, the API routes in `src/app/api`, the live Supabase project
 * `ihwtpwlszegrjgakqsxx`, and the deployed build, on 2026-10-19. Nothing here is
 * aspirational copy. Where the system has a limitation, the limitation is stated.
 *
 * MAINTAINING IT
 * --------------
 * This document describes behaviour, so it breaks when behaviour changes. If you add
 * a data field, a subprocessor, a tracker or a retention period, edit this file in
 * the same commit. Bump LEGAL_VERSION and LEGAL_EFFECTIVE_DATE in `@/lib/site` and
 * add a line to the "Changes" clause. A privacy policy that quietly falls behind the
 * product is worse than none, because members rely on it.
 *
 * Statements in here that depend on code changes shipped alongside this policy are
 * marked with a dependency comment so the coupling is visible to whoever edits next.
 */
export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Privacy Policy"
      title={
        <>
          What we collect,{" "}
          <em className="font-medium italic text-gold-soft">and exactly why.</em>
        </>
      }
      lede={
        <p>
          Freeborn asks people for more than most apps do: where they are, how they
          live, what they believe about their own health, and a photograph of their
          face. That is a serious thing to request, so this policy describes the real
          system rather than a reassuring summary of it. Where we fall short of an
          ideal, we say so below instead of leaving you to find out later.
        </p>
      }
    >
      <Clause n="1" title="Who is responsible for your data">
        <p>
          {SITE_NAME} is operated by {OPERATOR_NAME}, an {OPERATOR_FORM}. {OPERATOR_NAME}{" "}
          is the data controller for everything described in this policy, which means
          it decides why and how your personal data is processed and it is answerable
          for it.
        </p>
        <p>
          {SITE_NAME} is run by one person. There is no data protection officer,
          because there is no team large enough to require one. That is not an excuse
          for less care; it means the person you contact is the person responsible.
          Write to{" "}
          <a
            className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4 transition hover:decoration-gold-soft"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>{" "}
          and you reach the controller directly.
        </p>
      </Clause>

      <Clause n="2" title="The short version">
        <Callout label="If you read nothing else">
          <ClauseList
            items={[
              <>We sell nothing. There are no advertisers, no data brokers, no advertising cookies and no third-party analytics on this site.</>,
              <>Your face photograph used for identity verification is <strong className="text-pearl">stored</strong>, not discarded after the check. Clause 7 explains precisely what is kept and for how long.</>,
              <>Your verification image is sent to two external AI providers so two independent models can compare it to your profile photos. Neither provider has signed a data processing agreement with us. That is disclosed in clause 8 rather than glossed over.</>,
              <>Your exact coordinates are stored so distance can be calculated. Only a distance in kilometres is ever shown to another member.</>,
              <>You can export everything at Settings, and delete everything at Settings. Deletion reaches the authentication system too, not just the profile table.</>,
              <>{SITE_NAME} is for adults. Membership requires you to be {18} or older.</>,
            ]}
          />
        </Callout>
      </Clause>

      <Clause n="3" title="What we collect, and the basis for each item">
        <p>
          The table below is the complete list. If a category of data is not in this
          table, we do not collect it.
        </p>
        <LegalTable
          head={["Category", "What it actually is", "Why we need it", "Legal basis"]}
          rows={[
            [
              <strong key="k1" className="text-pearl">Account</strong>,
              "Email address, password (hashed by the authentication provider, never readable by us), account creation time.",
              "To identify you as a member and keep others out of your account.",
              "Contract",
            ],
            [
              <strong key="k2" className="text-pearl">Profile</strong>,
              "Display or first name, date of birth, gender and the genders you want to see, city and region, occupation, education, religion, language, height, marital status, whether you have or want children, drinking and smoking, lifestyle, values, interests, relationship goals, a bio, prompt answers, and up to six photographs.",
              "This is the product. Compatibility on Freeborn is built from these fields, and other members see them so they can decide with context.",
              "Contract, plus consent for the optional fields you choose to fill",
            ],
            [
              <strong key="k3" className="text-pearl">Health and belief data</strong>,
              "Vaccination status, wellness and lifestyle rhythm, and the health-autonomy orientation you express in your bio and prompts.",
              "So members can find people whose approach to health is compatible with their own, without having to raise it as a confrontation in a first message.",
              "Explicit consent, see clause 4",
            ],
            [
              <strong key="k4" className="text-pearl">Verification image</strong>,
              "One selfie you take during a pose-mimic identity check, held as an image file, plus the verdict and the timestamp.",
              "To confirm a live person stands behind the profile, and to re-confirm it if you later change your photographs.",
              "Explicit consent, see clauses 4 and 7",
            ],
            [
              <strong key="k5" className="text-pearl">Location</strong>,
              "Latitude, longitude and the accuracy figure reported by your device, stored in a private table. Also your declared city and region. Your coordinates are additionally sent from your browser to a reverse-geocoding service to turn them into a city name; see clause 8.",
              "To calculate the distance shown on cards, to apply your distance preference, and to fill in your city during onboarding.",
              "Contract, and consent when your browser prompts for location",
            ],
            [
              <strong key="k6" className="text-pearl">Activity</strong>,
              "Likes, passes, superlikes, matches, messages, reactions, who you blocked, reports you filed, appeals you made, and your notification preferences.",
              "To run matching and chat, to let you undo a swipe, and to enforce the community standard.",
              "Contract, plus legitimate interests for abuse prevention",
            ],
            [
              <strong key="k7" className="text-pearl">Trust and security records</strong>,
              "Warnings, suspensions, trust history, and security events such as a suspected spoofed GPS reading or a sign-in from a datacenter network.",
              "To act on abuse with evidence rather than on reports alone, and to give you something concrete to appeal against.",
              "Legitimate interests",
            ],
            [
              <strong key="k8" className="text-pearl">Technical</strong>,
              "IP address, user agent, session records, and an IP geolocation lookup used to classify the network you signed in from.",
              "To detect automated sign-ups from hosting providers and to keep sessions working.",
              "Legitimate interests",
            ],
            [
              <strong key="k9" className="text-pearl">Chat media</strong>,
              "Images and other files you send inside a conversation.",
              "So the conversation you chose to have can contain them.",
              "Contract",
            ],
          ]}
        />
        <p>
          We do <strong className="text-pearl">not</strong> collect: government
          identification documents, national insurance or social security numbers,
          payment card data, contacts from your phone, precise location history, or
          anything from your device beyond what the table lists.
        </p>
      </Clause>

      <Clause n="4" title="Health data and your face: explicit consent">
        <p>
          Vaccination status, health-related lifestyle information and a facial image
          used for identification are classified as special category data under
          Article 9 of the UK and EU GDPR, and receive equivalent protection under
          other laws including the Nigerian Data Protection Act 2023 and, in
          California, the CPRA. They cannot be processed on the ordinary bases. We
          process them on the basis of your <strong className="text-pearl">explicit
          consent</strong>.
        </p>
        <p>Concretely, that means:</p>
        <ClauseList
          items={[
            <>You are asked separately, in plain language, before either is collected. It is not bundled into accepting these terms.</>,
            <>Both are optional. You can use Freeborn with an unverified profile and with no vaccination status shown. Choosing not to consent does not lock you out of matching or messaging.</>,
            <>You can withdraw consent at any time from Settings. Withdrawing removes the data; it does not undo anything already lawfully done with it before you withdrew.</>,
            <>Withdrawing consent for your verification image removes the teal verified seal from your profile, because the seal is a claim we can no longer support.</>,
          ]}
        />
        <Callout label="One thing we will not pretend">
          <p>
            A dating profile that says &ldquo;natural health&rdquo; or &ldquo;medical
            freedom&rdquo; reveals something about your beliefs whether or not you
            tick a consent box. If you write it in your own bio, that is your speech
            and your choice, and we will host it. What we will not do is infer a
            health status you never stated, or score you on one. There is no hidden
            health attribute in the schema and no model deriving one.
          </p>
        </Callout>
      </Clause>

      <Clause n="5" title="What other members can see">
        <p>
          Discovery is controlled by you and enforced on the server, not hidden with
          styling. Other signed-in members can see the profile fields you published,
          your first or chosen display name, your age in years, your city, a distance
          in kilometres, and your verification status.
        </p>
        <p>They cannot see, through any surface we provide:</p>
        <ClauseList
          items={[
            <>Your email address.</>,
            <>Your full date of birth. Age is derived; the date is not published.</>,
            <>Your surname, unless you chose to put it in your display name.</>,
            <>Your exact coordinates. Only a calculated distance is exposed, and if you enable <em className="text-pearl">hide distance</em> the value is withheld on the server rather than blurred in the browser.</>,
            <>Your messages, matches, likes or reports.</>,
            <>Your verification selfie. It is never served to another member through any route.</>,
            <>Whether you are in incognito, paused or hidden. Those settings remove you from other members&rsquo; discovery results entirely.</>,
          ]}
        />
        {/* DEPENDENCY: this clause is only true once B6 ships. /api/profiles and
            /api/profile/[id] currently answer unauthenticated requests and the
            detail route ignores discoverable, profileStatus, incognito,
            discovery_paused and blocks. Do not publish this page before that
            change is deployed and verified live. */}
        <p>
          Profile data is only returned to authenticated sessions that pass your
          discovery settings. It is not a public directory and it is not crawlable.
        </p>
      </Clause>

      <Clause n="6" title="Automated decisions and profiling">
        <p>
          Freeborn ranks and filters candidates using the preferences you set: age
          range, distance, genders shown, intentions, and whether to see verified
          members only. That is a filter you configured, applied to fields you
          published. It is not an opaque recommendation model, there is no
          compatibility percentage, and no machine learning model decides who you are
          shown beyond the filters you chose.
        </p>
        <p>
          Two automated systems do make judgements about you, and you should know
          their limits:
        </p>
        <ClauseList
          items={[
            <><strong className="text-pearl">Identity verification.</strong> Two independent AI models compare your selfie to your profile photographs. The system is deliberately moderate: it hard-rejects only objective failures such as no face detected, unusable light, or a clearly different person. Anything doubtful is escalated rather than decided.</>,
            <><strong className="text-pearl">Report triage.</strong> Two models from different providers assess reported content against observable evidence only. They never read your private conversations. A report on its own never suspends anyone.</>,
            <>In both cases a human reviews anything the models do not agree on, and every suspension can be appealed at <a className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4" href="/appeal">/appeal</a>.</>,
            <>No decision that produces a legal or similarly significant effect is made without that human step.</>,
          ]}
        />
        <Callout label="Current operational status, stated plainly">
          <p>
            Both AI engines are third-party services on free tiers, and both have
            experienced availability failures. When either engine cannot run,
            verification does not silently pass and it does not silently fail you. The
            request is held in a human review queue and you are told it is pending.
            We would rather the seal be slow than the seal be wrong.
          </p>
          {/* DEPENDENCY: requires the B2 work. As of 2026-10-19 stage 1 vision
              returned 502 and stage 2 vision returned 400 on the live deployment,
              and rejected requests were recorded as "rejected" rather than queued. */}
        </Callout>
      </Clause>

      <Clause n="7" title="Your verification selfie, in full detail">
        <p>
          This is the most sensitive thing we hold, so it gets its own clause rather
          than a line in a table.
        </p>
        <p>
          An earlier version of our safety page claimed that &ldquo;nothing is stored
          but the verdict&rdquo;. That was not accurate and it has been corrected.
          Here is what actually happens:
        </p>
        <ClauseList
          items={[
            <>When you submit, the selfie is stored in our database and in a private storage bucket that is not publicly readable and not publicly listable.</>,
            <>It is transmitted to two external AI providers so two independent models can compare it against your profile photographs. See clause 8.</>,
            <>If you are <strong className="text-pearl">approved</strong>, the image is retained while your account exists. This is not hoarding: when you later upload a new face photograph, the system re-reads your approved selfie to confirm the new photo is still the same person, and revokes the seal if it cannot. Without retention that check is impossible.</>,
            <>If you are <strong className="text-pearl">rejected</strong>, or if a request expires without a decision, the image serves no further purpose and is deleted within 30 days. The verdict and the reason are kept; the face is not.</>,
            <>If you <strong className="text-pearl">delete your account</strong>, the selfie goes with it, including the copy in the storage bucket.</>,
            <>If you <strong className="text-pearl">withdraw consent</strong> without deleting your account, the selfie is deleted and your seal is removed.</>,
          ]}
        />
        {/* DEPENDENCY: the 30-day purge of non-approved selfies is a code change that
            ships with this policy. Verified 2026-10-19 that all 8 existing
            verification_requests rows retained their selfie_media (707 kB total)
            with no purge anywhere in the codebase. */}
        <p>
          We do not build biometric templates, embeddings or face vectors, and we do
          not run a face recognition database across members. The comparison is a
          one-to-one check between your selfie and your own photographs, performed at
          the moment you verify.
        </p>
      </Clause>

      <Clause n="8" title="Who we share your data with">
        <p>
          We do not sell personal data, we do not share it with advertisers, and we do
          not share it with data brokers. The following processors handle data on our
          behalf, because a dating service cannot run without them.
        </p>
        <LegalTable
          head={["Processor", "What it receives", "Where", "Agreement in place"]}
          rows={[
            [
              <strong key="k10" className="text-pearl">Supabase</strong>,
              "The entire database: profile, messages, verification records, sessions. Also authentication.",
              "United States, us-east-1",
              "Standard terms of service. No negotiated DPA.",
            ],
            [
              <strong key="k11" className="text-pearl">Vercel</strong>,
              "Application hosting. Request logs including IP address and user agent.",
              "United States",
              "Standard terms of service.",
            ],
            [
              <strong key="k12" className="text-pearl">Antigravity relay</strong>,
              "Your verification selfie and your profile photographs, for stage 1 identity comparison. This is not a commercial vendor: it is a relay we built ourselves, which forwards requests to Google's free consumer AI tier through a personal Google account token, and it runs on a separate hosting account from this website.",
              "United States, plus Google's own infrastructure",
              <span key="k13" className="text-[#e0a08a]"><strong>None, and the upstream terms forbid this use.</strong> Detailed below.</span>,
            ],
            [
              <strong key="k14" className="text-pearl">VoidAI</strong>,
              "The same images for stage 2 comparison, and reported content for moderation triage.",
              "Not disclosed by the provider",
              <span key="k15" className="text-[#e0a08a]"><strong>None.</strong> No DPA, and no published image retention period.</span>,
            ],
            [
              <strong key="k16" className="text-pearl">ip-api.com</strong>,
              "Your IP address, to classify the network type you signed in from.",
              "Not disclosed",
              "Free tier, no agreement. Queried over unencrypted HTTP, see below.",
            ],
            [
              <strong key="k17" className="text-pearl">BigDataCloud</strong>,
              "Your latitude and longitude, sent directly from your browser during onboarding, to resolve them into a city and region name. Your coordinates are in the request, so this provider sees your precise position at that moment.",
              "Not disclosed",
              <span key="k18" className="text-[#e0a08a]"><strong>None.</strong> Free client-side API, no agreement, no published retention.</span>,
            ],
            [
              <strong key="k19" className="text-pearl">metered.ca open relay</strong>,
              "Call traffic metadata while no private relay is configured: that a call occurred, its duration, and both participants&rsquo; IP addresses. Media itself is encrypted end to end and the relay cannot read it.",
              "Canada / distributed",
              "Free community service, no agreement.",
            ],
            [
              <strong key="k20" className="text-pearl">Cloudflare Turnstile</strong>,
              "A device and interaction token used to distinguish people from bots at sign-in.",
              "United States / distributed",
              "Standard terms. Only active once configured.",
            ],
          ]}
        />
        <Callout label="Three disclosures we would rather make than bury">
          <p>
            <strong className="text-pearl">The AI providers.</strong> Neither the
            Antigravity relay nor VoidAI is under a data processing agreement with us,
            and neither publishes how long it retains images. Your selfie is therefore
            transmitted to processors whose retention practices we cannot verify and
            cannot contractually constrain.
          </p>
          <p>
            The Antigravity relay deserves more detail, because it is the weaker of the
            two and it handles your face. It is infrastructure we built rather than a
            service we bought. It reaches Google through the free consumer tier of a
            personal Google account, and Google&rsquo;s terms for that tier permit
            personal and development use and prohibit operating it as a relay for other
            people. Using it to process members&rsquo; verification selfies for a
            dating service is outside those terms. It is also subject to a weekly quota
            reset and to token expiry, either of which can stop it working without
            notice; a sibling provider in the same relay had already failed that way
            when this policy was written.
          </p>
          <p>
            We consider all of that unacceptable for a production service, and replacing
            it with a vision provider under a signed agreement is scheduled work rather
            than an aspiration. Until it is replaced you are entitled to know, and you
            are entitled to decline verification entirely and use {SITE_NAME}{" "}
            unverified. Verification is optional and declining it does not restrict
            matching or messaging.
          </p>
          <p>
            <strong className="text-pearl">The IP lookup.</strong> The network-type
            check calls ip-api.com over plain HTTP, because that provider&rsquo;s free
            tier does not offer TLS. Your IP address is therefore transmitted
            unencrypted on that one request. The check is designed to fail open: if it
            errors or times out you are treated as legitimate, so nobody is locked out
            because a free API was slow.
          </p>
          <p>
            <strong className="text-pearl">The reverse geocoding call.</strong> When
            you share your location during onboarding, the conversion from coordinates
            to a city name happens in your browser calling BigDataCloud directly, not
            through our server. That means your precise latitude and longitude, plus
            your IP address and user agent, go straight to a third party we have no
            agreement with. It is done this way because the provider&rsquo;s free tier
            is a client-side API and routing it through our server would need a paid
            key. The fix is to move that call server-side, and it is on the list. Until
            then you should know it happens, and you can decline to share your location
            and enter your city manually instead.
          </p>
        </Callout>
      </Clause>

      <Clause n="9" title="International transfers">
        <p>
          Our infrastructure is in the United States. If you use Freeborn from the UK,
          the EU, Switzerland or Nigeria, your data is transferred out of your
          jurisdiction.
        </p>
        <p>
          For transfers out of the UK and EU we currently rely on the processors&rsquo;
          own standard contractual terms where they offer them. For the two AI
          providers named in clause 8 we have no transfer mechanism in place at all,
          which is the same gap and the same remedy. This is stated rather than
          papered over with a general assurance.
        </p>
      </Clause>

      <Clause n="10" title="How long we keep things">
        <LegalTable
          head={["Data", "Kept for", "Why that long"]}
          rows={[
            ["Account and profile", "Until you delete your account", "It is your profile; it exists while you want it to."],
            ["Approved verification selfie", "Life of the account", "Required to re-check your identity when you change photographs."],
            ["Rejected or expired verification selfie", "30 days after the decision, then deleted", "The verdict and reason are what matter for appeals; the face is not."],
            ["Messages and chat media", "Until you unmatch or delete your account", "Unmatching removes the conversation for both members."],
            ["Location fix", "Overwritten by the next fix; not a history", "We keep where you are, not where you have been. There is no location trail."],
            ["Reports, appeals, warnings, suspensions", "Life of the account", "Needed to act on patterns rather than single accusations."],
            ["Security events", "Life of the account", "Evidence for abuse decisions and for your appeal."],
            ["Sessions", "Until revoked, expired or the account is deleted", "So you can see and revoke your own logged-in devices."],
            ["Deleted account", "Removed at the point of deletion, see clause 11", "No shadow copy is retained."],
          ]}
        />
        <p>
          We have no fixed maximum lifetime for an active account and we do not delete
          data from members who are simply inactive, because a person returning after
          a year should find their matches still there. If that changes, this clause
          changes with it and the version number above moves.
        </p>
      </Clause>

      <Clause n="11" title="Your rights, and how to use each one">
        <p>
          Depending on where you live you have some or all of the rights below. We
          honour all of them for everyone regardless of jurisdiction, because running
          two standards is how members get treated unequally.
        </p>
        <ClauseList
          items={[
            <><strong className="text-pearl">Access and export.</strong> Settings has a data export. It produces a scoped copy of your own data. Nothing is gated behind an email request or an identity interrogation.</>,
            <><strong className="text-pearl">Correction.</strong> Every profile field is editable by you at any time. If something is wrong that you cannot edit yourself, email us.</>,
            <><strong className="text-pearl">Deletion.</strong> Settings, danger zone, delete. Deletion removes your profile, photographs, messages, chat media, matches, likes, reports, security events, sessions, verification records and selfies, and it removes your authentication account, refresh tokens and identities from the auth system. It is immediate and it is not reversible.</>,
            <><strong className="text-pearl">Withdraw consent.</strong> Turn off verification or clear your health fields in Settings at any time.</>,
            <><strong className="text-pearl">Object and restrict.</strong> Email us. We will stop the processing you object to unless we can show a compelling legitimate ground, which we will explain to you in writing rather than assert.</>,
            <><strong className="text-pearl">Complain.</strong> To your local regulator. In the UK that is the Information Commissioner&rsquo;s Office. In the EU, your national authority. In Nigeria, the Nigeria Data Protection Commission. In California, the CPPA. You do not need our permission and we will not ask you to explain why.</>,
          ]}
        />
        <Callout label="An honest limitation on deletion">
          <p>
            Deleting your account removes your trust and abuse records along with
            everything else, because those records are attached to the account. That is
            the right outcome for someone leaving in good faith and the wrong outcome
            for someone leaving to escape a suspension and return as a stranger. We do
            not currently retain an anonymised abuse fingerprint after deletion, so a
            deleted account&rsquo;s history does not follow a new registration. We are
            telling you that plainly rather than claiming a permanence we have not
            built.
          </p>
        </Callout>
        <p>
          To exercise any right by email, write to{" "}
          <a
            className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
          . We answer within 30 days and normally much faster. We will ask you to
          confirm you are signed in to the account concerned, because verifying who is
          asking is the entire point of not handing your data to a stranger.
        </p>
      </Clause>

      <Clause n="12" title="Cookies and local storage">
        <p>
          Covered in full in the <a className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4" href="/cookies">Cookie Policy</a>.
          The summary: we set authentication cookies so your session works, and we
          register a service worker so the app can be installed. There are no
          advertising cookies, no cross-site trackers and no analytics cookies.
        </p>
      </Clause>

      <Clause n="13" title="Security">
        <p>
          All traffic is served over TLS with HTTP Strict Transport Security and
          preload enabled. Passwords are hashed by the authentication provider and are
          never readable by us. Database access runs through a connection pooler with
          TLS. Sessions use rotating refresh tokens, so a stolen refresh token is
          detectable. Uploads are restricted by MIME type and size, and rate limited.
        </p>
        <p>
          Row-level security is enabled on every table in the database. The
          application itself connects with an administrative role that bypasses those
          policies, so the application code is the operative access control and we
          treat it accordingly.
        </p>
        <p>
          No system is unbreachable and anyone who tells you otherwise is selling
          something. If we suffer a breach that creates a high risk to your rights, we
          will tell the relevant regulator within 72 hours of becoming aware of it and
          we will tell you directly, without waiting for you to notice.
        </p>
      </Clause>

      <Clause n="14" title="Children">
        <p>
          {SITE_NAME} is for adults aged 18 and over. We do not knowingly collect data
          from anyone under 18 and the service is not directed at children.
        </p>
        {/* DEPENDENCY: H4. Date of birth is validated server-side on the onboarding
            route and a CHECK constraint enforces it at the database level. Verified
            2026-10-19 that the production database contains zero under-18 rows. */}
        <p>
          Date of birth is required during onboarding and is validated on the server,
          not only in the browser, with a database-level constraint behind it. If we
          learn an account belongs to someone under 18 we delete the account and its
          data. If you believe someone under 18 is using Freeborn, tell us at{" "}
          <a
            className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Clause>

      <Clause n="15" title="Changes to this policy">
        <p>
          Version 1.0, effective 19 October 2026. This is the first published version.
        </p>
        <p>
          When we make a substantive change we will update the version number and the
          effective date at the top of this page, and where the change affects how
          your existing data is used we will tell you in the product before it takes
          effect rather than after. Minor corrections to wording do not move the
          version number.
        </p>
      </Clause>

      <Clause n="16" title="Contact">
        <p>
          {OPERATOR_NAME} ({OPERATOR_FORM}), operating {SITE_NAME}.
        </p>
        <p>
          Email{" "}
          <a
            className="font-semibold text-gold-soft underline decoration-gold-soft/40 underline-offset-4"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          If you are in the UK or EU and are not satisfied with our answer, you can
          complain to the Information Commissioner&rsquo;s Office or your national
          supervisory authority. If you are in Nigeria, to the Nigeria Data Protection
          Commission. If you are in California, to the California Privacy Protection
          Agency. We will not treat any of that as hostility. A regulator exists
          because a platform should not be the final word on its own conduct.
        </p>
      </Clause>
    </LegalShell>
  );
}
