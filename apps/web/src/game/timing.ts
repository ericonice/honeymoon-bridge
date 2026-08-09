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
  /** A card's travel time from the stock to a hand or to the discard. */
  flight: 420,
  /** How long your own card 2 is held face up, to be read, before it leaves. */
  hold: 900,
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

/** How long a resolved draw turn takes to play out end to end. */
export function drawTurnDuration(animated: boolean, holdsReveal: boolean): number {
  if (!animated) {
    return DRAW_TIMING.think * pacing;
  }
  return (
    ((holdsReveal ? DRAW_TIMING.hold : 0) + DRAW_TIMING.flight + DRAW_TIMING.settle) * pacing
  );
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
  // `taken` is filled in only for the seat's own turn, so it needs no second
  // opinion about whose turn this was.
  const animated = reveal.taken !== null || theirCardsShowing;
  const holdsReveal = animated && reveal.choice === "kept-first";
  return { animated, duration: drawTurnDuration(animated, holdsReveal), holdsReveal };
}

/**
 * How a finished trick is cleared away.
 *
 * The engine resolves a trick the instant the second card lands and hands the
 * lead to the winner, so without this the trick you just lost would be replaced
 * by the next card before you had read it.
 */
export const TRICK_TIMING = {
  /** How long the finished trick sits face up before it is collected. */
  hold: 900,
  /** Breathing room once it has gone. */
  settle: 150,
  /** The sweep toward whoever won it. */
  sweep: 400,
};

export function trickCollectDuration(): number {
  return TRICK_TIMING.hold + TRICK_TIMING.sweep + TRICK_TIMING.settle;
}
