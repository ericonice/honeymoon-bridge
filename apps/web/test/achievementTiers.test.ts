// @vitest-environment jsdom
import type { Tier, Unlock } from "@hb/engine";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, test } from "vitest";
import { AchievementToast } from "../src/ui/AchievementToast.js";
import { TIER_INK } from "../src/ui/tiers.js";

afterEach(() => {
  cleanup();
});

function show(unlocked: readonly Unlock[]): void {
  render(createElement(AchievementToast, { onDismiss: () => {}, unlocked }));
}

/** Every distinct colour class on screen that names a tier. */
function metalsOnScreen(): Set<string> {
  const found = new Set<string>();
  for (const element of document.querySelectorAll("[class*='tier-']")) {
    for (const name of element.classList) {
      if (name.includes("tier-")) {
        found.add(name);
      }
    }
  }
  return found;
}

test("each tier is announced in its own metal, so gold does not look like bronze", () => {
  // The bug this exists for: all three tiers were drawn in one amber, on the
  // toast and on the Achievements screen alike, so the rank — which is the whole
  // of what an unlock awards — was the one thing the announcement did not carry.
  const seen = new Map<Tier, Set<string>>();
  for (const tier of ["bronze", "silver", "gold"] as const) {
    cleanup();
    show([{ achievement: "hands-played", tier }]);
    const metals = metalsOnScreen();
    expect(metals.size, `${tier} is not drawn in a tier colour at all`).toBeGreaterThan(0);
    seen.set(tier, metals);
  }

  // Three tiers, three distinct sets. Comparing the sets rather than asserting
  // specific class names keeps this about the distinction rather than about which
  // hex somebody settled on.
  const rendered = [...seen.values()].map((metals) => [...metals].sort().join(" "));
  expect(new Set(rendered).size, `tiers rendered identically: ${rendered.join(" | ")}`).toBe(3);
});

test("the ink for a tier is the one the shared vocabulary names", () => {
  // The toast and the Achievements screen have to agree, and they agree by both
  // reading `tiers.ts` — so this pins the toast to it rather than to a literal.
  show([{ achievement: "slam", tier: "gold" }]);
  expect(metalsOnScreen().has(TIER_INK.gold)).toBe(true);
});

test("more than one unlock from a single deal is one card, not two", () => {
  // A rubber-winning deal can earn a deal award and a rubber award at once, and
  // they came from the same deal — so they are divided rather than duplicated.
  show([
    { achievement: "take-the-rubber", tier: "gold" },
    { achievement: "hands-played", tier: "silver" },
  ]);
  expect(document.querySelectorAll("button").length, "one Done button for both").toBe(1);
  expect(metalsOnScreen().size, "both metals on screen at once").toBeGreaterThan(1);
});

test("nothing unlocked renders nothing at all", () => {
  show([]);
  expect(document.body.textContent).toBe("");
});
