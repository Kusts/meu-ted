import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^cloudflare:workers$/, replacement: fileURLToPath(new URL("./tests/mocks/cloudflare-workers.ts", import.meta.url)) },
      { find: /^cloudflare:email$/, replacement: fileURLToPath(new URL("./tests/mocks/cloudflare-email.ts", import.meta.url)) },
      { find: /^cloudflare:.+$/, replacement: fileURLToPath(new URL("./tests/mocks/cloudflare-workers.ts", import.meta.url)) },
    ],
  },
  ssr: {
    noExternal: [true, /.*/],
  },
  test: {
    environment: "node",
    server: {
      deps: {
        inline: true,
      },
    },
  },
});
