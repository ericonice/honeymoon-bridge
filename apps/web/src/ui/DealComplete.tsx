import { totalScore } from "@hb/engine";
import type { DealScore, MatchStanding, Pair, PlayerView } from "@hb/engine";
import { matchNoun } from "../game/labels.js";
import { ratingChange } from "../game/records.js";
import { Columns, DealResultHeadline, Row } from "./ScoreRows.js";
import { Scorepad } from "./Scorepad.js";
import { SessionPad } from "./SessionPad.js";

export interface DealCompleteProps {
  /** What a duplicate deal paid beyond its tricks. Zero in a rubber. */
  readonly dealBonus: number;
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
  readonly standing: MatchStanding;
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
  dealBonus,
  onDone,
  onNextDeal,
  opponentName,
  opponentRating,
  opponentWaitingToContinue,
  score,
  standing,
  view,
  vulnerable,
  waitingToContinue,
}: DealCompleteProps): React.JSX.Element {
  // The two pads are the one place the formats genuinely differ, and this screen
  // shows one on all four of its paths — so it is resolved once here rather than
  // branched at each of them.
  const pad =
    standing.kind === "duplicate" ? (
      <SessionPad summary={standing.summary} view={view} />
    ) : (
      <Scorepad history={standing.history} opponentName={opponentName} rubber={standing.rubber} view={view} />
    );
  const complete =
    standing.kind === "duplicate" ? standing.summary.complete : standing.rubber.complete;
  const noun = matchNoun(
    standing.kind === "duplicate" ? "duplicate" : standing.rubber.format,
  );

  const button = (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <button
        type="button"
        className="w-full rounded-xl bg-white px-4 py-4 text-lg font-semibold text-stone-900 disabled:bg-white/10 disabled:text-white/60"
        disabled={waitingToContinue}
        onClick={onNextDeal}
      >
        {waitingToContinue ? `Waiting for ${opponentName}…` : complete ? `New ${noun}` : "Next deal"}
      </button>

      {/* The other half of "Waiting for X…". Moving on takes both, and without
          this a finished deal looks the same whether or not somebody is sitting
          there waiting on you. */}
      {opponentWaitingToContinue ? (
        <p className="text-xs text-white/50">
          {complete ? `${opponentName} wants another ${noun}` : `${opponentName} is ready`}
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

  if (complete) {
    // A drawn match is a third outcome rather than a loss, which duplicate makes
    // ordinary: a board is flat whenever both of its runs score the same, so a short
    // session really is level a fair fraction of the time.
    const winner = standing.kind === "duplicate" ? standing.summary.winner : standing.rubber.winner;
    const drawn = winner === null;
    const won = winner === view.me;
    // Worked out here rather than waited for. The server is authoritative and
    // the next record fetch confirms it, but the moment worth showing is now.
    // **No rating line for a session, and this would have been a lie on screen.**
    // Duplicate results are recorded and deliberately left out of the rating walk —
    // the anchor for the format cannot come from self-play, since a bench has no
    // memory on either side and a person does. So the server will never move the
    // rating for this match, and a client showing "1361 → 1384" would be inventing
    // a number that never arrives. A blank is the honest answer, for the same reason
    // `botAnchor` returns null rather than guessing: nobody checks a figure that
    // looks right.
    const rating =
      standing.kind === "duplicate" ? null : ratingChange({ opponent: opponentRating, won });

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-4">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">
            {drawn
              ? `The ${noun} is level`
              : won
                ? `You win the ${noun}`
                : `${opponentName} wins the ${noun}`}
          </h2>
          {/* A single game is won one game to nothing by definition, so saying so
              is noise. The margin that means something there is the score. A
              session says how many boards it took, since that is not fixed by the
              format the way a rubber's two games are. */}
          {standing.kind === "duplicate" ? (
            <p className="mt-1 text-sm text-white/60">
              {standing.summary.boards.length} boards, {standing.summary.dealsPlayed} deals
            </p>
          ) : standing.rubber.format === "rubber" ? (
            <p className="mt-1 text-sm text-white/60">
              {standing.rubber.gamesWon[view.me]} games to{" "}
              {standing.rubber.gamesWon[view.opponent]}
            </p>
          ) : null}
        </div>
        {standing.kind === "duplicate" ? null : (
          <div className="w-full max-w-sm text-sm">
            <Columns opponentName={opponentName} />
            <Row label="Above the line" values={standing.rubber.aboveLine} view={view} />
            <Row divider label="Below the line" values={standing.rubber.belowLineTotal} view={view} />
            <Row emphasis label="Final score" values={totalScore(standing.rubber)} view={view} />
          </div>
        )}

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

        {pad}

        {button}
      </div>
    );
  }

  if (view.passedOut || score === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-4 text-center">
        <h2 className="text-2xl font-semibold">Passed out</h2>
        <p className="max-w-xs text-sm text-white/60">
          {standing.kind === "duplicate"
            ? "Neither of you bid, so nothing is scored — and the board is not redealt. A passed-out run is a result: whatever the other run comes to is the whole of what the board is worth."
            : "Neither of you bid, so the deal is thrown in and redealt with the same player drawing first. Nothing is scored."}
        </p>
        {pad}
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
      <DealResultHeadline
        bonus={dealBonus}
        opponentName={opponentName}
        score={score}
        view={view}
        vulnerable={vulnerable}
      />

      {pad}

      {button}
    </div>
  );
}
