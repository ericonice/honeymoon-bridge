import { opponentOf, overtrickPoints, totalScore, undertrickPoints } from "@hb/engine";
import type { DealScore, Pair, PlayerId, PlayerView, RubberState } from "@hb/engine";
import { matchNoun } from "../game/labels.js";
import type { DealRecord } from "../game/session.js";
import { ContractText } from "./CardText.js";
import { Scorepad } from "./Scorepad.js";

export interface DealCompleteProps {
  readonly history: readonly DealRecord[];
  readonly opponentName: string;
  /** True once the other player has asked to move on and you have not. */
  readonly opponentWaitingToContinue: boolean;
  readonly rubber: RubberState;
  readonly score: DealScore | null;
  readonly view: PlayerView;
  readonly vulnerable: Pair<boolean>;
  /** True once you have asked to move on and the other player has not. */
  readonly waitingToContinue: boolean;
  /**
   * Finishes here rather than starting another. Null while a match is still
   * running, where stopping is abandoning and belongs behind a confirmation.
   */
  readonly onDone: (() => void) | null;
  onNextDeal(): void;
}

interface ScoreRow {
  readonly key: string;
  readonly label: React.ReactNode;
  readonly values: Pair<number>;
}

function creditTo(player: PlayerId, amount: number): Pair<number> {
  return player === 0 ? [amount, 0] : [0, amount];
}

function scoreRows(view: PlayerView, score: DealScore, vulnerable: Pair<boolean>): ScoreRow[] {
  const contract = view.contract!;
  const { detail } = score;
  const declarer = contract.declarer;
  const defender = opponentOf(declarer);
  const declarerVulnerable = vulnerable[declarer];

  const rows: ScoreRow[] = [
    {
      key: "contract",
      label: (
        <>
          <ContractText contract={contract} on="dark" /> {detail.made ? "made" : "failed"}
        </>
      ),
      values: score.belowLine,
    },
  ];

  if (detail.overtricks > 0) {
    rows.push({
      key: "overtricks",
      label: `${detail.overtricks} overtrick${detail.overtricks === 1 ? "" : "s"}`,
      values: creditTo(
        declarer,
        overtrickPoints(detail.overtricks, contract.strain, contract.doubling, declarerVulnerable),
      ),
    });
  }
  if (detail.undertricks > 0) {
    rows.push({
      key: "undertricks",
      label: `Down ${detail.undertricks}`,
      values: creditTo(
        defender,
        undertrickPoints(detail.undertricks, contract.doubling, declarerVulnerable),
      ),
    });
  }
  if (detail.slamBonus > 0) {
    rows.push({ key: "slam", label: "Slam bonus", values: creditTo(declarer, detail.slamBonus) });
  }
  if (detail.insult > 0) {
    rows.push({ key: "insult", label: "Doubled bonus", values: creditTo(declarer, detail.insult) });
  }
  if (detail.honors[0] > 0 || detail.honors[1] > 0) {
    rows.push({ key: "honors", label: "Honors", values: detail.honors });
  }

  return rows;
}

