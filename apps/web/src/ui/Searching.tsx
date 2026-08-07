import { motion } from "framer-motion";
import { useEffect } from "react";
import { useQueue } from "../game/queue.js";

export interface SearchingProps {
  onCancel(): void;
  onMatched(code: string): void;
}

/**
 * Waiting to be paired with whoever else is looking for a game.
 *
 * Cancelling is just leaving this screen: the queue is held by the socket, so
 * unmounting gives up the place. Nothing has to be told, and nothing can be
 * left behind.
 */
export function Searching({ onCancel, onMatched }: SearchingProps): React.JSX.Element {
  const queue = useQueue(true);

  useEffect(() => {
    if (queue.matched !== null) {
      onMatched(queue.matched);
    }
  }, [onMatched, queue.matched]);

  return (
    <div className="flex flex-1 flex-col justify-between px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Looking for a game</h1>
        <p className="mt-1 text-sm text-white/55">
          {queue.error !== null
            ? queue.error
            : queue.searching
              ? "You will be put together with the next person who wants to play."
              : "Connecting…"}
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-2">
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              className="h-2.5 w-2.5 rounded-full bg-amber-300"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.2,
              }}
            />
          ))}
        </div>
        <p className="text-sm text-white/50">
          {queue.others === 0
            ? "Nobody else is waiting yet"
            : `${queue.others} other${queue.others === 1 ? "" : "s"} waiting`}
        </p>
      </div>

      <button
        type="button"
        className="w-full rounded-xl border border-white/25 px-4 py-4 text-base text-white"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
