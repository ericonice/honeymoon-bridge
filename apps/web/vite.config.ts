import { execSync } from "node:child_process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The commit this was built from, with a `+` when the tree had uncommitted
 * changes. Shown in the app so a deployed build can be told apart from a stale
 * cached one — a question that is otherwise unanswerable from a phone.
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
    __BUILD_ID__: JSON.stringify(buildId()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Honeymoon Bridge",
        short_name: "Honeymoon",
        description: "A two-player contract bridge variant.",
        // Standalone so the phone drops Safari's chrome; portrait because the
        // layout assumes a hand held one-handed.
        display: "standalone",
        orientation: "portrait",
        background_color: "#064e3b",
        theme_color: "#064e3b",
        start_url: "/",
        // Not declared maskable: the crest runs close to the edge, and a
        // maskable icon is cropped to a centre circle that would take the
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
