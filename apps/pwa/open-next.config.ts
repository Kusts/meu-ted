import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Use in-memory cache by default. Swap to R2 after creating the bucket:
// import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  // To enable R2-backed ISR caching:
  // incrementalCache: r2IncrementalCache,
});
