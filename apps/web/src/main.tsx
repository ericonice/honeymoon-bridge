import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { applyCardColor, readCardColor } from "./game/cardColor.js";
import { applyTheme, readTheme } from "./game/theme.js";
import { registerServiceWorker } from "./game/update.js";
import { ErrorBoundary } from "./ui/ErrorBoundary.js";
import "./index.css";

registerServiceWorker();

// Before the first render rather than in an effect: the theme decides the
// color of the whole frame, and applying it after paint is a visible flash of
// the wrong one on every launch.
applyTheme(readTheme());
applyCardColor(readCardColor());

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
