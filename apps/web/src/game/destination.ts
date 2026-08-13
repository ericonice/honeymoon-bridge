import { readStored, writeStored } from "./storage.js";

const DESTINATION_KEY = "hb.after-signin";

/**
 * Where somebody was going when they were asked to sign in.
 *
 * §3.7 makes an account the price of playing a person, and the round trip that
 * costs is where an invite goes to die: the link comes back as its own URL, the
 * table code that was in the address bar is gone, and the person who was
 * invited lands on a home screen with no idea what happened to the game.
 */
export type Destination =
  | { readonly kind: "home" }
  | { readonly kind: "queue" }
  | { readonly kind: "robot" }
  | { readonly kind: "table"; readonly code: string };

export const HOME: Destination = { kind: "home" };

/** The form that travels in a sign-in link, or null for the home screen. */
export function destinationToWire(destination: Destination): string | null {
  switch (destination.kind) {
    case "home": {
      return null;
    }
    case "queue": {
      return "queue";
    }
    case "robot": {
      return "robot";
    }
    case "table": {
      return `table/${destination.code}`;
    }
  }
}

/**
 * Reads back what the server put in the link.
 *
 * Matched against the shapes that exist rather than parsed, for the same reason
 * the server validates it on the way out: this decides where somebody lands
 * immediately after authenticating, and a value from outside that decides that
 * is an open redirect however small the vocabulary looks.
 */
export function destinationFromWire(raw: string | null): Destination | null {
  if (raw === null || raw === "") {
    return null;
  }
  if (raw === "queue") {
    return { kind: "queue" };
  }
  if (raw === "robot") {
    return { kind: "robot" };
  }
  // Shape only. Whether those six characters name a table anybody can sit at
  // is the server's question, and it is asked when the socket opens.
  const table = /^table\/([A-Za-z0-9]{6})$/.exec(raw);
  return table === null ? null : { code: table[1]!.toUpperCase(), kind: "table" };
}

/**
 * Keeps the destination on this device as well as in the link.
 *
 * Two mechanisms for one job, because each covers what the other cannot. The
 * link works when the mail is opened somewhere else entirely — asked for on a
 * laptop, opened on a phone — which is the case `localStorage` can say nothing
 * about. This one works when the link has been through something that strips
 * the fragment on the way, and it is also what a person gets back if they
 * return to the tab they started in rather than the one the mail opened.
 */
export function rememberDestination(destination: Destination): void {
  writeStored(DESTINATION_KEY, destinationToWire(destination) ?? "");
}

/** Reads the stored destination and forgets it, so it cannot fire twice. */
export function takeDestination(): Destination | null {
  const stored = readStored(DESTINATION_KEY);
  writeStored(DESTINATION_KEY, "");
  return destinationFromWire(stored);
}
