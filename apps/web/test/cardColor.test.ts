import { describe, expect, it } from "vitest";
import { cardColorFromStored } from "../src/game/cardColor.js";

describe("cardColorFromStored", () => {
  it("gives a first-time player gold", () => {
    expect(cardColorFromStored(null)).toBe("gold");
  });

  it("keeps a remembered choice of crimson", () => {
    expect(cardColorFromStored("crimson")).toBe("crimson");
  });

  it("keeps a remembered choice of pewter", () => {
    expect(cardColorFromStored("pewter")).toBe("pewter");
  });

  it("falls back when the remembered value names no preset", () => {
    expect(cardColorFromStored("navy")).toBe("gold");
  });
});
