import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { applyTheme, readTheme } from "./game/theme.js";
import "./index.css";

/**
 * Make a deploy actually land on a device that already has the app.
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
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const hadController = navigator.serviceWorker.controller !== null;
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) {
      return;
    }
    reloading = true;
    window.location.reload();
  });

  // iOS suspends a backgrounded PWA rather than closing it, so returning to the
  // app is the moment worth checking for a new build.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void navigator.serviceWorker.getRegistration().then((registration) => {
        void registration?.update();
      });
    }
  });
}

reloadWhenUpdated();

// Before the first render rather than in an effect: the theme decides the
// colour of the whole frame, and applying it after paint is a visible flash of
// the wrong one on every launch.
applyTheme(readTheme());

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
