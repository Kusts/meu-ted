import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare / test artifacts:
    ".open-next/**",
    "coverage/**",
    ".stryker-tmp/**",
    // Wrangler dev artifacts:
    ".wrangler/**",
    // Generated SW (built from src/sw.ts via @serwist/next) and minified shell:
    "public/sw.js",
    "public/offline-shell.js",
  ]),
]);

export default eslintConfig;
