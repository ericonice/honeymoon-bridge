import type { PlayerId, PlayerView, RubberState } from "@hb/engine";
import { matchNoun } from "../game/labels.js";
import type { DealRecord } from "../game/session.js";
import { ContractText } from "./CardText.js";
import { dealResultText } from "./ScoreRows.js";

export interface ScorepadProps {
  readonly history: readonly DealRecord[];
  readonly opponentName: string;
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
export function Scorepad({
  history,
  opponentName,
  rubber,
  view,
}: ScorepadProps): React.JSX.Element {
  return (
    <div className="w-full max-w-sm text-sm">
      <p className="pb-1 text-xs tracking-wide text-white/45 uppercase">
        The {matchNoun(rubber.format)}
      </p>
      <Columns opponentName={opponentName} />

      {history.length === 0 ? (
        <p className="py-2 text-white/40">No deals yet.</p>
      ) : (
        history.map((record, index) => (
          <div key={index}>
            <DealLine index={index + 1} record={record} view={view} />
            {record.wonGameBy === null ? null : (
              <GameLine by={record.wonGameBy} opponentName={opponentName} view={view} />
            )}
          </div>
        ))
      )}
    </div>
  );
}
