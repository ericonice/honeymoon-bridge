import { totalScore } from "@hb/engine";
import type { DealPhase, Pair, PlayerView, RubberState } from "@hb/engine";
import type { Density } from "../game/identity.js";
import { ContractText } from "./CardText.js";

export interface ContractBarProps {
  /** How much room this strip may take — see `Density`. */
  readonly density: Density;
  /** Deals played so far this rubber, including the one in progress. */
  readonly handsPlayed: number;
  readonly opponentName: string;
  /** Shown phase, same lag as `TopBar` — see its own doc for why. */
  readonly phase: DealPhase;
  readonly rubber: RubberState;
  readonly view: PlayerView;
  /**
   * Opens the rubber scorepad. Null on the screen that already shows it in
   * full. Makes the whole strip a button rather than adding an icon to it —
   * the same "tap the thing itself" this app already reaches for elsewhere
   * (`PlayPhase`'s own screen, `Overlay`'s backdrop) rather than a separate
   * control competing for room in an already narrow bar.
   */
  onShowScore: (() => void) | null;
}

/**
 * One figure of the standing on a single line — "Total 340&ndash;120", your own
 * side first.
 *
 * Unlabelled as to whose is whose, on purpose: the contract line in this same
 * strip has always read `Tricks 5 – 3` with no header, so "yours first" is a
 * convention this bar already sets an inch away rather than one invented here.
 */
function Figure({
  label,
  values,
  view,
}: {
  readonly label: string;
  readonly values: Pair<number>;
  readonly view: PlayerView;
}): React.JSX.Element {
  return (
    <span className="whitespace-nowrap">
      {label}{" "}
      <span className="tabular-nums text-white/60">
        {values[view.me]}&ndash;{values[view.opponent]}
      </span>
    </span>
  );
}

// Same width as `Scorepad`'s own cell — wide enough for "Computer" to sit
// unclipped in the header, not just for the numbers underneath it.
const CELL = "w-14 text-right tabular-nums";

/** Which of the two columns is which, stated once rather than on every row below it. */
function StandingHeader({ opponentName }: { readonly opponentName: string }): React.JSX.Element {
  return (
    <p className="flex justify-end gap-2 text-[0.65rem] text-white/35">
      <span className={CELL}>You</span>
      <span className={`${CELL} truncate`}>{opponentName}</span>
    </p>
  );
}

function StandingRow({
  label,
  values,
  view,
}: {
  readonly label: string;
  readonly values: Pair<number>;
  readonly view: PlayerView;
}): React.JSX.Element {
  return (
    <p className="flex items-baseline justify-between gap-2">
      <span className="text-white/55">{label}</span>
      <span className="flex gap-2">
        <span className={CELL}>{values[view.me]}</span>
        <span className={`${CELL} text-white/60`}>{values[view.opponent]}</span>
      </span>
    </p>
  );
}

/**
 * The rubber standing — total, part score and games won.
 *
 * Part score is `rubber.partScore`, not `rubber.belowLineTotal`: on a real
 * scorepad, winning a game rules a fresh line and the next game's
 * below-the-line entries start again from zero underneath it, so the number
 * that means something right now is the live, resettable part score, not the
 * rubber's lifetime sum of every game's below-the-line points. It is also the
 * bridge term for exactly this — an incomplete below-the-line score not yet
 * amounting to a game — rather than this app's own former "toward game"
 * framing, which said the same number without the term a bridge player
 * already has for it. The above-the-line total lives one tap away, in the
 * full scorepad `onShowScore` opens, rather than crowding a fourth row into
 * a strip this narrow.
 *
 * Games won is kept alongside for the same reason it always was: it is how
 * close the rubber itself is to being over, which the other two numbers do
 * not say on their own. Omitted in a single game, the same reasoning
 * `Scorepad` uses for its own row: winning one ends the match, so it can only
 * ever read nil–nil, and a row that can only read zero is not a score.
 *
 * Below `TopBar` rather than behind its Score button, on every phase that
 * still has bidding ahead of it — that dependency is true throughout the
 * draw and the auction whether or not anyone taps through to be reminded of
 * it. Not shown once the deal is complete — `DealComplete` already lays out
 * the full standing in detail one beat later, and a compact echo of it right
 * above would just be the same numbers said twice.
 */
