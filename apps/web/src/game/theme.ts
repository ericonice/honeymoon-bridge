import { createContext, useContext } from "react";

/**
 * How the table looks. `hockey` is an arena palette with a face-off card back;
 * `felt` is the green baize the app was built in, kept because a card game on
 * green is what most people expect and the choice costs almost nothing.
 *
 * The colours themselves live in `index.css` — this is only the identity, the
 * remembering, and the one bit of chrome CSS cannot reach.
 */
export type Theme = "felt" | "hockey";

export const DEFAULT_THEME: Theme = "hockey";

const STORAGE_KEY = "hb.theme";

/** Anything unrecognised — an older build's value, a hand-edited key — falls back. */
export function themeFromStored(value: string | null): Theme {
  return value === "felt" || value === "hockey" ? value : DEFAULT_THEME;
}

export function readTheme(): Theme {
  try {
    return themeFromStored(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Safari in private mode throws rather than returning null.
    return DEFAULT_THEME;
  }
}

export function writeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Nothing to do; the choice still holds for this session.
  }
}

/**
 * Put the theme on the document, and tint the browser and status bar to match.
 *
 * The tint is read back out of the stylesheet rather than listed here a second
 * time, so the two cannot drift. It comes back empty before the stylesheet has
 * loaded, which is a reason to leave the markup's value alone rather than to
 * overwrite it with nothing.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset["theme"] = theme;

  const tint = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-table-dark")
    .trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (tint !== "" && meta !== null) {
    meta.setAttribute("content", tint);
  }
}

/**
 * Read by the card back, which is the one piece of the theme that is a
 * different *shape* rather than a different colour and so cannot be a token.
 */
export const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
