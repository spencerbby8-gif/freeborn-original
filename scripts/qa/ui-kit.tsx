import { createRoot } from "react-dom/client";
/* The stylesheet is supplied by scripts/qa/build.mjs as ./qa.css — the file Next actually
   emitted from src/app/globals.css, so this harness photographs production CSS, not a
   re-implementation of it. */
import { Button } from "@/components/ui/button";
import { PhotoImage } from "@/components/ui/photo-image";

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
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
