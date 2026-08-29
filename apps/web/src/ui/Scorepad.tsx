import { totalScore } from "@hb/engine";
import type { MatchFormat, Pair, PlayerId, PlayerView, RubberState } from "@hb/engine";
import { matchNoun } from "../game/labels.js";
import type { DealRecord } from "../game/session.js";
import { ContractText } from "./CardText.js";
import { dealResultText, resultMark } from "./ScoreRows.js";

export interface ScorepadProps {
  /**
   * What is being played. A two-game match shows both columns from the first deal,
   * where a rubber's replay only has a second game once there is one.
   */
  readonly format: MatchFormat;
  readonly history: readonly DealRecord[];
  readonly opponentName: string;
  /** What the earlier game came to, bonus included. Null unless there is one. */
  readonly previousPoints: Pair<number> | null;
  /**
   * What the same boards came to in the match this one is replaying. Empty
   * unless this is a return match.
   */
  readonly previous: readonly DealRecord[];
  readonly rubber: RubberState;
  readonly view: PlayerView;
}

// w-14 used to be enough, until "Computer" — eight characters, and the one
// name every robot game actually shows here — started clipping to "Comput…"
// at exactly that width.
const CELL = "w-16 text-right tabular-nums";

function Columns({ opponentName }: { readonly opponentName: string }): React.JSX.Element {
  return (
    <div className="flex justify-end gap-2 text-xs text-white/45">
      <span className={CELL}>You</span>
      <span className={`${CELL} truncate`}>{opponentName}</span>
    </div>
  );
}

/**
 * A deal's points for one side.
 *
 * Below-the-line points are the ones that count toward a game, so they carry
 * the emphasis; everything above the line is real money but can never win a
 * game, and showing them as one figure hides the distinction the whole rubber
 * turns on.
 */
function Points({
  above,
  below,
}: {
  readonly above: number;
  readonly below: number;
}): React.JSX.Element {
  if (below === 0 && above === 0) {
    return <span className={`${CELL} text-white/25`}>—</span>;
  }
  return (
    <span className={CELL}>
      {below > 0 ? <span className="font-semibold">{below}</span> : null}
      {above > 0 ? <span className="pl-1 text-white/55">+{above}</span> : null}
    </span>
  );
}

/**
 * Who was paid honors, on a faint line of its own under the deal.
 *
 * **A quarter of deals pay them here, and until now nothing on this screen said so.**
 * Honors go to whoever holds them, defender included (§1) — so a deal can show points
 * to *both* sides, and the most baffling shape is a contract going down while its
 * declarer scores more than the side that set them. Reported as a scoring bug, and it
 * is not one: `scoreDeal` is right and the pad was silent. Over 400 deals, 20 paid
 * both sides and every one of the 20 was honors.
 *
 * Far commoner than in ordinary bridge, and the reason is this game's own shape: each
 * hand holds thirteen of only twenty-six dealt cards, and the draw *selects* for high
 * ones — so four of a suit's five honors landing in one hand is ordinary rather than
 * remarkable. 102 of those 400 deals paid honors to somebody.
 *
 * A line rather than a word appended to the result, because the two columns are what
 * says *which* side was paid, and a deal where declarer made and the defender holds
 * honors has points in both. `DealComplete` already breaks the score into named
 * components for exactly this reason; this is the running pad catching up.
 */
function HonorsLine({
  values,
  view,
}: {
  readonly values: Pair<number>;
  readonly view: PlayerView;
}): React.JSX.Element {
  const cell = (player: PlayerId): React.JSX.Element => (
    <span className={CELL}>{values[player] > 0 ? values[player] : "—"}</span>
  );

  return (
    <div className="flex items-baseline justify-between gap-2 pb-1 text-xs text-white/40">
      <span className="pl-[1.375rem]">honors</span>
      <span className="flex shrink-0 gap-2">
        {cell(view.me)}
        {cell(view.opponent)}
      </span>
    </div>
  );
}

function DealLine({
  index,
  record,
  view,
}: {
  readonly index: number;
  readonly record: DealRecord;
  readonly view: PlayerView;
}): React.JSX.Element {
  const score = record.score;
  const points = (player: PlayerId): React.JSX.Element => (
    <Points above={score?.aboveLine[player] ?? 0} below={score?.belowLine[player] ?? 0} />
  );

  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="w-4 shrink-0 text-xs text-white/35 tabular-nums">{index}</span>
        <span className="truncate">
          {record.contract === null ? (
            <span className="text-white/50">Passed out</span>
          ) : (
            <>
              <ContractText contract={record.contract} on="dark" />
              <span className="text-white/45">
                {" "}
                {record.contract.declarer === view.me ? "you" : "opp"} · {dealResultText(record.score)}
              </span>
            </>
          )}
        </span>
      </span>
      <span className="flex shrink-0 gap-2">
        {points(view.me)}
        {points(view.opponent)}
      </span>
    </div>
  );
}

