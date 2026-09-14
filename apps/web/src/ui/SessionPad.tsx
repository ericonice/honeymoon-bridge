import { drewFirstRunOf, drewFirstTotal, drewSecondRunOf, drewSecondTotal, impsFor, marginTo, netTo } from "@hb/engine";
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
 * **Every board shows from the first deal, not only once it has started.** An earlier
 * version listed a board at all only once it had a run in, on the reasoning that a board
 * with nothing played yet is a row with nothing to say. True, and it meant the pad grew
 * one row at a time rather than being the whole session's shape from the start — a player
 * could not see how many boards were left, or which numbers, without counting. An
 * unplayed board's two cells are simply blank, the same blank an open board's *other* cell
 * already was.
 *
 * The cost, small and worth naming: numbering every board from the start narrows the
 * guess about which board is currently on the table, a little more than an open board
 * alone did. It narrows it only slightly, because what a player has to recognise is the
 * *cards*, and the pad never shows those.
 *
 * **The gap between the two columns is wider than the gap to the index**, decoupled into
 * its own nested pair rather than one flat row of three, so the two figures being compared
 * read as a pair with a little air between them instead of three items evenly spaced. The
 * divider still finds the middle of that pair on its own — see the inline comment on it —
 * so widening it again costs nothing to keep aligned.
 */
