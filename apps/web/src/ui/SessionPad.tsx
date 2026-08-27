import { drewFirstOn, marginTo, netTo } from "@hb/engine";
import type { BoardOutcome, DuplicateResult, DuplicateSummary, PlayerView } from "@hb/engine";
import { ContractText } from "./CardText.js";
import { dealResultText } from "./ScoreRows.js";

const VALUE = "w-16 shrink-0 text-right tabular-nums";

/**
 * The scorepad of a duplicate session: every deal as it is played, gathered under
 * the board it belongs to.
 *
 * A rubber's pad is a flat column of deals because a rubber is *made* of deals —
 * the part-score carries and a line is ruled when a game falls, so reading down
 * the column is how the standing arose. A session is made of **boards**, and its
 * two halves are the same stock from opposite sides. Laying them flat would put
 * the two things that have to be compared several rows apart, which is the one
 * comparison the format exists to make.
 *
 * **The arithmetic is shown rather than asserted, and that is the point of the
 * layout.** A board's margin is the *sum* of your two nets across its runs — not a
 * difference to be taken on trust. It falls out of the definition: the board is
 * signed toward whoever drew first the first time, and the second run hands that
 * seat to the other player, so subtracting their run is adding your own. So the two
 * deal lines add up to the figure beside the board, in front of you.
 *
 * **An open board shows its one deal.** An earlier version listed closed boards
 * only, on the grounds that half a board is a score with nothing to compare it to
 * and invites being read as a result. True, and it withheld the thing a player most
 * wants after finishing a deal — what just happened. It says "still to come round"
 * instead, which is the honest version of the same caution.
 *
 * The cost, small and worth naming: numbering an open board narrows the guess about
 * which board the next replay is. It narrows it only slightly, because what a
 * player has to recognise is the *cards*, and the pad never shows those.
 */
export function SessionPad({
  summary,
  view,
}: {
  readonly summary: DuplicateSummary;
  readonly view: PlayerView;
}): React.JSX.Element {
  const started = summary.boards.filter((board) => board.played.length > 0);

  return (
    <div className="w-full max-w-sm text-sm">
      <p className="pb-1 text-xs tracking-wide text-white/45 uppercase">The session</p>
      {/* One column, and it is yours throughout. A board's worth is a single number
          — the difference between its two runs — so a column each would be the same
          fact twice, once negated. Headed rather than left to the signs, because a
          bare "−170" does not say whose. */}
      <p className="flex justify-end pb-0.5 text-xs text-white/45">
        <span className={VALUE}>Your points</span>
      </p>

      {started.length === 0 ? (
        <p className="py-2 text-white/40">No deals yet.</p>
      ) : (
        started.map((board) => (
          <Board key={board.board} board={board} view={view} />
        ))
      )}

      <p className="mt-2 flex items-baseline justify-between gap-2 border-t border-white/15 pt-1.5 font-semibold">
        <span className="text-white/70">Session</span>
        <span className={VALUE}>{signed(summary.margin[view.me])}</span>
      </p>
    </div>
  );
}

function Board({
  board,
  view,
}: {
  readonly board: BoardOutcome;
  readonly view: PlayerView;
}): React.JSX.Element {
  const closed = board.margin !== null;
  // First run first, whichever order the schedule happened to play them in — the
  // point of the pair is that one is the mirror of the other, and "the replay"
  // means nothing above the run it is a replay of.
  const runs = [...board.played].sort((one, two) => Number(one.replay) - Number(two.replay));

  return (
    <div className="border-t border-white/10 py-1">
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-white/45">Board {board.board + 1}</span>
        {closed ? (
          <span className={`${VALUE} font-semibold`}>{signed(marginTo(board, view.me))}</span>
        ) : (
          <span className="text-xs text-white/35">still to come round</span>
        )}
      </p>

      {runs.map((run) => (
        <Run key={run.replay ? "replay" : "first"} board={board} run={run} view={view} />
      ))}
    </div>
  );
}

/**
 * One run of a board: who drew first, what was bid, how it came out, and your net.
 *
 * Labelled by **who drew first** rather than "first" and "replay", because that is
 * what actually differs between the two — the same stock offered the other way
 * round — and it is the fact that makes the two numbers comparable. "Replay" names
 * the order they were played in, which is the one thing about them that does not
 * matter.
 */
function Run({
  board,
  run,
  view,
}: {
  readonly board: BoardOutcome;
  readonly run: DuplicateResult;
  readonly view: PlayerView;
}): React.JSX.Element {
  // Your net is your own points; a run you did not open still has a net for you.
  const mine = drewFirstOn(board, run) === view.me;

  return (
    <p className="flex items-baseline justify-between gap-2 pl-3">
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="w-16 shrink-0 text-xs text-white/35">
          {mine ? "you drew" : "they drew"}
        </span>
        <span className="truncate">
          {run.contract === null ? (
            <span className="text-white/50">Passed out</span>
          ) : (
            <>
              <ContractText contract={run.contract} on="dark" />
              <span className="text-white/45">
                {" "}
                {run.contract.declarer === view.me ? "you" : "opp"} ·{" "}
                {dealResultText(run.score?.deal ?? null)}
              </span>
            </>
          )}
        </span>
      </span>
      <span className={`${VALUE} ${netTo(board, run, view.me) === 0 ? "text-white/35" : ""}`}>
        {signed(netTo(board, run, view.me))}
      </span>
    </p>
  );
}

/**
 * A signed figure, with a real minus rather than a hyphen.
 *
 * The same convention the record screen uses, and for the same reason: a hyphen at
 * this size reads as a dash between two things rather than as a sign on one.
 */
function signed(value: number): string {
  if (value === 0) {
    return "0";
  }
  return `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}
