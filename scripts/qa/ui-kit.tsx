import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
/* The stylesheet is supplied by scripts/qa/build.mjs as ./qa.css — the file Next actually
   emitted from src/app/globals.css, so this harness photographs production CSS, not a
   re-implementation of it. */
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Chip } from "@/components/ui/chip";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { PhotoImage } from "@/components/ui/photo-image";
import { EndConversationDialog } from "@/components/app/unmatch-dialog";
import { ReadOnlyThreadNotice } from "@/components/app/read-only-thread-notice";

/**
 * Visual QA mount for the design layer — NOT a product route and not shipped.
 *
 * Built by scripts/qa/build.mjs into public/qa/ (gitignored) and opened from file:// by
 * scripts/qa/visual-check.mjs, so it renders the REAL Button and PhotoImage against the REAL
 * globals.css without adding a page to the app or needing a signed-in member session.
 * A data: URL exercises the loaded state; a missing sibling file exercises the retry path and
 * the definitive failure state; a third instance with maxRetries large enough stays on the
 * skeleton long enough to be photographed.
 */
const ok =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='800'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f97316'/><stop offset='1' stop-color='#7c2d12'/></linearGradient></defs><rect width='640' height='800' fill='url(#g)'/><circle cx='320' cy='300' r='120' fill='rgba(255,255,255,0.16)'/></svg>`
  );