/** Drawn under the deal that won a game, the way a line is ruled across a paper scorepad. */
function GameLine({
  by,
  opponentName,
  view,
}: {
  readonly by: PlayerId;
  readonly opponentName: string;
  readonly view: PlayerView;
}): React.JSX.Element {
  return (
    <div className="my-1 flex items-center gap-2">
      <span className="h-px flex-1 bg-amber-300/60" />
      <span className="text-xs text-amber-200/80">
        Game to {by === view.me ? "you" : opponentName}
      </span>
      <span className="h-px flex-1 bg-amber-300/60" />
    </div>
  );
}

/**
 * The scorepad proper: every deal, in order. The rubber-wide totals used to
 * be ruled in underneath, the way a paper scorepad foots its own columns —
 * removed once `ContractBar` started showing that same standing all the
 * time, which made repeating it here the same numbers said twice.
 */
/** What a deal came to for this seat, as one signed figure. */
function netTo(record: DealRecord, player: PlayerId): number {
  const score = record.score;
  if (score === null) {
    return 0;
  }
  const mine = score.aboveLine[player] + score.belowLine[player];
  const theirs = score.aboveLine[player === 0 ? 1 : 0] + score.belowLine[player === 0 ? 1 : 0];
  return mine - theirs;
}

/**
 * A signed figure with a real minus.
 *
 * **Zero is drawn as a zero, and it used to be drawn as a dash.** A dash says nothing
 * happened, and a deal that nets nothing is not a deal where nothing happened — it is
 * one where both sides scored the same. That is reachable in ordinary play and common
 * here: five clubs made pays declarer 100 below the line, and a defender holding four
 * club honours takes 100 above, so the deal nets zero with two hundred points on the
 * table. Reported as a hand scoring "no change, which is not possible unless it was
 * passed out" — and it was not passed out.
 *
 * A quarter of deals pay honours in this game, far more than in ordinary bridge,
 * because each hand holds thirteen of only twenty-six dealt cards and the draw selects
 * for high ones. So this is not a curiosity.
 *
 * A cell with no deal in it at all stays blank, which is the distinction the dash was
 * wrongly carrying: nothing there, as against nothing in it.
 */
