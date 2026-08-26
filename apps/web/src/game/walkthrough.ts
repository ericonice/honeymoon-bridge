import { readStored, writeStored } from "./storage.js";

const DONE_KEY = "hb.walkthrough";

/**
 * One thing said once, on the turn it is about to matter.
 *
 * `turn` counts this seat's own draw turns from one, so a lesson lands on the board
 * the player is looking at rather than on a slide before they have seen one. The
 * draw phase is twenty-six repetitions of a single decision, and somebody who has
 * not understood it by turn one has twenty-five more turns of not understanding it.
 */
export interface DrawLesson {
  readonly body: string;
  readonly turn: number;
  readonly title: string;
}

/**
 * What a first-time player is told about the *rules* of the draw, after the tour has
 * named the parts of the screen.
 *
 * The auction and the play are ordinary bridge: one pass closing the auction is the
 * only surprise in either, and it is stated on the screen where it happens. The draw
 * is the part that exists nowhere else, so it is the only part with a walkthrough.
 *
 * Two lessons, each landing on a turn where the thing it describes has just happened
 * — which is why they are notes rather than tour steps. "What you threw is gone" means
 * nothing before you have thrown anything, and there is no part of the screen to point
 * at, because the whole point is that there is nowhere to look.
 *
 * Run inside a real deal rather than a scripted one. The mechanic is identical on
 * every deal, so a hand-picked seed would buy nothing — it would only be needed to
 * teach *strategy*, which is a different and far larger job than this.
 */
export function drawLessons(): readonly DrawLesson[] {
  return [
    {
      body:
        "You have now seen both of your cards, and the one you did not take is out of the deal for good. There is no pile to look back through and the app will not remind you: remembering what has gone is part of playing well.",
      title: "What you throw away is gone",
      turn: 2,
    },
    {
      body:
        "26 cards are thrown away over the phase and never played, so a suit can simply be missing from a deal. Both hands stay hidden the whole way through — there is no dummy and no partner, so nothing you hold is ever on show.",
      title: "Half the deck never appears",
      turn: 3,
    },
  ];
}

/** What a step of the tour points at. `DrawPhase` maps each to a place on the board. */
export type TourTarget = "choices" | "opponent" | "piles" | "you";

export interface TourStep {
  readonly body: string;
  readonly target: TourTarget;
  readonly title: string;
}

/**
 * The tour of the draw screen, run once on the player's first turn.
 *
 * This names the furniture; `drawLessons` above teaches the rules. Two different jobs
 * that were one thing at first, badly: the notes alone explained the game to somebody
 * who could not yet name what they were looking at, because roughly half the screen
 * carries no label. The three cards say "Last discard", "Face up" and "Unseen", but
 * the row of face-down cards along the top does not say whose it is, the piles do not
 * say why they matter, and the row of dots above your own name — your thirteen turns —
 * says nothing at all.
 *
 * Four steps, in reading order down the screen, ending on the hand being built. The
 * last step is the one that used to be the first note, and it is better said pointing
 * at the hand and the dots than as a paragraph on its own.
 *
 * **The last step names the dot colours, and nothing here names the opponent's row of
 * dots**, deliberately: the `opponent` spotlight frames their row of card backs only,
 * so their turn track is outside the cutout and describing it would be pointing at
 * something the player cannot see highlighted. What a seat took is public, and §1.4
 * says so on the rules screen, which is the right place for a fact with nothing on
 * this screen to point at.
 */
export function drawTour(): readonly TourStep[] {
  return [
    {
      body:
        "The computer's hand, face down. It grows by one card a turn exactly as yours does, and you never see any of it — there is no dummy in this game and nothing is ever laid out.",
      target: "opponent",
      title: "Their hand",
    },
    {
      body:
        "The deck on the left, counting down two cards every turn. On the right, the cards thrown away: 26 of them by the end, face down and out of the deal for good.",
      target: "piles",
      title: "The deck, and what is out of play",
    },
    {
      body:
        "Each turn you take one of these two. One you can see; the other you cannot see until you have committed to it, so rejecting a card is a real gamble rather than a mistake.",
      target: "choices",
      title: "Your turn is one of these",
    },
    {
      body:
        "Nobody is dealt thirteen cards here. Over 26 turns you build the hand you will bid and play, and the dots are your thirteen turns — each filling in blue if you took the face-up card and purple if you took the unseen one. Then the deck runs out and it is ordinary bridge.",
      target: "you",
      title: "The hand you are building",
    },
  ];
}

/** Whether this device has already been walked through the draw. */
export function walkthroughDone(): boolean {
  return readStored(DONE_KEY) === "done";
}

export function completeWalkthrough(): void {
  writeStored(DONE_KEY, "done");
}

/**
 * Offers it again from the next deal on.
 *
 * Reachable from the rules screen rather than being a one-shot somebody can lose by
 * tapping through it too fast — and worth having for the person who picks this up a
 * year later having forgotten, which on a personal project is usually its author.
 */
export function resetWalkthrough(): void {
  writeStored(DONE_KEY, "");
}