function App() {
  const [kind, setKind] = useState<null | "unmatch" | "delete">(null);
  /* A real toggle, not a screenshot prop: design-check clicks this and compares the computed
     background, which proves the stylesheet reacts to `aria-pressed` rather than a class the
     component could set independently of the announced state. */
  const [pressed, setPressed] = useState(false);
  const [busy, setBusy] = useState(false);
  /* Every open() bumps this and it becomes the dialog's React `key`, so each QA pass mounts a
     genuinely fresh sheet — which is what the product does too (profile-view renders the dialog
     conditionally, so closing unmounts it). Without the key, a second open() reuses the mounted
     component and its internal reason selection survives: the first run of this script then
     toggled the chip OFF instead of on and photographed the wrong state. */
  const [epoch, setEpoch] = useState(0);
  /* What the product's handlers would have received. The QA page owns the callbacks so the
     browser script can assert the PAYLOAD (which reason reached onConfirm), not only that a
     button was clickable — the client defect this dialog exists to fix was exactly a payload
     that never arrived. */
  const rec = useRef<{ confirms: (string | null)[]; cancels: number; reports: number }>({
    confirms: [],
    cancels: 0,
    reports: 0,
  });
  useEffect(() => {
    (window as unknown as { __qaEnd: unknown }).__qaEnd = {
      open: (k: "unmatch" | "delete", b = false) => {
        rec.current = { confirms: [], cancels: 0, reports: 0 };
        setBusy(b);
        setKind(k);
        setEpoch((e) => e + 1);
      },
      result: () => rec.current,
    };
  }, []);
  return (
    <main className="min-h-screen bg-ink px-6 py-8 text-pearl" style={{ fontFamily: "var(--font-body)" }}>
      <p className="text-ui-xs uppercase tracking-[0.2em] text-mist">Freeborn design layer</p>
      <h1 className="mt-1 font-display text-ui-xl">Button + media states</h1>

      <section className="mt-8 space-y-4">
        <h2 className="text-ui-sm text-mist">Variants at md</h2>
        <div className="flex flex-wrap gap-3">
          <Button>Continue</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="danger">Unmatch</Button>
        </div>
        <h2 className="pt-4 text-ui-sm text-mist">Sizes</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
        <h2 className="pt-4 text-ui-sm text-mist">States</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button trailing={<span>→</span>}>With affordance</Button>
        </div>
        <Button block className="mt-2">
          Block-level primary
        </Button>
      </section>

      <section id="legacy-families" className="mt-10">
        <h2 className="font-display text-lg">Legacy families after unification</h2>
        <p className="mt-1 max-w-prose text-ui-xs text-mist">
          {"The three button vocabularies the app still ships, rendered against the emitted stylesheet. The point of the change is that focus, disabled, touch height and motion now come from one place, so these must measure like `.fb-cta` without any of them being rewritten."}
        </p>
        <div id="legacy-enabled" className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="fb-btn fb-btn-primary">.fb-btn-primary</button>
          <button type="button" className="fb-btn fb-btn-sm">.fb-btn-sm</button>
          <button type="button" className="btn-ember btn-shine relative overflow-hidden rounded-full px-7 py-3 text-sm font-bold">.btn-ember</button>
          <button type="button" className="btn-ghost rounded-full px-7 py-3 text-sm font-bold">.btn-ghost</button>
          <button type="button" className="magic-button btn-shine relative flex h-[60px] items-center justify-center overflow-hidden rounded-2xl px-5 text-[16px] font-bold">.magic-button</button>
        </div>
        <div id="legacy-disabled" className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="fb-btn fb-btn-primary" disabled>.fb-btn-primary</button>
          <button type="button" className="btn-ember btn-shine relative overflow-hidden rounded-full px-7 py-3 text-sm font-bold" disabled>.btn-ember</button>
          <button type="button" className="btn-ghost rounded-full px-7 py-3 text-sm font-bold" disabled>.btn-ghost</button>
        </div>
      </section>

      <section id="primitives" className="mt-10 space-y-4">
        <h2 className="font-display text-lg">Primitives — IconButton, Chip, and the three empty states</h2>
        <div className="flex flex-wrap items-center gap-3">
          <IconButton id="qa-icon-md" aria-label="Close this sheet">
            <span>{"\u2715"}</span>
          </IconButton>
          <IconButton id="qa-icon-xs" aria-label="Remove photo" size="xs">
            <span>{"\u2715"}</span>
          </IconButton>
          <IconButton aria-label="Report this member" tone="danger">
            <span>{"\u2691"}</span>
          </IconButton>
          <button type="button" className="fb-icon-btn" disabled aria-label="Disabled icon control">
            <span>{"\u2715"}</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip id="qa-chip-toggle" aria-pressed={pressed} onClick={() => setPressed((v) => !v)}>
            Unvaccinated
          </Chip>
          <Chip aria-pressed={false}>Vax-free spaces</Chip>
          <Chip aria-pressed={true} size="sm">
            Homestead
          </Chip>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <LoadingState label="Loading your matches" />
          <EmptyState
            title="No one nearby yet"
            body="Widening your distance is the only filter that finds more people here."
            action={{ label: "Widen filters", onClick: () => {} }}
          />
          <ErrorState
            title="Could not reach Freeborn"
            body="Your profile is unchanged. This is a network problem, not your account."
            onRetry={() => {}}
          />
        </div>
      </section>

      <section className="mt-10 grid grid-cols-3 gap-4">
        <figure>
          <div className="aspect-[3/3.2] overflow-hidden rounded-card">
            <PhotoImage src={ok} alt="Loaded state" className="h-full w-full" />
          </div>
          <figcaption className="mt-2 text-ui-xs text-mist">loaded (faded in)</figcaption>
        </figure>
        <figure>
          <div className="aspect-[3/3.2] overflow-hidden rounded-card">
            <PhotoImage src="./__still-loading__.jpg" alt="Loading state" maxRetries={40} className="h-full w-full" />
          </div>
          <figcaption className="mt-2 text-ui-xs text-mist">loading / retrying (skeleton)</figcaption>
        </figure>
        <figure>
          <div className="aspect-[3/3.2] overflow-hidden rounded-card">
            <PhotoImage src="./__missing__.jpg" alt="Ada" maxRetries={0} className="h-full w-full" />
          </div>
          <figcaption className="mt-2 text-ui-xs text-mist">failed (actionable)</figcaption>
        </figure>
      </section>

      <section className="mt-10 max-w-md rounded-card border border-white/10 bg-white/5 p-5">
        <p className="font-display text-ui-lg">Rowan, 31</p>
        <p className="mt-1 text-ui-sm text-mist">
          Runs a small homestead outside Abuja. Vaccination info is optional here and never inferred.
        </p>
        <p className="mt-3 text-ui-xs text-mist/70">4 km away · joined this week</p>
        <Button block className="mt-4" variant="secondary">
          View profile
        </Button>
        <div className="mt-5 flex items-center gap-3">
          <span className="h-11 w-11 shrink-0">
            <PhotoImage src="./__missing__.jpg" alt="Ada" maxRetries={0} compact className="h-full w-full rounded-full" />
          </span>
          <p className="text-ui-xs text-mist">compact failure in a 44px avatar — glyph only, label kept for screen readers</p>
        </div>
      </section>
      <section id="read-only-thread" className="mt-10">
        <h2 className="font-display text-lg">ReadOnlyThreadNotice — the state a severed thread renders in</h2>
        {/* Wrapped exactly as chat-view wraps it (`mx-auto max-w-[680px]`, line 1633), because the
            bubble has no intrinsic width on purpose — the chat column owns that. Mounting it
            unconstrained here would measure the harness, not the product. */}
        <div className="mx-auto max-w-[680px]">
          <ReadOnlyThreadNotice />
          <ReadOnlyThreadNotice notice="This conversation has ended, so its history is kept for the member who did not end it." />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg">EndConversationDialog — mounted for real</h2>
        <p className="mt-1 text-ui-xs text-mist">
          The product component, its own Escape/focus/reason state, against the stylesheet Next
          emitted. No API is called; the callbacks below only record what a handler received.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button id="qa-open-unmatch" variant="secondary" size="sm" onClick={() => (window as never as { __qaEnd: { open: (k: string, b?: boolean) => void } }).__qaEnd.open("unmatch")}>
            Open unmatch sheet
          </Button>
          <Button id="qa-open-busy" variant="secondary" size="sm" onClick={() => (window as never as { __qaEnd: { open: (k: string, b?: boolean) => void } }).__qaEnd.open("unmatch", true)}>
            Open busy
          </Button>
          <Button id="qa-open-delete" variant="secondary" size="sm" onClick={() => (window as never as { __qaEnd: { open: (k: string, b?: boolean) => void } }).__qaEnd.open("delete")}>
            Open delete-conversation sheet
          </Button>
        </div>
      </section>

      {kind ? (
        <EndConversationDialog
          key={epoch}
          kind={kind}
          name="Ada"
          busy={busy}
          onCancel={() => {
            rec.current.cancels += 1;
            setKind(null);
            setBusy(false);
          }}
          onConfirm={(reason) => {
            /* Mirrors profile-view.runUnmatch exactly: `if (actionBusy) return` and then
               `setActionBusy("unmatch")`, with the sheet left open until the request resolves.
               Without the same shape here, a double-click test would measure a harness that is
               more forgiving than the product and pass for the wrong reason. */
            if (busy) return;
            rec.current.confirms.push(reason ?? null);
            setBusy(true);
          }}
          onReport={() => {
            rec.current.reports += 1;
          }}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
