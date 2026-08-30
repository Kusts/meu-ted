import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
};

const serwistConfig = {
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: true,
  disable: false,
};

export default withSerwistInit(serwistConfig)(nextConfig);
