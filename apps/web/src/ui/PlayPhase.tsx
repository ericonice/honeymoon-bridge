import { cardId } from "@hb/engine";
import type { CompletedTrick, PlayedCard, PlayerId, PlayerView } from "@hb/engine";
import { motion } from "framer-motion";
import { useState } from "react";
import { TRICK_TIMING } from "../game/timing.js";
import { CardFace, CardSlot } from "./CardFace.js";

export interface PlayPhaseProps {
  /** The trick that has just resolved, still lying on the table. */
  readonly lastTrick: CompletedTrick | null;
  readonly view: PlayerView;
}

interface TableTrick {
  readonly cards: readonly PlayedCard[];
  readonly winner: PlayerId | null;
}

/** How far a collected trick travels towards its winner before it fades. */
const SWEEP_DISTANCE = 130;

/**
 * What the table shows right now.
 *
 * The engine resolves a trick the instant the second card lands, so if the
 * table only ever rendered `currentTrick` you would never see the trick you
 * just lost. The resolved trick therefore stays put, is swept towards whoever
 * won it, and is gone by the time a card is played to the next one.
 */
function tableTrick(view: PlayerView, lastTrick: CompletedTrick | null): TableTrick | null {
  if (view.currentTrick.length > 0) {
    return { cards: view.currentTrick, winner: null };
  }
  if (lastTrick !== null) {
    return { cards: lastTrick.cards, winner: lastTrick.winner };
  }
  return null;
}

function Slot({
  played,
  sweepTo,
  trickKey,
}: {
  readonly played: PlayedCard | undefined;
  /** Null while the trick is still in progress; otherwise the direction it is collected in. */
  readonly sweepTo: number | null;
  readonly trickKey: string;
}): React.JSX.Element {
  return (
    <div className="relative h-24 w-16">
      <CardSlot size="table" />
      {played === undefined ? null : (
        <motion.div
          // Keyed on the trick as well as the card, so each trick's cards are
          // fresh elements and the collection animation replays every time.
          key={`${trickKey}-${cardId(played.card)}`}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.9, y: 0 }}
          animate={
            sweepTo === null
              ? { opacity: 1, scale: 1, y: 0 }
              : { opacity: [1, 1, 0], scale: [1, 1, 0.8], y: [0, 0, sweepTo] }
          }
          transition={
            sweepTo === null
              ? { duration: 0.18, ease: "easeOut" }
              : {
                  duration: (TRICK_TIMING.hold + TRICK_TIMING.sweep) / 1000,
                  ease: "easeIn",
                  times: [0, TRICK_TIMING.hold / (TRICK_TIMING.hold + TRICK_TIMING.sweep), 1],
                }
          }
        >
          <CardFace card={played.card} size="table" />
        </motion.div>
      )}
    </div>
  );
}

function caption(view: PlayerView, trick: TableTrick | null): string {
  if (trick !== null && trick.winner !== null) {
    const who = trick.winner === view.me ? "You" : "Opponent";
    return `${who} won trick ${view.completedTricks.length}`;
  }
  if (view.toAct !== view.me) {
    return "Opponent is playing…";
  }
  return view.currentTrick.length === 0 ? "Your lead" : "Your turn — follow suit";
}

/**
 * The last completed trick, on demand.
 *
 * Both cards were played face up and both players saw them, so this reveals
 * nothing private — it is the paper game's right to look back at the trick just
 * played. Deliberately only the most recent one: the full history is in the
 * view, and showing it would turn a game where memory is the point into a
 * reference table.
 */
function TrickReview({
  onClose,
  trick,
  view,
}: {
  readonly onClose: () => void;
  readonly trick: CompletedTrick;
  readonly view: PlayerView;
}): React.JSX.Element {
  const played = (player: PlayerId): PlayedCard | undefined =>
    trick.cards.find((card) => card.by === player);

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/75 px-6">
      <p className="text-sm text-white/60">Trick {view.completedTricks.length}</p>
      <div className="flex items-center gap-8">
        {([view.opponent, view.me] as const).map((player) => {
          const card = played(player);
          return (
            <div key={player} className="flex flex-col items-center gap-2">
              <p className="text-xs text-white/50">{player === view.me ? "You" : "Opponent"}</p>
              {card === undefined ? (
                <CardSlot size="table" />
              ) : (
                <CardFace card={card.card} size="table" />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-base font-semibold">
        {trick.winner === view.me ? "You won it" : "Opponent won it"}
      </p>
      <button
        type="button"
        className="rounded-xl bg-white px-6 py-3 text-base font-semibold text-stone-900"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}

export function PlayPhase({ lastTrick, view }: PlayPhaseProps): React.JSX.Element {
  const [reviewing, setReviewing] = useState(false);

  const trick = tableTrick(view, lastTrick);
  const cards = trick?.cards ?? [];
  const resolved = trick !== null && trick.winner !== null;

  // Both cards travel the same way — towards whoever took them.
  const sweepTo = !resolved
    ? null
    : trick.winner === view.me
      ? SWEEP_DISTANCE
      : -SWEEP_DISTANCE;

  const trickKey = `${view.completedTricks.length}-${resolved ? "done" : "live"}`;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-3">
      <p className="text-sm text-white/50">Opponent</p>
      <Slot
        played={cards.find((played) => played.by === view.opponent)}
        sweepTo={sweepTo}
        trickKey={trickKey}
      />
      <p className="min-h-6 text-center text-sm font-medium text-white/80">
        {caption(view, trick)}
      </p>
      <Slot
        played={cards.find((played) => played.by === view.me)}
        sweepTo={sweepTo}
        trickKey={trickKey}
      />
      <p className="text-sm text-white/50">You</p>

      <button
        type="button"
        className="mt-2 rounded-lg border border-white/25 px-3 py-1.5 text-xs text-white/70 disabled:opacity-25"
        disabled={lastTrick === null}
        onClick={() => {
          setReviewing(true);
        }}
      >
        Show last trick
      </button>

      {reviewing && lastTrick !== null ? (
        <TrickReview
          trick={lastTrick}
          view={view}
          onClose={() => {
            setReviewing(false);
          }}
        />
      ) : null}
    </div>
  );
}
