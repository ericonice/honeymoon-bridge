export interface SeatLabelProps {
  readonly active: boolean;
  readonly name: string;
  /**
   * What this player is rated, or null until something has said.
   *
   * **Here rather than on the standing strip, and this is the second time it has
   * moved.** It began beside these labels, went to the strip because the labels were
   * only drawn on the play screen — so it was missing through the draw and the auction,
   * which is most of a deal — and has come back now that they are drawn in all three.
   * The strip was the wrong home for a different reason: it is the *score*, and a
   * rating is not part of one. It never moves during a match, and half of it is a
   * pinned anchor that will never move for anybody, so among four figures that do change
   * it was two that never would.
   *
   * A rating belongs to a player, and this is the one thing on the board that *is* a
   * player. Null rather than a guess, for the reason `botAnchor` returns null: nobody
   * checks a figure that looks right.
   */
  readonly rating: number | null;
  /**
   * This player is working out their move right now — the computer, mid-solve.
   *
   * Only ever true while the main thread is blocked, which is what makes the wording
   * worth the room: the pulsing dot below says "their turn", and a turn that lasts a
   * beat and a turn where the app has stopped responding look identical through it.
   */
  readonly thinking?: boolean;
  /**
   * Whether *this* player is vulnerable.
   *
   * It used to be one chip in the top bar reading "You vul" or "Both vul",
   * which made the reader work out who it meant. Vulnerability is a fact about
   * a player, so it belongs on that player — and with two labels on screen,
   * "both" needs no wording at all.
   */
  readonly vulnerable: boolean;
}

/**
 * A player's name, lit when it is their move.
 *
 * The one place the game says whose turn it is. It used to be said three
 * different ways — a pulsing dot in the draw phase, a line of text in the play
 * phase, and the wording of a button in the auction — so there was nowhere
 * reliable to look. Here it is always the same thing in the same place relative
 * to that player's own cards, which makes it something you see rather than
 * something you read.
 *
 * Deliberately quiet. During play the legal cards in your hand are already
 * raised, which is a loud "it is you", and two loud signals for one fact read
 * worse than one.
 */
export function SeatLabel({
  active,
  name,
  rating,
  thinking,
  vulnerable,
}: SeatLabelProps): React.JSX.Element {
  return (
    <p
      className={`relative flex items-center gap-1.5 text-xs transition-colors ${
        active ? "font-medium text-white" : "text-white/35"
      }`}
    >
      <span className="truncate">{name}</span>
      {/* Quieter than the name even on an active label, and quieter still than the
          turn dot. It is the most static thing here — it cannot change until the match
          is over — so it must not compete with the two things that change every few
          seconds. */}
      {rating === null ? null : (
        <span className="shrink-0 tabular-nums text-white/30">{rating}</span>
      )}
      {/* Dimmer than the name whether or not the seat is active. It is a fact about
          the player rather than about the turn, and it does not change during a
          deal — so it must not compete with the thing that does. */}
      {active ? (
        /* **A CSS animation rather than a JavaScript one, and that is the point.** The
           computer solves on the main thread, so nothing driven from JavaScript can
           advance while it is working — the indicator would stop exactly when the wait
           is longest, which is worse than no indicator at all: a frozen pulse reads as
           a hung app. A compositor-driven CSS animation keeps running while the thread
           is busy, so this one is honest about the moment it exists for. */
        <span className="think-pulse inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
      ) : null}
      {/* **Out of the flow, because the bands it sits in are centred.** As an ordinary
          item it widened the line, which re-centred everything already on it — so the
          name and the score visibly jumped sideways the instant the computer started
          thinking, which is a worse distraction than the wait it was explaining. Absolute
          means it can appear and vanish without moving a pixel of anything else.

          It may run past the label on a narrow screen. That is the right way round:
          clipping a transient word costs less than shifting the two labels a player is
          reading, and the pulse beside it says the same thing in no space at all. */}
      {thinking === true ? (
        <span className="pointer-events-none absolute top-0 left-full ml-1.5 whitespace-nowrap text-white/45">
          thinking&hellip;
        </span>
      ) : null}
      {vulnerable ? (
        // Stays at full strength on a dimmed label: whose turn it is changes
        // every few seconds, but vulnerability holds for the rest of the rubber
        // and is worth as much to the player who is waiting.
        <span className="shrink-0 rounded bg-red-500/25 px-1 py-px text-[0.6rem] font-semibold tracking-wide text-red-200 uppercase">
          vul
        </span>
      ) : null}
    </p>
  );
}
