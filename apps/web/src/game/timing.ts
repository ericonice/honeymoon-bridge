import { discardsCardTwo } from "@hb/engine";
import type { DrawReveal } from "@hb/engine";

/**
 * Draw-phase pacing, in milliseconds.
 *
 * These live together because they are one budget, not four settings: the
 * opponent must not take its turn until the previous turn has finished playing
 * out, so the pause between turns is derived from the animation rather than
 * guessed alongside it.
 *
 * This is the first knob to reach for if the 26-turn draw phase drags.
 */
export const DRAW_TIMING = {
  /** A card's travel time from the stock to the choice pair. */
  flight: 420,
  /** How long your own card 2 is held face up, to be read, before it leaves. */
  hold: 900,
  /**
   * Card 1's own trip from the choice pair to the hand or the discard, once
   * the decision is made.
   *
   * Slower than `flight` on purpose. Card 2's own two legs share the timing
   * of a hold either side of them, which is what carries the sense of
   * something happening — card 1 has no hold to lean on, so at `flight`'s
   * own speed it had nothing to slow it down and read as a flick rather
   * than a card actually leaving.
   */
  discard: 700,
  /** Breathing room once the cards have landed. */
  settle: 180,
  /**
   * How long the opponent's turn takes to register.
   *
   * Their cards used to fly too, with a beat first so card 1 could be told from
   * card 2. It read as ceremony rather than information: the line of text says
   * what they did in words, their hand grows by one either way, and the two
   * face-down cards moving added nothing but about a second — thirteen times a
   * deal, on the phase whose whole open question is whether it drags.
   *
   * With their cards showing it is information again, and their turn costs what
   * yours does instead. See `drawPlayout`.
   */
  think: 600,
};

/**
 * Everything above, scaled.
 *
 * A single multiplier rather than a knob per duration, because these are one
 * budget and not four settings — the pause between turns is derived from the
 * animation, so moving them independently would let the opponent act before the
 * previous turn had finished playing out. Testing only, and set from Settings
 * while it is being decided what the right pace is.
 */
let pacing = 1;

export function setPacing(multiplier: number): void {
  pacing = multiplier;
}

/**
 * The multiplier itself, for anything that builds a flight's own `hold` or
 * `travel` directly from `DRAW_TIMING` rather than going through
 * `drawTurnDuration`.
 *
 * Those two have to agree: a flight's React-level cleanup already scales by
 * `pacing` here, and if the animation it is timing does not scale the same
 * way, "fast" — the shipped default — cleans a flight up mid-hold, before
 * the leg that carries it away from where it was just read has even started.
 * Read on every flight actually built, not cached, for the same reason
 * `pacing` itself is a setting rather than a constant: it can change between
 * one turn and the next.
 */
export function currentPacing(): number {
  return pacing;
}

/**
 * Any other module's own millisecond constant, scaled by the current pacing.
 *
 * `drawTurnDuration` and `drawPauseBefore` already fold `pacing` in themselves
 * — they are read fresh on every turn for the same reason `pacing` is a
 * setting rather than a constant, so there is nothing left for a caller to
 * scale a second time. This is for the timings that live outside this module
 * — trick collection, the bot's thinking pauses — so the one setting still
 * reaches every clock in the game rather than stopping at the draw phase.
 */
export function paced(ms: number): number {
  return ms * pacing;
}

/**
 * How long a resolved draw turn takes to play out end to end.
 *
 * A reveal spends `flight` twice, not once: card 2 travels from the choice
 * pair to where it turns face up, sits through `hold`, and only then travels
 * on to the discard — two legs either side of the hold, exactly as
 * `CardFlight` itself now spends it. Without a reveal, neither card has a
 * hold to lean on, so both travel at `discard`'s slower, unaided speed
 * instead. Either way, short a card's own real travel time here would clear
 * the flight away before it had finished — the very bug scaling `hold` and
 * `travel` by pacing was fixing, reopened from the other side whenever a
 * flight's own duration changes without this changing to match.
 */
export function drawTurnDuration(animated: boolean, holdsReveal: boolean): number {
  if (!animated) {
    return DRAW_TIMING.think * pacing;
  }
  if (holdsReveal) {
    return (DRAW_TIMING.hold + DRAW_TIMING.flight * 2 + DRAW_TIMING.settle) * pacing;
  }
  return (DRAW_TIMING.discard + DRAW_TIMING.settle) * pacing;
}

