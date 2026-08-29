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
  // so the native frame and the launch splash are the same navy the web app
  // already commits to, rather than Capacitor's default template colour.
  plugins: {
    SplashScreen: {
      backgroundColor: "#081827",
      launchAutoHide: true,
    },
  },
  webDir: "dist",
};

export default config;
