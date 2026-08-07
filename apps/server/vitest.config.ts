import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the parts that run outside the Workers runtime. The Durable Object
    // itself imports `cloudflare:workers`, so it is exercised against a real
    // `wrangler dev` rather than a stub that would prove nothing about
    // hibernation or storage.
    include: ["test/**/*.test.ts"],
  },
});