function signed(value: number): string {
  if (value === 0) {
    return "0";
  }
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/**
 * What honors paid on this deal, signed this seat's way, or null if none were.
 *
 * **The one component of a score that the row cannot already explain.** Overtricks, the
 * doubling insult, a slam bonus — all of them follow from the contract, which is right
 * there in the cell. Honors do not: they go to whoever *holds* them, declarer or
 * defender, so a number can be surprising with nothing in the row to account for it.
 * Five clubs made pays declarer 100 and a defender with four club honours takes 100,
 * and the deal comes to nothing at all.
 *
 * Worth surfacing here rather than left to the deal-complete screen because they are
 * common: a fifth to a quarter of deals pay them, since each hand holds thirteen of
 * only twenty-six dealt cards and the draw selects for high ones. `bench/honors.ts`
 * has the figures, and why they nonetheless decide almost nothing.
 */
function honorsOn(record: DealRecord | undefined, view: PlayerView): number | null {
  const honors = record?.score?.detail.honors;
  if (honors === undefined || (honors[0] === 0 && honors[1] === 0)) {
    return null;
  }
  return honors[view.me] - honors[view.opponent];
}

/** One deal's line inside a game's column: what was bid, and what it came to. */
function GameCell({
  record,
  view,
}: {
  readonly record: DealRecord | undefined;
  readonly view: PlayerView;
}): React.JSX.Element {
  if (record === undefined) {
    return <span className="min-w-0 flex-1" aria-hidden="true" />;
  }

  const net = netTo(record, view.me);
  return (
    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-1">
      <span className="min-w-0 truncate">
        {record.contract === null ? (
          <span className="text-white/40">passed out</span>
        ) : (
          <>
            <ContractText contract={record.contract} on="dark" />
            <span className="text-white/40">
              {" "}
              {record.contract.declarer === view.me ? "you" : "opp"} {resultMark(record.score)}
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

/** A game's deals and what it finally came to, which are not the same sum. */
interface GameColumn {
  readonly deals: readonly DealRecord[];
  /** Null for a game not started. Otherwise the real total, bonus included. */
  readonly total: Pair<number> | null;
}

/**
 * The two games side by side, a column each.
 *
 * **This replaced a per-board pairing that was correct and still hard to read.** That
 * version put each *holding* on its own row so the like-for-like comparison sat in a
 * column — honest, and it asked the reader to hold "which stream was this" in their
 * head on every line. What a two-game match turns on is simpler: two games happened on
 * one set of deals, and their totals add up to the result. So a column is a game, a row
 * is a deal, and every figure is signed from this seat.
 *
 * **What it deliberately does not claim** is that a row is a like-for-like comparison.
 * The seats swap, so on any board you held one stream in the first game and the other
 * in the second — reading across says how that board went *for you* twice, not who did
 * better with the same cards. The honest comparison is the pair of game totals.
 *
 * **Both columns from the start**, the second empty until it exists. A pad that grew a
 * column halfway through would move everything under it and would also hide, during
 * the first game, the fact that there is a second one coming.
 */
function TwoGames({
  first,
  opponentName,
  second,
  view,
}: {
  readonly first: GameColumn;
  readonly opponentName: string;
  readonly second: GameColumn;
  readonly view: PlayerView;
}): React.JSX.Element {
  const rows = Math.max(first.deals.length, second.deals.length);

  /**
   * **A game's total is not the sum of its deals, and the pad said it was.**
   *
   * Winning a game pays `matchBonusFor`, and that lands on the rubber's own above-line
   * rather than on any deal in it — so a column footed by adding up its rows was short
   * by the bonus and disagreed with every other total on screen. Taken from the game's
   * real total instead, with the bonus shown as what it is: whatever that total is
   * beyond its deals. Derived rather than restated, so the row and the foot cannot
   * drift apart, and so nothing here has to know what a game pays.
   */
  const dealt = (column: GameColumn): number =>
    column.deals.reduce((sum, one) => sum + netTo(one, view.me), 0);
  const settled = (column: GameColumn): number | null =>
    column.total === null ? null : column.total[view.me] - column.total[view.opponent];
  const bonus = (column: GameColumn): number => (settled(column) ?? 0) - dealt(column);

  const foot = (column: GameColumn): string => {
    const value = settled(column);
    return value === null ? "" : signed(value);
  };

  const match = (settled(first) ?? 0) + (settled(second) ?? 0);

  /**
   * Whether this row is where a column's half was won.
   *
   * **The rule belongs under the deal that won the game, not at the foot of the pad.**
   * At the foot it slid down with every deal played, so a line marking a moment that had
   * already happened kept moving — which is the one thing a mark on a record must not
   * do. A paper scorepad rules its line where the game ended and leaves it there.
   *
   * A column's half is won exactly when it has a bonus: the figure is the difference
   * between the half's real total and its deals added up, and only `matchBonusFor` sits
   * in that gap. While a half is still being played there is no bonus and no rule.
   *
   * The two columns are ruled independently, because the halves need not end on the same
   * deal — one can take four and the other three.
   */
  const wonAt = (column: GameColumn, index: number): boolean =>
    bonus(column) !== 0 && index === column.deals.length - 1;

  return (
    <div className="w-full max-w-sm text-sm">
      {/* **One rule down the whole block rather than a border on every row.** The rows
          have their own vertical rhythm — a header, the deals, the game rule, the foot —
          and a per-row border breaks wherever two of them are spaced apart, which reads
          as a dashed line rather than a division. Positioned against the same `flex-1`
          split the rows use, so it sits exactly where the columns meet however wide the
          pad is. */}
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-white/10"
          // The row is a 1rem index, a 0.5rem gap, then two equal columns with another
          // 0.5rem gap between them — so the columns meet half a gap past the first
          // one's right edge. Spelled out rather than eyeballed, because a rule that is
          // nearly between two columns reads as belonging to one of them.
          style={{ left: "calc(1.5rem + (100% - 2rem) / 2 + 0.25rem)" }}
        />
        <div className="flex items-baseline gap-2 pb-1 text-xs text-white/45">
          <span className="w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">First half</span>
          <span className="min-w-0 flex-1">Second half</span>
        </div>

      {rows === 0 ? (
        <p className="py-2 text-white/40">No deals yet.</p>
      ) : (
        Array.from({ length: rows }, (_unused, index) => {
          const paid: Pair<number | null> = [
            honorsOn(first.deals[index], view),
            honorsOn(second.deals[index], view),
          ];

          return (
            <div key={index}>
              <div className="flex items-baseline gap-2 py-0.5">
                <span className="w-4 shrink-0 text-xs text-white/35 tabular-nums">
                  {index + 1}
                </span>
                <GameCell record={first.deals[index]} view={view} />
                <GameCell record={second.deals[index]} view={view} />
              </div>
              {/* Under the deal it belongs to, with the figure in the column that paid
                  it, and only on the deals that did — about one in five. Named rather
                  than marked: a dot or an "h" is cheaper in width and is a key the
                  reader has to learn, which this project has argued itself out of more
                  than once. The same word `DealComplete` and the single-column pad
                  already use, so three surfaces agree. */}
              {paid[0] === null && paid[1] === null ? null : (
                <div className="flex items-baseline gap-2 pb-0.5 text-xs text-white/40">
                  <span className="w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-right tabular-nums">
                    {paid[0] === null ? "" : `honors ${signed(paid[0])}`}
                  </span>
                  <span className="min-w-0 flex-1 text-right tabular-nums">
                    {paid[1] === null ? "" : `honors ${signed(paid[1])}`}
                  </span>
                </div>
              )}

              {/* **Ruled under the deal that won the half, and nowhere else.** The same
                  device the rubber scorepad uses to mark a game, and the bonus rides on
                  the rule because that is what the rule is about: not another deal, but
                  what finishing the half was worth. Each column is ruled on its own row,
                  since the two halves need not end on the same deal. */}
              {wonAt(first, index) || wonAt(second, index) ? (
                <div className="flex items-center gap-2 pb-0.5 text-xs">
                  <span className="w-4 shrink-0" aria-hidden="true" />
                  {[first, second].map((column, side) => (
                    <span key={side} className="flex min-w-0 flex-1 items-center gap-1.5">
                      {wonAt(column, index) ? (
                        <>
                          <span className="h-px flex-1 bg-amber-300/40" />
                          <span className="shrink-0 tabular-nums text-amber-200/70">
                            game {signed(bonus(column))}
                          </span>
                        </>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })
      )}

      {/* Right-aligned, like every figure above it. A foot that sits under a column of
          right-aligned numbers and starts at the left is reading as a different kind of
          thing than the numbers it totals. */}
      <div className="flex items-baseline gap-2 border-t border-white/15 pt-1 font-semibold">
        <span className="w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-right tabular-nums">{foot(first)}</span>
        <span className="min-w-0 flex-1 text-right tabular-nums">{foot(second)}</span>
      </div>

      </div>

      {/* The verdict, spelled out rather than left to be added: it is the whole reason
          the two columns are beside each other — and outside the rule above, because it
          belongs to neither column. */}
      <div className="mt-1 flex items-baseline justify-between border-t border-white/15 pt-1">
        <span className="text-xs text-white/45">Both halves</span>
        <span className="font-semibold tabular-nums">{signed(match)}</span>
      </div>
      <p className="pt-1 text-xs text-white/45">
        Signed your way, against {opponentName}.
      </p>
    </div>
  );
}

export function Scorepad({
  format,
  history,
  opponentName,
  previous,
  previousPoints,
  rubber,
  view,
}: ScorepadProps): React.JSX.Element {
  // A two-game match is about the *pair* from its first deal, so both columns are there
  // from the start with the second empty. A rubber's replay only becomes a pair once
  // there is an earlier game to put in the left column.
  if (format === "mirror" || previous.length > 0) {
    // Which deals belong to which column flips at half time: during the first game the
    // deals in hand *are* the first game, and only afterwards do they become the second.
    const inSecond = previousPoints !== null;
    return (
      <TwoGames
        first={{
          deals: inSecond ? previous : history,
          total: inSecond ? previousPoints : totalScore(rubber),
        }}
        opponentName={opponentName}
        second={{ deals: inSecond ? history : [], total: inSecond ? totalScore(rubber) : null }}
        view={view}
      />
    );
  }

  return (
    <div className="w-full max-w-sm text-sm">
      <p className="pb-1 text-xs tracking-wide text-white/45 uppercase">
        The {matchNoun(rubber.format)}
      </p>
      {/* Said once, at the top, rather than on every row. The faint figures are
          reversed against the columns above them — deliberately, since the seats
          swapped — and a reader who has not been told that will read them as their
          own score and conclude the wrong thing. */}
      <Columns opponentName={opponentName} />

      {history.length === 0 ? (
        <p className="py-2 text-white/40">No deals yet.</p>
      ) : (
        history.map((record, index) => (
          <div key={index}>
            <DealLine index={index + 1} record={record} view={view} />
            {record.score !== null &&
            (record.score.detail.honors[0] > 0 || record.score.detail.honors[1] > 0) ? (
              <HonorsLine values={record.score.detail.honors} view={view} />
            ) : null}
            {record.wonGameBy === null ? null : (
              <GameLine by={record.wonGameBy} opponentName={opponentName} view={view} />
            )}
          </div>
        ))
      )}
    </div>
  );
}
