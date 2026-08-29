/**
 * Keeping an installed app on the latest build.
 *
 * This is the whole reason `vite-plugin-pwa` is told not to inject its own
 * registration script. That script registers with the default
 * `updateViaCache: "imports"`, which lets the browser answer an update check
 * for `sw.js` out of its own HTTP cache. A CDN that stamps a browser TTL onto
 * the file — which the ericonice.com zone did, four hours of it — then pins the
 * app to whatever build was current when the phone last looked. Registering by
 * hand is the only way to say `"none"`, and it holds whatever any cache in
 * front of the app decides to do.
 */

import { Capacitor } from "@capacitor/core";

const SCRIPT_URL = "/sw.js";

/**
 * Reload once a new worker takes over.
 *
 * The service worker is built with `skipWaiting` and `clientsClaim`, so a new
 * one activates immediately — but the page in front of you was already rendered
 * from the *old* cache, so without this a deploy needs a second manual refresh
 * to appear. On an installed PWA, which is resumed rather than reloaded, that
 * second refresh may never happen and the app looks frozen at an old build.
 *
 * `controllerchange` also fires the first time a worker ever takes control, and
 * reloading then would be a pointless flash on a first visit — hence the check
 * for whether one was already in charge.
 */
function reloadWhenUpdated(): void {
  const hadController = navigator.serviceWorker.controller !== null;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      return;
    }
    window.location.reload();
  });
}

/**
 * Register the worker, and arrange for a deploy to land without anybody asking.
 *
 * Registration waits for `load` so it competes with nothing on a first visit;
 * the checks after it cost a conditional request and can happen whenever.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  // Inside the Capacitor shell the bundle is baked into the binary rather than
  // fetched from a CDN, so there is no cache-pinning problem for this module to
  // solve — registering here would be inert at best. Updates on iOS come from
  // TestFlight/App Store releases, not from a service worker.
  if (Capacitor.isNativePlatform()) {
    return;
  }

  reloadWhenUpdated();

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(SCRIPT_URL, {
      scope: "/",
      // The point of the whole module. See above.
      updateViaCache: "none",
    });
  });

  // iOS suspends a backgrounded PWA rather than closing it, so returning to the
  // app is the moment worth checking for a new build.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkForUpdate();
    }
  });

  // A phone that was asleep in a pocket comes back to the network before it
  // comes back to the foreground about half the time.
  window.addEventListener("online", () => {
    void checkForUpdate();
  });
}

/**
 * Ask the browser whether a newer build has been deployed.
 *
 * If one has, the new worker installs, claims the page, and
 * `reloadWhenUpdated` reloads it — there is nothing further to do here. Never
 * throws: a phone offline or asleep in a pocket fails this silently rather
 * than surfacing an error nobody asked to see.
 */
async function checkForUpdate(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  } catch {
    // Offline, or the fetch for `sw.js` failed.
  }
}
