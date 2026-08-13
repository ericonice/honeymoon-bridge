import { totalScore } from "@hb/engine";
import type { DealPhase, Pair, PlayerView, RubberState } from "@hb/engine";
import { ContractText } from "./CardText.js";

export interface ContractBarProps {
  readonly opponentName: string;
  /** Shown phase, same lag as `TopBar` — see its own doc for why. */
  readonly phase: DealPhase;
  readonly rubber: RubberState;
  readonly view: PlayerView;
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
 * The rubber standing — total, toward game, and games won — the same three
 * numbers `Scorepad` shows at the foot of the full scorepad, not the
 * itemized per-deal breakdown above them.
 *
 * All three rather than just the total: the total is the one number that
 * always moves, but it was tried alone first and read as incomplete on its
 * own — toward game is what actually changes what a hand is worth bidding,
 * and games won is how close the rubber itself is to being over, and neither
 * is derivable from the total without doing the arithmetic in your head.
 *
 * Games won is omitted in a single game, the same reasoning `Scorepad` uses
 * for its own row: winning one ends the match, so it can only ever read
 * nil–nil, and a row that can only read zero is not a score.
 *
 * Below `TopBar` rather than behind its Score button, on every phase that
 * still has bidding ahead of it — that dependency is true throughout the
 * draw and the auction whether or not anyone taps through to be reminded of
 * it. Not shown once the deal is complete — `DealComplete` already lays out
 * the full standing in detail one beat later, and a compact echo of it right
 * above would just be the same numbers said twice.
 */
function StandingLines({
  opponentName,
  rubber,
  view,
}: {
  readonly opponentName: string;
  readonly rubber: RubberState;
  readonly view: PlayerView;
}): React.JSX.Element {
  return (
    <div className="text-xs">
      <StandingHeader opponentName={opponentName} />
      <StandingRow label="Total" values={totalScore(rubber)} view={view} />
      <StandingRow label="Toward game" values={rubber.partScore} view={view} />
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

  return (
    <div className="border-b border-white/10 bg-white/5 px-4 py-1.5 text-sm">
      {phase === "complete" ? null : (
        <StandingLines opponentName={opponentName} rubber={rubber} view={view} />
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
    </div>
  );
}
