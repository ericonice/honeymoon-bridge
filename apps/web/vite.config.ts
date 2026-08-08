import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The version of the whole product, read from the workspace root rather than
 * from this app's own `package.json`.
 *
 * The engine, the protocol, the server and the app ship together and are only
 * ever meaningful together — a rules change is as much a new version as a
 * screen is. One number for the repo says that; four numbers to bump in
 * lockstep would only be four chances to forget one.
 *
 * Relative to this file rather than to the working directory, so it survives
 * being built from the repo root or from the workspace.
 */
function appVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { readonly version: string };
  return manifest.version;
}

/**
 * The commit this was built from, with a `+` when the tree had uncommitted
 * changes. Shown in the app so a deployed build can be told apart from a stale
 * cached one — a question that is otherwise unanswerable from a phone.
 *
 * This answers a different question from the version above: the version is what
 * was *intended*, the commit is what is actually running. Two people on "0.1.0"
 * can still be a deploy apart.
 */
function buildId(): string {
  try {
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
    return dirty ? `${commit}+` : commit;
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __BUILD_ID__: JSON.stringify(buildId()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      // The generated `registerSW.js` registers with the default
      // `updateViaCache: "imports"`, which lets a browser answer an update
      // check for `sw.js` out of its own HTTP cache — and a CDN browser TTL on
      // that file then pins an installed app to an old build. `game/update.ts`
      // registers by hand to say `"none"` instead.
      injectRegister: null,
      manifest: {
        name: "Honeymoon Bridge",
        short_name: "Honeymoon",
        description: "A two-player contract bridge variant.",
        // Standalone so the phone drops Safari's chrome; portrait because the
        // layout assumes a hand held one-handed.
        display: "standalone",
        orientation: "portrait",
        // The default theme's colors. The manifest is read at install time, so
        // unlike the meta tag these cannot follow a change made in Settings —
        // they only decide the splash screen.
        background_color: "#081827",
        theme_color: "#081827",
        start_url: "/",
        // Not declared maskable: the crest runs close to the edge, and a
        // maskable icon is cropped to a center circle that would take the
        // blades off. Better to let the platform letterbox the square.
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  server: {
    // `npm run dev:lan` plus this makes the dev server reachable from the phone
    // on the same network, which is the only way to judge the layout.
    port: 5173,
  },
});
