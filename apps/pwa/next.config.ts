import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
};

const serwistConfig = {
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: true,
  disable: false,
};

export default withSerwistInit(serwistConfig)(nextConfig);
