import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The bundle is baked into the binary rather than loaded from the live
 * Cloudflare origin — see `CLAUDE.md`'s "Considering an iOS app": a live origin
 * makes offline play depend entirely on the service worker and reads, to
 * App Review, as exactly "a website in a wrapper". `webDir` pointing at `dist`
 * is what makes the offline claim true by construction.
 */
const config: CapacitorConfig = {
  appId: "com.ericonice.honeymoonbridge",
  appName: "Honeymoon Bridge",
  // Matches the manifest's own `theme_color`/`background_color` (vite.config.ts)
  // and `--color-table` (index.css) — the frame's own colour, not the darker
  // `--color-table-dark` a desktop letterbox needs. The splash view sits behind
  // the WebView natively, so if the WebView's own bounds ever fall a sliver
  // short of the true screen edge — reported from a real device as a band of a
  // visibly different blue at the bottom, present immediately and on every
  // screen, so outside any single web screen's own CSS entirely — this is what
  // shows through the gap. Matching it does not fix the WebView's own bounds,
  // but it makes a gap in them invisible regardless, the same trade the web
  // app's own background made for the same kind of shortfall.
  plugins: {
    SplashScreen: {
      backgroundColor: "#14324f",
      launchAutoHide: true,
    },
  },
  webDir: "dist",
};

export default config;
