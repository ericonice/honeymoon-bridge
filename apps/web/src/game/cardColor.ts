/**
 * Card-back color within the hockey theme, curated rather than free.
 *
 * Each option exists for the same reason gold replaced navy: a card back this
 * close in hue and lightness to the table it sits on has nothing for the eye
 * to separate it by. A free color picker could land back on that problem;
 * these three are all pre-checked against the rink's blue. Felt's blue-on-
 * green never had that problem, so there is nothing to offer it here yet.
 */
export type CardColor = "crimson" | "gold" | "pewter";

export const DEFAULT_CARD_COLOR: CardColor = "gold";

const STORAGE_KEY = "hb.cardColor";

/** Anything unrecognized — an older build's value, a hand-edited key — falls back. */
export function cardColorFromStored(value: string | null): CardColor {
  return value === "crimson" || value === "gold" || value === "pewter"
    ? value
    : DEFAULT_CARD_COLOR;
}

export function readCardColor(): CardColor {
  try {
    return cardColorFromStored(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Safari in private mode throws rather than returning null.
    return DEFAULT_CARD_COLOR;
  }
}

export function writeCardColor(color: CardColor): void {
  try {
    localStorage.setItem(STORAGE_KEY, color);
  } catch {
    // Nothing to do; the choice still holds for this session.
  }
}

/**
 * Put the color on the document, the same way `applyTheme` puts the theme
 * there. Harmless under the felt theme too: nothing in `index.css` selects
 * `[data-card-color]` without `[data-theme="hockey"]` alongside it.
 */
export function applyCardColor(color: CardColor): void {
  document.documentElement.dataset["cardColor"] = color;
}
