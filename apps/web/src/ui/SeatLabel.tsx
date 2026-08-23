import { motion } from "framer-motion";

export interface SeatLabelProps {
  readonly active: boolean;
  readonly name: string;
  /**
   * What this seat is rated, or null when it is not known.
   *
   * Null is the ordinary case rather than an error: the number comes from the last
   * record fetched, so it is absent until somebody has looked at their record, and
   * absent for a person across a table because their rating is theirs and does not
   * travel with a seat. The label simply says less.
   */
  readonly rating?: number | null;
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
  rating = null,
  vulnerable,
}: SeatLabelProps): React.JSX.Element {
  return (
    <p
      className={`flex items-center gap-1.5 text-xs transition-colors ${
        active ? "font-medium text-white" : "text-white/35"
      }`}
    >
      <span className="truncate">{name}</span>
      {/* Dimmer than the name whether or not the seat is active. It is a fact about
          the player rather than about the turn, and it does not change during a
          deal — so it must not compete with the thing that does. */}
      {rating === null ? null : (
        <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-white/35">
          {rating}
        </span>
      )}
      {active ? (
        <motion.span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />
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
