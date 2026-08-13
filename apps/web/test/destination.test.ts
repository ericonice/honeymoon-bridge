import { describe, expect, it } from "vitest";
import type { Destination } from "../src/game/destination.js";
import { destinationFromWire, destinationToWire } from "../src/game/destination.js";

describe("where somebody was going before they were asked to sign in", () => {
  it("survives the round trip through a link", () => {
    const places: Destination[] = [
      { kind: "home" },
      { kind: "queue" },
      { kind: "robot" },
      { code: "ABCDEF", kind: "table" },
    ];
    for (const place of places) {
      expect(destinationFromWire(destinationToWire(place))).toEqual(
        place.kind === "home" ? null : place,
      );
    }
  });

  it("reads a table code back the way codes are read everywhere else", () => {
    expect(destinationFromWire("table/abcdef")).toEqual({ code: "ABCDEF", kind: "table" });
  });

  it("refuses anything that is not one of the places there are", () => {
    // The server validates this on the way out; this validates it on the way
    // back in, because the value has been outside the app in between and is
    // about to decide where somebody lands with a fresh session in hand.
    for (const raw of [
      "",
      "home",
      "//evil.example",
      "https://evil.example",
      "table/ABCDE",
      "table/TOOLONG",
      "queue/../table/ABCDEF",
      null,
    ]) {
      expect(destinationFromWire(raw)).toBeNull();
    }
  });
});
