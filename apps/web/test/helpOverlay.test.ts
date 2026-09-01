// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { HelpOverlay } from "../src/ui/HelpOverlay.js";

afterEach(cleanup);

/**
 * The bidding tutorial's own entry point — a screen reached from the auction
 * section, on the same footing as Scoring's "What everything is worth".
 */
test("opens the bidding tutorial from the auction section", () => {
  render(createElement(HelpOverlay, { onClose: vi.fn() }));

  fireEvent.click(screen.getByText("The auction"));
  fireEvent.click(screen.getByText("Learning to bid"));

  expect(screen.getByText("Step 1 of 12")).toBeTruthy();
});
