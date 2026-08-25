import { totalScore } from "@hb/engine";
import type { DealScore, Pair, PlayerView, RubberState } from "@hb/engine";
import { matchNoun } from "../game/labels.js";
import { ratingChange } from "../game/records.js";
import type { DealRecord } from "../game/session.js";
import { Columns, DealResultHeadline, Row } from "./ScoreRows.js";
import { Scorepad } from "./Scorepad.js";

export interface DealCompleteProps {
  readonly history: readonly DealRecord[];
  readonly opponentName: string;
  /** True once the other player has asked to move on and you have not. */
  readonly opponentWaitingToContinue: boolean;
  /**
   * What the opponent is rated, or null when nothing has said.
   *
   * Only needed to work out what finishing this match did to *your* rating, and
   * only on the screen that ends one — which is why this takes the number rather
   * than the pair the standing strip takes.
   */
  readonly opponentRating: number | null;
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

export function DealComplete({
  history,
  onDone,
  onNextDeal,
  opponentName,
  opponentRating,
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
    // Worked out here rather than waited for. The server is authoritative and
    // the next record fetch confirms it, but the moment worth showing is now.
    const rating = ratingChange({ opponent: opponentRating, won });

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
          <Row label="Above the line" values={rubber.aboveLine} view={view} />
          <Row divider label="Below the line" values={rubber.belowLineTotal} view={view} />
          <Row emphasis label="Final score" values={totals} view={view} />
        </div>

        {/* Under the score rather than beside it: the score is what happened,
            and this is what it was worth. Rendered only when every part of it is
            known — a rating change is a claim about a specific number, and half
            of one is worse than none. */}
        {rating === null ? null : (
          <p className="text-sm text-white/60">
            Rating {rating.before} &rarr;{" "}
            <span className="font-semibold text-white/90 tabular-nums">{rating.after}</span>{" "}
            <span className={rating.delta >= 0 ? "text-emerald-300/80" : "text-white/45"}>
              ({rating.delta >= 0 ? "+" : ""}
              {rating.delta})
            </span>
          </p>
        )}

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

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-4">
      {/* Reached only by a claimed finish — a natural one shows this same
          headline during the hands reveal and goes straight to the next
          deal from there, never reaching this screen at all. A claim never
          has a reveal to have shown it in, so this is still this path's to
          show. */}
      <DealResultHeadline opponentName={opponentName} score={score} view={view} vulnerable={vulnerable} />

      <Scorepad history={history} opponentName={opponentName} rubber={rubber} view={view} />

      {button}
    </div>
  );
}