export function SessionPad({
  summary,
  view,
}: {
  readonly summary: DuplicateSummary;
  readonly view: PlayerView;
}): React.JSX.Element {
  const scoredInImps = summary.scoring === "imps";

  return (
    <div className="w-full max-w-sm text-sm">
      <p className="pb-1 text-xs tracking-wide text-white/45 uppercase">
        The session · {ORDER_LABEL[summary.schedule]}
        {scoredInImps ? " · IMPs" : ""}
      </p>
      {/* The IMPs column is a sibling of the whole first-play/replay block rather
          than a third member of its own row — the divider between those two
          already finds their shared midpoint by measuring *that block's own*
          width, and a third column inside it would have to fight that same
          arithmetic instead of just standing beside it. */}
      <div className="flex items-start gap-2">
        {/* Every figure below is yours, in both columns — nothing is reversed and nothing
            needs a caption saying so.

            **A column is which side of the stock you held, not which pass through the
            boards this was**, and that distinction is the whole point rather than a
            nicety. `board.starter` alternates, so grouping by first-play-and-replay puts
            this seat on the first-draw stream in column one on some boards and on the
            second-draw stream in column one on others — which makes each column a sum
            over both streams and the pair of them a comparison of nothing. Measured on a
            control session, two identical players with every board exactly flat, the
            run-order split read **+2270 and −2270**; by stream it reads +70 and −70.

            Which side you held is fixed for a whole column, so the header says it once
            and no cell needs a marker. */}
        <div className="relative min-w-0 flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-white/10"
            // The index and the gap to the two-column pair are 1.5rem together; the
            // divider sits at the middle of that pair's own width, whatever gap sits
            // inside it — the two columns are equal width, so widening or narrowing the
            // gap between them pushes both outward by the same amount and the middle
            // never moves. Spelled out rather than eyeballed, the same way the two-game
            // pad does it, because a rule that is nearly between two columns reads as
            // belonging to one of them.
            style={{ left: "calc(1.5rem + (100% - 1.5rem) / 2)" }}
          />
          <div className="flex items-baseline gap-2 pb-1 text-xs text-white/45">
            <span className="w-4 shrink-0" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 gap-4">
              <span className="min-w-0 flex-1">You drew 1st</span>
              <span className="min-w-0 flex-1">You drew 2nd</span>
            </span>
          </div>

          {/* min-h-6 is a floor, not a fixed height — a fully unplayed board has
              nothing but its own text-xs index number to set the row's cross size
              under items-baseline, which is shorter than a row where a run cell's
              text-sm content does. The IMPs column beside this one is always
              text-sm, so an unplayed row here would come out shorter than its
              sibling there — and every unplayed row before a closed one shaved a
              little more off, until the two columns no longer agreed on which row
              was which. */}
          {summary.boards.map((board) => {
            // Asked of the run itself rather than of the column it sits in. While the
            // columns were first-play and replay the two were the same question; now
            // that a column is a side of the stock, this seat's first-draw run *is* the
            // replay on every board the opponent started — so keying on the column
            // would mark the wrong cell on half the board list.
            const highlight = (run: DuplicateResult | null): boolean =>
              run !== null &&
              summary.lastCompleted?.board === board.board &&
              summary.lastCompleted.replay === run.replay;
            const mineFirst = drewFirstRunOf(board, view.me);
            const mineSecond = drewSecondRunOf(board, view.me);
            return (
              <div key={board.board} className="flex min-h-6 items-baseline gap-2 py-0.5">
                <span className="w-4 shrink-0 text-xs text-white/35 tabular-nums">
                  {board.board + 1}
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-4">
                  <RunCell
                    board={board}
                    highlight={highlight(mineFirst)}
                    run={mineFirst}
                    view={view}
                  />
                  <RunCell
                    board={board}
                    highlight={highlight(mineSecond)}
                    run={mineSecond}
                    view={view}
                  />
                </span>
              </div>
            );
          })}

          {/* Footed per column, which is the whole reason the columns are what they are. */}
          <div className="mt-1 flex items-baseline gap-2 border-t border-white/15 pt-1 text-xs text-white/55">
            <span className="w-4 shrink-0" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 gap-4">
              <span className="min-w-0 flex-1 text-right tabular-nums">
                {signed(drewFirstTotal(summary, view.me) ?? 0)}
              </span>
              <span className="min-w-0 flex-1 text-right tabular-nums">
                {signed(drewSecondTotal(summary, view.me) ?? 0)}
              </span>
            </span>
          </div>
        </div>

        {/* Points is silent about IMPs entirely — the two run cells already show
            everything a points session has to say. IMPs is not: the two run
            cells are still raw points, since that is what was actually bid and
            made, so without this a board's own IMPs — what its two runs are
            actually worth toward the session — could only be taken on trust
            from a "Session" total several boards away. One board a row, the
            same as the block beside it, so a row still answers for itself. */}
        {scoredInImps ? (
          <div className="w-10 shrink-0">
            {/* text-xs sits on the header alone, matching the main block's own header —
                its board rows are deliberately left at the ambient text-sm so a row here
                is exactly as tall as the run cells beside it. A shared text-xs on the
                whole column once made every row here shorter than its counterpart, and the
                two drifted out of line further down the list than at the top. */}
            <p className="pb-1 text-right text-xs text-white/45">IMPs</p>
            {summary.boards.map((board) => (
              <p key={board.board} className="min-h-6 py-0.5 text-right tabular-nums text-white/50">
                {/* A truly empty child renders no text node at all, and a block with
                    nothing inline in it collapses to zero height — which is exactly
                    what an open board's cell was, so every one of them vanished from
                    the column instead of holding its row's place. A non-breaking
                    space is real content, invisible and full height, and `impCells`'s
                    own `.trim()` already reads it back as blank. */}
                {board.margin === null ? " " : signed(impsFor(marginTo(board, view.me)))}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mt-2 flex items-baseline justify-between gap-2 border-t border-white/15 pt-1.5 font-semibold">
        <span className="text-white/70">Session{scoredInImps ? " (IMPs)" : ""}</span>
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
 *
 * `highlight` marks the run that just finished, so the eye lands on the row it filled in
 * rather than having to hunt for it — see `DuplicateSummary.lastCompleted`'s own doc for
 * why naming which cell this is is not the leak it would be for the one still in progress.
 */
function RunCell({
  board,
  highlight,
  run,
  view,
}: {
  readonly board: BoardOutcome;
  readonly highlight: boolean;
  readonly run: DuplicateResult | null;
  readonly view: PlayerView;
}): React.JSX.Element {
  if (run === null) {
    return <span className="min-w-0 flex-1" aria-hidden="true" />;
  }

  const net = netTo(board, run, view.me);
  return (
    <span
      className={`flex min-w-0 flex-1 items-baseline justify-between gap-1 ${highlight ? "-mx-1 rounded bg-amber-300/10 px-1" : ""}`}
    >
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
