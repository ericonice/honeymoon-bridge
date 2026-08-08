import { cardId } from "@hb/engine";
import type { CompletedTrick, Pair, PlayedCard, PlayerId, PlayerView } from "@hb/engine";
import { motion } from "framer-motion";
import { useState } from "react";
import { TRICK_TIMING } from "../game/timing.js";
import { CardFace, CardSlot } from "./CardFace.js";
import { SeatLabel } from "./SeatLabel.js";

export interface PlayPhaseProps {
  /** The trick that has just resolved, still lying on the table. */
  readonly lastTrick: CompletedTrick | null;
  readonly opponentName: string;
  readonly view: PlayerView;
  readonly vulnerable: Pair<boolean>;
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

/** What just happened, or null if nothing has yet. */
function resultLine(view: PlayerView, trick: TableTrick | null, opponentName: string): string | null {
  if (trick === null || trick.winner === null) {
    return null;
  }
  const who = trick.winner === view.me ? "You" : opponentName;
  return `${who} won trick ${view.completedTricks.length}`;
}

/**
 * What you have to do, when it is your move.
 *
 * No longer says *whose* turn it is — the seat labels carry that now. This is
 * only for the part a name cannot tell you: whether you are leading or have to
 * follow a suit.
 */
function instruction(view: PlayerView): string | null {
  // There is nothing left to do once the deal is over. The board goes on
  // showing this screen for a beat so the thirteenth trick can be collected,
  // and the engine has already handed the lead on by then — so without this it
  // asks for a card that no longer exists.
  if (view.phase !== "play" || view.toAct !== view.me) {
    return null;
  }
  return view.currentTrick.length === 0 ? "Your lead" : "Follow suit";
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
  opponentName,
  trick,
  view,
}: {
  readonly onClose: () => void;
  readonly opponentName: string;
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
              <p className="text-xs text-white/50">{player === view.me ? "You" : opponentName}</p>
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
        {trick.winner === view.me ? "You won it" : `${opponentName} won it`}
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

export function PlayPhase({ lastTrick, opponentName, view, vulnerable }: PlayPhaseProps): React.JSX.Element {
  const [reviewing, setReviewing] = useState(false);

  const trick = tableTrick(view, lastTrick);
  const cards = trick?.cards ?? [];
  const resolved = trick !== null && trick.winner !== null;
  const result = resultLine(view, trick, opponentName);

  // Both cards travel the same way — towards whoever took them.
  const sweepTo = !resolved ? null : trick.winner === view.me ? SWEEP_DISTANCE : -SWEEP_DISTANCE;

  const trickKey = `${view.completedTricks.length}-${resolved ? "done" : "live"}`;

  // Neither seat is on turn once the deal is over, so both go quiet while the
  // last trick is collected rather than one of them claiming a move to make.
  const live = view.phase === "play";
  const yourTurn = live && view.toAct === view.me;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-3">
      <SeatLabel
        active={live && !yourTurn}
        name={opponentName}
        vulnerable={vulnerable[view.opponent]}
      />
      <Slot
        played={cards.find((played) => played.by === view.opponent)}
        sweepTo={sweepTo}
        trickKey={trickKey}
      />

      <div className="flex min-h-10 flex-col items-center justify-center">
        {result === null ? null : (
          <p className="text-center text-sm font-medium text-white/80">{result}</p>
        )}
        {instruction(view) === null ? null : (
          <p className="text-center text-sm text-white/50">{instruction(view)}</p>
        )}
      </div>

      <Slot
        played={cards.find((played) => played.by === view.me)}
        sweepTo={sweepTo}
        trickKey={trickKey}
      />
      <SeatLabel active={yourTurn} name="You" vulnerable={vulnerable[view.me]} />

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
          opponentName={opponentName}
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
