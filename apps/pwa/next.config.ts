import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { CANONICAL_REDIRECTS } from "./src/lib/routes";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@pi-finance/llm-contracts"],
  // Item 13: absorbed page routes keep working as temporary redirects to
  // the canonical IA (tabs under /compromissos and /hub/*). Incoming query
  // (?accountId=, ?cardId=) is preserved by Next.js. permanent:false so a
  // future IA pass can change targets without poisoned caches.
  async redirects() {
    return CANONICAL_REDIRECTS.map((redirect) => ({ ...redirect, permanent: false }));
  },
};

const serwistConfig = {
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: true,
  disable: false,
};

export default withSerwistInit(serwistConfig)(nextConfig);
