import type { MatchFormat } from "@hb/engine";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { queueFormat as storedQueueFormat, setQueueFormat } from "../game/identity.js";
import { formatName } from "../game/labels.js";
import { useQueue } from "../game/queue.js";

export interface SearchingProps {
  onCancel(): void;
  onMatched(code: string): void;
}

const CELLS: readonly MatchFormat[] = ["rubber", "mirror", "duplicate"];

/**
 * How long a narrowed search goes without a match before it is offered a
 * wider one. Not a fallback — nothing here changes what is being searched
 * for without a tap, only whether the option to widen it is on screen.
 */
const WIDEN_AFTER_MS = 20_000;

/**
 * Waiting to be paired with whoever else is looking for a game.
 *
 * Cancelling is just leaving this screen: the queue is held by the socket, so
 * unmounting gives up the place. Nothing has to be told, and nothing can be
 * left behind.
 *
 * **What to wait for is its own preference, separate from `preferredFormat`.**
 * That one governs Invite and Play the computer, where a real format is
 * always wanted; a stranger in the queue may genuinely have none, and forcing
 * one onto them here would stop two people who would happily have played each
 * other from pairing, because their unrelated "what I'd name if I had to"
 * preferences happened to differ. Read once at mount and held in state from
 * there — like every other setting here — so a tap re-renders the pills
 * without needing a second source of truth.
 */
export function Searching({ onCancel, onMatched }: SearchingProps): React.JSX.Element {
  const [format, setFormat] = useState(storedQueueFormat);
  const queue = useQueue(true, format);
  // Cleared on every format change, including to the same value by another tap,
  // so switching narrows the wait to a fresh clock rather than one that already
  // had time on it.
  const [offerWiden, setOfferWiden] = useState(false);

  useEffect(() => {
    if (queue.matched !== null) {
      onMatched(queue.matched);
    }
  }, [onMatched, queue.matched]);

  useEffect(() => {
    setOfferWiden(false);
    // Only a narrowed search can be widened — "anyone" has nowhere wider to go.
    if (format === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      setOfferWiden(true);
    }, WIDEN_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [format]);

  const choose = (next: MatchFormat | null): void => {
    setQueueFormat(next);
    setFormat(next);
  };

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

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="px-1 text-xs tracking-wide text-white/45 uppercase">Looking for</p>
          <div className="flex gap-1 rounded-xl bg-white/5 p-1">
            <button
              type="button"
              aria-pressed={format === null}
              className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium ${
                format === null ? "bg-white/15 text-white" : "text-white/55"
              }`}
              onClick={() => {
                choose(null);
              }}
            >
              Anyone
            </button>
            {CELLS.map((cell) => (
              <button
                key={cell}
                type="button"
                aria-pressed={format === cell}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium ${
                  format === cell ? "bg-white/15 text-white" : "text-white/55"
                }`}
                onClick={() => {
                  choose(cell);
                }}
              >
                {formatName(cell)}
              </button>
            ))}
          </div>
          {/* Offered rather than applied: nobody's search changes without a tap,
              even after giving up on the one they asked for. */}
          {offerWiden && format !== null ? (
            <p className="px-1 text-xs text-amber-200">
              Nobody is looking for {formatName(format).toLowerCase()} right now.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  choose(null);
                }}
              >
                Search for anyone instead
              </button>
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="w-full rounded-xl border border-white/25 px-4 py-4 text-base text-white"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
