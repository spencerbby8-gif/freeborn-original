/* Freeborn service worker registration.
   Extracted from an inline <script> in the root layout so that no hand-written
   inline script needs to carry a CSP nonce. Next.js propagates the request nonce
   to the inline scripts IT renders; it cannot do that for ours, and adding
   'unsafe-inline' to script-src to accommodate one registration would have
   weakened the policy for the whole site. */
(function () {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  });
})();
