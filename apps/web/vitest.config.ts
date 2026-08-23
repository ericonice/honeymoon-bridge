import { defineConfig } from "vitest/config";

export default defineConfig({
  // The three build stamps `vite.config.ts` substitutes. They are `define`
  // replacements rather than real globals, so any component that prints one — the
  // settings screen does — throws a bare ReferenceError under the test runner
  // without them. Fixed values, since nothing asserts on their contents.
  define: {
    __APP_VERSION__: JSON.stringify("test"),
    __BUILD_ID__: JSON.stringify("test"),
    __BUILD_TIME__: JSON.stringify("1970-01-01 00:00"),
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
