import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // Freeborn renders member-uploaded photos, blob:/data: URLs and fixed-size
      // decorative art with plain <img>. next/image optimisation does not apply
      // and would require remotePatterns for user content. The tradeoff is
      // documented here rather than suppressed 20+ times across components.
      "@next/next/no-img-element": "off",
    },
  },
]);