function StandingLines({
  density,
  handsPlayed,
  opponentName,
  rubber,
  view,
}: {
  readonly density: Density;
  readonly handsPlayed: number;
  readonly opponentName: string;
  readonly rubber: RubberState;
  readonly view: PlayerView;
}): React.JSX.Element {
  // `handsPlayed` counts deals already scored into the rubber, which is one
  // short of the hand actually on the table until this one is scored into it
  // too — `view.phase`, the engine's own, says which side of that it is on.
  // Read off the engine's phase rather than the shown one on purpose: during
  // the hands reveal the shown phase still lags at "play", but the deal
  // behind it is already scored, and this should already read as the count
  // that includes it rather than overshoot by counting the next one too.
  const handNumber = view.phase === "complete" ? handsPlayed : handsPlayed + 1;

  // Five stacked rows read better and cost about 82px of a phone's height, on
  // every screen, all game — so where that room does not exist the same figures
  // go on one wrapping line instead. `flex-wrap` rather than truncation, so a
  // very narrow screen spends a second line rather than hiding a figure; two
  // rows is still three better than five.
  if (density === "compact") {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-xs text-white/45">
        <span className="whitespace-nowrap">Hand {handNumber}</span>
        <Figure label="Total" values={totalScore(rubber)} view={view} />
        <Figure label="Part" values={rubber.partScore} view={view} />
        {rubber.format === "rubber" ? (
          <Figure label="Games" values={rubber.gamesWon} view={view} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="text-xs">
      <p className="pb-0.5 text-white/40">Hand #: {handNumber}</p>
      <StandingHeader opponentName={opponentName} />
      <StandingRow label="Total" values={totalScore(rubber)} view={view} />
      <StandingRow label="Part score" values={rubber.partScore} view={view} />
      {rubber.format === "rubber" ? (
        <StandingRow label="Games won" values={rubber.gamesWon} view={view} />
      ) : null}
    </div>
  );
}

/**
 * The rubber standing, and — once there is a contract — the contract and the
 * running trick count, in a strip of their own below the top bar.
 *
 * These used to live in the bar itself, competing for the same row as
 * leaving, the score button and — when a dev build turns it on — the skip
 * shortcut. The contract text is the one piece of chrome that actually
 * changes every deal, so it earns a stable place rather than however much
 * room is left over once navigation has taken its share; on a narrow phone
 * that room was sometimes only "2NT by…".
 */
export function ContractBar({
  density,
  handsPlayed,
  onShowScore,
  opponentName,
  phase,
  rubber,
  view,
}: ContractBarProps): React.JSX.Element | null {
  // Contract and trick count only apply once there is a contract, and only
  // on the shown phase that means — see `TopBar`'s own doc for why this is
  // the lagged phase rather than `view.phase`: the auction's own closing
  // screen already shows the fresh contract itself, and showing it here too
  // during that same held beat would be the same information twice, on
  // screen at once.
  const contract = phase === "play" || phase === "complete" ? view.contract : null;

  if (phase === "complete" && contract === null) {
    return null;
  }

  const content = (
    <>
      {phase === "complete" ? null : (
        <StandingLines
          density={density}
          handsPlayed={handsPlayed}
          opponentName={opponentName}
          rubber={rubber}
          view={view}
        />
      )}
      {contract === null ? null : (
        <p className={`flex items-baseline justify-between gap-2 ${phase === "complete" ? "" : "mt-1"}`}>
          <span className="min-w-0 truncate text-white/85">
            <ContractText contract={contract} on="dark" />{" "}
            {contract.declarer === view.me ? "by you" : `by ${opponentName}`}
          </span>
          <span className="shrink-0 tabular-nums text-white/60">
            Tricks {view.tricksWon[view.me]} – {view.tricksWon[view.opponent]}
          </span>
        </p>
      )}
    </>
  );

  if (onShowScore === null) {
    return <div className="border-b border-white/10 bg-white/5 px-4 py-1.5 text-sm">{content}</div>;
  }

  return (
    <button
      type="button"
      aria-label="Show the score"
      className="w-full border-b border-white/10 bg-white/5 px-4 py-1.5 text-left text-sm"
      onClick={onShowScore}
    >
      {content}
    </button>
  );
}
