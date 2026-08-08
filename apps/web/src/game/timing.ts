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
export function drawTurnDuration(mine: boolean, holdsReveal: boolean): number {
  if (!mine) {
    return DRAW_TIMING.think * pacing;
  }
  return (
    ((holdsReveal ? DRAW_TIMING.hold : 0) + DRAW_TIMING.flight + DRAW_TIMING.settle) * pacing
  );
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
