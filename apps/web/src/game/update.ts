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

const SCRIPT_URL = "/sw.js";

/**
 * Guards against reloading twice — `reinstall` and the controller change can
 * otherwise both fire, and the second lands mid-navigation.
 */
let reloading = false;

function reload(): void {
  if (reloading) {
    return;
  }
  reloading = true;
  window.location.reload();
}

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
    reload();
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
 * `failed` is worth keeping distinct from `current`. The check goes to the
 * network, so a phone in a lift fails it — and answering "you have the latest
 * build" to a question that was never asked is the exact confusion this module
 * exists to end.
 */
export type UpdateCheck = "current" | "failed" | "updating";

/**
 * Ask whether a newer build has been deployed.
 *
 * `updating` means one is on its way and nothing further is needed: the new
 * worker installs, claims the page, and `reloadWhenUpdated` reloads it.
 *
 * Never rejects — callers are a button and two event listeners, and none of
 * them has anywhere to put an exception.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!("serviceWorker" in navigator)) {
    return "failed";
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration === undefined) {
      return "failed";
    }

    await registration.update();

    // `waiting` is all but unreachable with `skipWaiting` — a new worker goes
    // straight to activating — but it costs nothing to answer for a build that
    // has arrived and stalled, and the alternative is reporting "up to date" to
    // somebody looking at the old one.
    return registration.installing !== null || registration.waiting !== null
      ? "updating"
      : "current";
  } catch {
    // Offline, or the fetch for `sw.js` failed. Either way there is no answer.
    return "failed";
  }
}

/**
 * Throw away the installed app and fetch it again.
 *
 * The escape hatch, not the routine path — it drops the precache, so the next
 * load pays for the whole app over whatever connection the phone has. It earns
 * its place because an installed PWA on iOS can get wedged in ways an update
 * check does not fix, and reinstalling from the home screen is the alternative.
 *
 * With no worker left to serve the shell, the reload goes to the network, where
 * `_headers` has already promised the shell is never cached.
 */
export async function reinstall(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  reload();
}
