// PWA env types for Cloudflare Workers bindings
// See: wrangler.jsonc vars section for runtime values

declare global {
  interface CloudflareEnv {
    PWA_SW_ENABLED?: string;
  }
}

export {};