/** How a resolved draw turn plays out on screen. */
export interface DrawPlayout {
  /** Whether the two cards travel, or the turn is only a pause. */
  readonly animated: boolean;
  /** Milliseconds it occupies, start to finish. */
  readonly duration: number;
  /** Whether card 2 is turned face up and held long enough to read. */
  readonly holdsReveal: boolean;
}

/**
 * How a turn plays out, decided in one place because three callers have to
 * agree on it: the screen choreographs it, the board holds the phase open for
 * it, and the session waits it out before the computer moves again.
 *
 * Your own turn always travels — it is the only thing that shows you card 2.
 * Theirs normally does not, because two face-down cards moving say nothing the
 * line of text below them does not already say. With their cards showing that
 * stops being true, so their turn plays exactly as yours does.
 */
/**
 * How long the board is left alone before the computer takes its draw turn.
 *
 * The turn before it has to finish playing out first, or the computer moves
 * over the top of an animation still being watched.
 *
 * With its cards showing there is a second beat on top of that, because its
 * card 1 is turned face up when the board settles — exactly as yours is — and a
 * card that turns over and leaves in the same instant was never shown at all.
 * Being able to watch it decide is the whole reason its pair is on the table.
 */
export function drawPauseBefore(previous: DrawReveal | null, theirCardsShowing: boolean): number {
  // With no previous turn to play out, this is the computer opening the deal —
  // still give the board a beat before anything moves on its own.
  const playedOut =
    previous === null
      ? drawTurnDuration(true, false)
      : drawPlayout(previous, theirCardsShowing).duration;
  return theirCardsShowing ? playedOut + DRAW_TIMING.think * pacing : playedOut;
}

export function drawPlayout(reveal: DrawReveal, theirCardsShowing: boolean): DrawPlayout {
  // `discarded` is filled in only for the seat's own turn, so it needs no second
  // opinion about whose turn this was.
  const mine = reveal.discarded.length > 0;
  // The opponent's turn is a pause rather than a flight unless their cards are
  // showing: two face-down cards moving say nothing, and neither of them is a card
  // this seat may see. What their turn says is said by the commentary line instead.
  const animated = mine || theirCardsShowing;
  // Whether a card 2 is turned over and held to be read. Which turns throw card 2
  // away is a rule and `discardsCardTwo` is where it lives, but the hold also needs
  // this screen to be *allowed* to show the card — so a turn of theirs qualifies
  // only with their cards showing.
  const holdsReveal = (mine || theirCardsShowing) && discardsCardTwo(reveal.choice);
  return { animated, duration: drawTurnDuration(animated, holdsReveal), holdsReveal };
}

/**
 * How a finished trick is cleared away.
 *
 * The engine resolves a trick the instant the second card lands and hands the
 * lead to the winner, so without `GameSession.trickAwaitingDismissal` nothing
 * would stop the next card from landing on top of it before it had even been
 * read. That gate is what makes `hold` safe to be a plain wait again rather
 * than a tap requirement: a tap still skips it early for anyone who would
 * rather move on, but nobody has to make one just to keep the deal going —
 * making that mandatory turned out to be worse than the problem it fixed,
 * thirteen tricks' worth of required taps a deal.
 */
export const TRICK_TIMING = {
  /** How long a resolved trick sits before it sweeps itself away. */
  hold: 1400,
  /**
   * How long a played card takes to travel from a hand to its slot on the
   * table. A first guess, like the draw's own `flight` — the existing 700ms
   * pause before the opponent's reply (`PAUSE_MS.play` in `localSession.ts`)
   * comfortably covers it, so nothing else needed to change to make room for it.
   * Slower than that flight on purpose: this one now has real distance to
   * cover from the opponent's hand, and started out reading as a flick rather
   * than a card leaving somewhere.
   */
  play: 450,
  /** The sweep toward whoever won it, once dismissed. */
  sweep: 400,
};

/**
 * How long a resolved trick occupies the table, from the card that completed it
 * arriving to the sweep finishing.
 *
 * The three legs `PlayPhase` actually spends on one: the completing card's own
 * flight, the hold that lets it be read, and the sweep toward whoever won it.
 * It lives here with them rather than beside the caller for the reason the rest
 * of this module gives — they are one budget, and a clock derived from them
 * somewhere else would go out of step the moment any of the three moved.
 *
 * Read fresh, since `pacing` can change between one trick and the next.
 */
export function trickStageTime(): number {
  return paced(TRICK_TIMING.play + TRICK_TIMING.hold + TRICK_TIMING.sweep);
}
