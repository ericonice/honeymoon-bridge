import { firstPlayOf, firstPlayTotal, netTo, replayOf, replayTotal } from "@hb/engine";
import type { BoardOutcome, DuplicateResult, DuplicateSummary, PlayerView } from "@hb/engine";
import { ORDER_LABEL } from "../game/identity.js";
import { ContractText } from "./CardText.js";
import { resultMark } from "./ScoreRows.js";

/**
 * The scorepad of a duplicate session: a column per pass through the boards, a row per
 * board.
 *
 * A rubber's pad is a flat column of deals because a rubber is *made* of deals — the
 * part-score carries and a line is ruled when a game falls, so reading down the column
 * is how the standing arose. A session is made of **boards**, each played twice, so the
 * two figures that have to be compared belong beside each other rather than several rows
 * apart.
 *
 * **The arithmetic is shown rather than asserted.** A board's worth to you is the *sum*
 * of your two nets across its runs — not a difference to be taken on trust. It falls out
 * of the definition: the board is signed toward whoever drew first the first time, and
 * the second run hands that seat to the other player, so subtracting their run is adding
 * your own. Side by side that addition is a glance, which is why no third figure repeats
 * it per row: the board's own margin was the headline of the version this replaces, and
 * two adjacent cells say it more plainly than a number claiming it. That property holds
 * under either heading — which run lands in which column changes, the sum of the row
 * never does.
 *
 * **The columns are first play and replay, matching the same distinction mirror's own
 * pad makes for its two halves.** This was tried the other way first — a column per side
 * of the stock, on the reasoning that "replay" names *when* a deal happened rather than
 * *which cards*, and it is the cards that make two numbers comparable. True, and it also
 * meant a session pad had nothing in common with a mirror pad even though both exist to
 * compare a first pass against a second — reading one after the other meant learning two
 * different axes for what looks like the same idea. Heading by pass instead costs
 * something a side-of-the-stock heading did not: which side you held on a given run is no
 * longer fixed for a whole column, so the small tag on each cell says it per cell rather
 * than once in the header.
 *
 * **And it is what makes the two feet mean something.** "What I made across every first
 * play so far" against "what I made across every replay so far" is a comparison the
 * format has already cancelled the luck out of, the same as the side-of-the-stock reading
 * was — just organised by when rather than by which hand.
 *
 * **An open board shows its one deal.** An earlier version listed closed boards only, on
 * the grounds that half a board is a score with nothing to compare it to and invites
 * being read as a result. True, and it withheld the thing a player most wants after
 * finishing a deal — what just happened. The empty cell beside it now says that plainly,
 * which is the honest version of the same caution and needs no words for it.
 *
 * The cost, small and worth naming: numbering an open board narrows the guess about
 * which board the next replay is. It narrows it only slightly, because what a player has
 * to recognise is the *cards*, and the pad never shows those.
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
      <p className="pb-1 text-xs tracking-wide text-white/45 uppercase">
        The session · {ORDER_LABEL[summary.schedule]}
      </p>
      {/* Every figure below is yours, in both columns — nothing is reversed and nothing
          needs a caption saying so. A column is which pass through the boards this was,
          not which side of the stock you held, so a cell says who drew first on its own
          run rather than the header saying it once for the whole column. */}
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-white/10"
          // The row is a 1rem index, a 0.5rem gap, then two equal columns with another
          // 0.5rem gap between them — so the columns meet half a gap past the first
          // one's right edge. Spelled out rather than eyeballed, the same way the
          // two-game pad does it, because a rule that is nearly between two columns
          // reads as belonging to one of them.
          style={{ left: "calc(1.5rem + (100% - 2rem) / 2 + 0.25rem)" }}
        />
        <div className="flex items-baseline gap-2 pb-1 text-xs text-white/45">
          <span className="w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">First play</span>
          <span className="min-w-0 flex-1">Replay</span>
        </div>

        {started.length === 0 ? (
          <p className="py-2 text-white/40">No deals yet.</p>
        ) : (
          started.map((board) => (
            <div key={board.board} className="flex items-baseline gap-2 py-0.5">
              <span className="w-4 shrink-0 text-xs text-white/35 tabular-nums">
                {board.board + 1}
              </span>
              <RunCell board={board} run={firstPlayOf(board)} view={view} />
              <RunCell board={board} run={replayOf(board)} view={view} />
            </div>
          ))
        )}

        {/* Footed per column, which is the whole reason the columns are what they are. */}
        <div className="mt-1 flex items-baseline gap-2 border-t border-white/15 pt-1 text-xs text-white/55">
          <span className="w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-right tabular-nums">
            {signed(firstPlayTotal(summary, view.me) ?? 0)}
          </span>
          <span className="min-w-0 flex-1 text-right tabular-nums">
            {signed(replayTotal(summary, view.me) ?? 0)}
          </span>
        </div>
      </div>

      <p className="mt-2 flex items-baseline justify-between gap-2 border-t border-white/15 pt-1.5 font-semibold">
        <span className="text-white/70">Session</span>
        <span className="tabular-nums">{signed(summary.margin[view.me])}</span>
      </p>
    </div>
  );
}

/**
 * One run of a board: what was bid, who played it, how it came out, and your net.
 *
 * The result is bridge's own notation rather than prose — `+2`, `−1`, `=` — because half
 * a phone's width already carries a contract, a declarer and a signed total, and "made
 * two overtricks" does not fit beside them. `=` rather than a blank for made exactly, so
 * an empty cell keeps its one meaning: there is no deal there.
 */
function RunCell({
  board,
  run,
  view,
}: {
  readonly board: BoardOutcome;
  readonly run: DuplicateResult | null;
  readonly view: PlayerView;
}): React.JSX.Element {
  if (run === null) {
    return <span className="min-w-0 flex-1" aria-hidden="true" />;
  }

  const net = netTo(board, run, view.me);
  return (
    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-1">
      <span className="min-w-0 truncate">
        {run.contract === null ? (
          <span className="text-white/40">passed out</span>
        ) : (
          <>
            <ContractText contract={run.contract} on="dark" />
            <span className="text-white/40">
              {" "}
              {run.contract.declarer === view.me ? "you" : "opp"}{" "}
              {resultMark(run.score?.deal ?? null)}
            </span>
          </>
        )}
      </span>
      <span className={`shrink-0 tabular-nums ${net === 0 ? "text-white/30" : ""}`}>
        {signed(net)}
      </span>
    </span>
  );
}

/**
 * A signed figure, with a real minus rather than a hyphen.
 *
 * The same convention the record screen uses, and for the same reason: a hyphen at this
 * size reads as a dash between two things rather than as a sign on one.
 */
function signed(value: number): string {
  if (value === 0) {
    return "0";
  }
  return `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}
