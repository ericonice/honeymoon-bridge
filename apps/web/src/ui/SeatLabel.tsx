import { motion } from "framer-motion";

export interface SeatLabelProps {
  readonly active: boolean;
  readonly name: string;
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
export function SeatLabel({ active, name }: SeatLabelProps): React.JSX.Element {
  return (
    <p
      className={`flex items-center gap-1.5 text-xs transition-colors ${
        active ? "font-medium text-white" : "text-white/35"
      }`}
    >
      <span className="truncate">{name}</span>
      {active ? (
        <motion.span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
    </p>
  );
}