function Row({
  emphasis,
  label,
  view,
  values,
}: {
  readonly emphasis?: boolean;
  readonly label: React.ReactNode;
  readonly view: PlayerView;
  readonly values: Pair<number>;
}): React.JSX.Element {
  const cell = "w-16 text-right tabular-nums";
  const tone = emphasis === true ? "border-t border-white/20 pt-2 font-semibold" : "";

  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${tone}`}>
      <span className="text-white/75">{label}</span>
      <span className="flex gap-3">
        <span className={cell}>{values[view.me] || "—"}</span>
        <span className={`${cell} text-white/60`}>{values[view.opponent] || "—"}</span>
      </span>
    </div>
  );
}

function Columns({ opponentName }: { readonly opponentName: string }): React.JSX.Element {
  return (
    <div className="flex justify-end gap-3 pb-1 text-xs text-white/45">
      <span className="w-16 text-right">You</span>
      <span className="w-16 text-right">{opponentName}</span>
    </div>
  );
}

export function DealComplete({
  history,
  onDone,
  onNextDeal,
  opponentName,
  opponentWaitingToContinue,
  rubber,
  score,
  view,
  vulnerable,
  waitingToContinue,
}: DealCompleteProps): React.JSX.Element {
  const button = (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <button
        type="button"
        className="w-full rounded-xl bg-white px-4 py-4 text-lg font-semibold text-stone-900 disabled:bg-white/10 disabled:text-white/60"
        disabled={waitingToContinue}
        onClick={onNextDeal}
      >
        {waitingToContinue
          ? `Waiting for ${opponentName}…`
          : rubber.complete
            ? `New ${matchNoun(rubber.format)}`
            : "Next deal"}
      </button>

      {/* The other half of "Waiting for X…". Moving on takes both, and without
          this a finished deal looks the same whether or not somebody is sitting
          there waiting on you. */}
      {opponentWaitingToContinue ? (
        <p className="text-xs text-white/50">
          {rubber.complete
            ? `${opponentName} wants another ${matchNoun(rubber.format)}`
            : `${opponentName} is ready`}
        </p>
      ) : null}

      {/* A won match used to offer only another one, which left no way to say
          that was the last. Nothing is lost by taking it — the match is over
          and already recorded — so it goes without a confirmation. */}
      {onDone === null ? null : (
        <button
          type="button"
          className="text-sm text-white/50 underline underline-offset-4"
          onClick={onDone}
        >
          Done for now
        </button>
      )}
    </div>
  );

  if (rubber.complete) {
    const totals = totalScore(rubber);
    const won = rubber.winner === view.me;
    const noun = matchNoun(rubber.format);

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-4">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">
            {won ? `You win the ${noun}` : `${opponentName} wins the ${noun}`}
          </h2>
          {/* A single game is won one game to nothing by definition, so saying so
              is noise. The margin that means something there is the score. */}
          {rubber.format === "rubber" ? (
            <p className="mt-1 text-sm text-white/60">
              {rubber.gamesWon[view.me]} games to {rubber.gamesWon[view.opponent]}
            </p>
          ) : null}
        </div>
        <div className="w-full max-w-sm text-sm">
          <Columns opponentName={opponentName} />
          <Row label="Below the line" values={rubber.belowLineTotal} view={view} />
          <Row label="Above the line" values={rubber.aboveLine} view={view} />
          <Row emphasis label="Final score" values={totals} view={view} />
        </div>

        <Scorepad history={history} opponentName={opponentName} rubber={rubber} view={view} />

        {button}
      </div>
    );
  }

  if (view.passedOut || score === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-4 text-center">
        <h2 className="text-2xl font-semibold">Passed out</h2>
        <p className="max-w-xs text-sm text-white/60">
          Neither of you bid, so the deal is thrown in and redealt with the same player drawing
          first. Nothing is scored.
        </p>
        <Scorepad history={history} opponentName={opponentName} rubber={rubber} view={view} />
        {button}
      </div>
    );
  }

  const rows = scoreRows(view, score, vulnerable);
  const dealTotals: Pair<number> = [
    score.belowLine[0] + score.aboveLine[0],
    score.belowLine[1] + score.aboveLine[1],
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-4">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">
          {score.detail.made ? "Contract made" : `Down ${score.detail.undertricks}`}
        </h2>
        <p className="mt-1 text-sm text-white/60">
          You took {view.tricksWon[view.me]} of 13 tricks
          {vulnerable[view.me] || vulnerable[view.opponent]
            ? vulnerable[0] && vulnerable[1]
              ? " · both vulnerable"
              : vulnerable[view.me]
                ? " · you were vulnerable"
                : ` · ${opponentName} was vulnerable`
            : ""}
        </p>
      </div>

      <div className="w-full max-w-sm text-sm">
        <p className="pb-1 text-xs tracking-wide text-white/45 uppercase">This deal</p>
        <Columns opponentName={opponentName} />
        {rows.map((row) => (
          <Row key={row.key} label={row.label} values={row.values} view={view} />
        ))}
        <Row emphasis label="Deal total" values={dealTotals} view={view} />
      </div>

      <Scorepad history={history} opponentName={opponentName} rubber={rubber} view={view} />

      {button}
    </div>
  );
}
