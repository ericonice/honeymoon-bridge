import type { Pair, PlayerId, PlayerView, RubberState } from "@hb/engine";
import { matchNoun } from "../game/labels.js";
import type { DealRecord } from "../game/session.js";
import { ContractText } from "./CardText.js";
import { dealResultText } from "./ScoreRows.js";

export interface ScorepadProps {
  readonly history: readonly DealRecord[];
  readonly opponentName: string;
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
/**
 * A board's two runs, laid out so the comparison reads down a column.
 *
 * **Rows are the players and columns are the two holdings**, which is the one
 * arrangement that is both truthful and aligned. Per *deal* it cannot be: a replay
 * swaps the seats, so the two figures worth comparing always end up diagonally
 * opposite, and the version that forced them into a column did it by reversing them
 * under a "You" heading — which reads as your own score and says the opposite of the
 * truth. That shipped, and it is what this replaces.
 *
 * The handle is the **draw position**. Flipping the starter swaps which player draws
 * first, but the first drawer still gets the same cards, so "the first drawer's
 * holding" is one thing with a stable identity across both runs — held by one player
 * the first time and the other the second. Every cell below is a player's own score
 * with their own cards; nothing is reversed anywhere. Reading down `first draw` says
 * what each of you made with that holding, which is the whole question a replay asks.
 *
 * The cost is the chronology: these are pairs rather than the order they were played.
 * Acceptable here and nowhere else — on a replay you played these boards a few minutes
 * ago, so the order is not news and the comparison is.
 */
function BoardPair({
  index,
  now,
  opponentName,
  then,
  view,
}: {
  readonly index: number;
  readonly now: DealRecord;
  readonly opponentName: string;
  readonly then: DealRecord;
  readonly view: PlayerView;
}): React.JSX.Element {
  // Which of the two runs this seat drew first on. Exactly one of them, since the
  // replay hands the first draw to the other player.
  const mineFirst = now.starter === view.me ? now : then;
  const theirsFirst = now.starter === view.me ? then : now;

  const points = (record: DealRecord, player: PlayerId): React.JSX.Element => (
    <Points
      above={record.score?.aboveLine[player] ?? 0}
      below={record.score?.belowLine[player] ?? 0}
    />
  );

  const said = (record: DealRecord): React.JSX.Element => (
    <>
      {record.contract === null ? (
        <span className="text-white/45">passed out</span>
      ) : (
        <>
          <ContractText contract={record.contract} on="dark" />
          <span className="text-white/45">
            {" "}
            {record.contract.declarer === view.me ? "you" : "opp"} ·{" "}
            {dealResultText(record.score)}
          </span>
        </>
      )}
    </>
  );

  const row = (label: string, mine: DealRecord, theirs: DealRecord): React.JSX.Element => (
    <div className="flex items-baseline justify-between gap-2">
      <span className="truncate pl-[1.375rem] text-white/45">{label}</span>
      <span className="flex shrink-0 gap-2">
        {points(mine, view.me)}
        {points(theirs, view.opponent)}
      </span>
    </div>
  );

  const bid = (label: string, record: DealRecord): React.JSX.Element => (
    <div className="flex min-w-0 items-baseline gap-1.5 text-xs text-white/40">
      <span className="shrink-0 pl-[1.375rem]">{label}</span>
      <span className="min-w-0 truncate">{said(record)}</span>
    </div>
  );

  return (
    <div className="border-t border-white/10 py-1.5 first:border-t-0">
      <div className="flex items-baseline gap-1.5">
        <span className="w-4 shrink-0 text-xs text-white/35 tabular-nums">{index}</span>
        <span className="text-xs text-white/45">board {index}</span>
      </div>
      {/* Each row is a *holding* and each cell the score of whoever held it — you in
          one run, {opponentName} in the other — so reading down a column says what the
          two of you made with the same cards. Nothing here is reversed. */}
      {row("you drew first", mineFirst, theirsFirst)}
      {row("they drew first", theirsFirst, mineFirst)}
      {/* The auctions, under the figures rather than beside them: a run supplies one
          cell of each row, so a contract belongs to a diagonal and cannot sit against
          either. Labelled by who drew first, which is the same handle the rows use. */}
      {bid("when you drew first", mineFirst)}
      {bid("when they drew first", theirsFirst)}
    </div>
  );
}

export function Scorepad({
  history,
  opponentName,
  previous,
  rubber,
  view,
}: ScorepadProps): React.JSX.Element {
  const returning = previous.length > 0;

  return (
    <div className="w-full max-w-sm text-sm">
      <p className="pb-1 text-xs tracking-wide text-white/45 uppercase">
        The {matchNoun(rubber.format)}
      </p>
      {/* Said once, at the top, rather than on every row. The faint figures are
          reversed against the columns above them — deliberately, since the seats
          swapped — and a reader who has not been told that will read them as their
          own score and conclude the wrong thing. */}
      {returning ? (
        <p className="pb-1 text-xs text-white/45">
          The same boards, from the other side. Each row is one holding, so reading down
          a column says what the two of you made with the same cards.
        </p>
      ) : null}
      <Columns opponentName={opponentName} />

      {returning ? (
        history.map((record, index) =>
          previous[index] === undefined ? null : (
            <BoardPair
              key={index}
              index={index + 1}
              now={record}
              opponentName={opponentName}
              then={previous[index]!}
              view={view}
            />
          ),
        )
      ) : history.length === 0 ? (
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
