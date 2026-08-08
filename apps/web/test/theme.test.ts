import { describe, expect, it } from "vitest";
import { themeFromStored } from "../src/game/theme.js";

describe("themeFromStored", () => {
  it("gives a first-time player the hockey theme", () => {
    expect(themeFromStored(null)).toBe("hockey");
  });

  it("keeps a remembered choice of the green baize", () => {
    expect(themeFromStored("felt")).toBe("felt");
  });

  it("falls back when the remembered value names no theme", () => {
    expect(themeFromStored("baize")).toBe("hockey");
  });
});
