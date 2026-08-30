import { totalScore } from "@hb/engine";
import type {
  DealScore,
  MatchFormat,
  MatchStanding,
  Pair,
  PlayerId,
  PlayerView,
} from "@hb/engine";
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
  /** Played back on boards from an earlier match, which the server will not rate. */
  readonly repeated: boolean;
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
  /**
   * Plays the finished match's boards back, from the other side. Null when there
   * is nothing to return.
   *
   * Offered beside "New rubber" rather than instead of it, because it is a second
   * way to carry on rather than a different kind of ending — and quieter than it,
   * because most of the time another rubber is what somebody wants.
   */
  readonly onPlaySameBoards: (() => void) | null;
  /** What is being played — the standing cannot say for a two-game match. */
  readonly format: MatchFormat;
  /** Whether the *match* is over, as opposed to the half in progress. */
  readonly matchComplete: boolean;
  /** The first game of a two-game match is over and the match is not. */
  readonly halfComplete: boolean;
  /** Who won the match. Null while it runs, and null for a draw. */
  readonly matchWinner: PlayerId | null;
}

/**
 * The three figures a two-game match ends on, or null for a match that is not one.
 *
 * Read **unreversed**, unlike almost everything else this feature draws. Per deal the
 * unit is the cards, so a seat is compared against whoever held them; across a whole
 * match each player has had both sides of every deal, so the totals compare the
 * players.
 */
function pairFigures(
  standing: MatchStanding,
): { readonly both: Pair<number>; readonly first: Pair<number>; readonly second: Pair<number> } | null {
  if (standing.kind !== "rubber" || standing.previousPoints === null) {
    return null;
  }
  const first = standing.previousPoints;
  const second = totalScore(standing.rubber);
  return { both: [first[0] + second[0], first[1] + second[1]], first, second };
}

export function DealComplete({
  dealBonus,
  format,
  halfComplete,
  matchComplete,
  matchWinner,
  onDone,
  onNextDeal,
  onPlaySameBoards,
  opponentName,
  opponentRating,
  repeated,
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
      <Scorepad
        format={format}
        history={standing.history}
        opponentName={opponentName}
        previous={standing.previous}
        previousPoints={standing.previousPoints}
        rubber={standing.rubber}
        view={view}
      />
    );
  /**
   * **Whether the *match* is over, which a two-game match's standing cannot say.**
   *
   * Each half is a real single game whose `rubber.complete` goes true when somebody
   * reaches a hundred — and deriving the match from that, as this did, declares a
   * winner at half time on a format whose entire point is that the first half decides
   * nothing. So it comes from the session, which knows.
   */
  const complete = matchComplete;
  const pairPoints = pairFigures(standing);
  const noun = matchNoun(format);

  /** The first half of a pair is over: a real moment, but not a result. */
  const halfDone = halfComplete;

  // Side by side once there are two ways to carry on, because they are two ways to
  // carry on rather than a choice and an afterthought — stacked, the second read as a
  // second-class version of the first. "Done for now" stays apart below: it is the one
  // that ends the sitting rather than continuing it.
  const carryOn = onPlaySameBoards !== null && !waitingToContinue;

  const button = (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <div className="flex w-full gap-2">
        <button
          type="button"
          className={`min-w-0 flex-1 rounded-xl bg-white px-3 text-stone-900 disabled:bg-white/10 disabled:text-white/60 ${
            carryOn ? "py-3 text-left" : "px-4 py-4 text-lg font-semibold"
          }`}
          disabled={waitingToContinue}
          onClick={onNextDeal}
        >
          {carryOn ? (
            <>
              <span className="block truncate text-base font-semibold">New {noun}</span>
              <span className="mt-0.5 block truncate text-xs text-stone-600">fresh deals</span>
            </>
          ) : waitingToContinue ? (
            `Waiting for ${opponentName}…`
          ) : complete ? (
            `New ${noun}`
          ) : halfDone ? (
            // **Says where you are, not what the mechanic is.** "Same deals back" was
            // true and described the cards; what a player needs at half time is which
            // half they are about to play, and the paragraph above already says the
            // deals come back with the draw swapped. Same words as the strip and the
            // pad, so the three surfaces agree.
            "Play 2nd half"
          ) : (
            "Next deal"
          )}
        </button>

        {/* The same cards back, with the draw swapped. Only after a rubber dealt
            fresh: a session already plays every board twice, and returning a return
            match is a third run of the same cards. */}
        {carryOn ? (
          <button
            type="button"
            className="min-w-0 flex-1 rounded-xl border border-white/25 px-3 py-3 text-left"
            onClick={onPlaySameBoards ?? undefined}
          >
            <span className="block truncate text-base font-semibold">Same boards</span>
            <span className="mt-0.5 block truncate text-xs text-white/55">from the other side</span>
          </button>
        ) : null}
      </div>

      {/* The other half of "Waiting for X…". Moving on takes both, and without
          this a finished deal looks the same whether or not somebody is sitting
          there waiting on you. */}
      {opponentWaitingToContinue ? (
        <p className="text-xs text-white/50">
          {complete ? `${opponentName} wants another ${noun}` : `${opponentName} is ready`}
        </p>
      ) : null}

      {/* Said under the pair rather than inside the button that does it, which had no
          room for a sentence once the two sat side by side. */}
      {carryOn ? (
        <p className="text-xs text-white/50">
          The same deals again, with the draw swapped — you get the cards {opponentName} was
          offered.
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
    // From the session, never from the standing. For a two-game match the standing is
    // the *second game's*, and its winner is whoever won that game — so a player who
    // won on the total was being told the computer had taken it. Reported exactly that
    // way, and the recorded result was right all along, which is the worst shape for a
    // bug like this: the screen and the database disagreed and only the screen was
    // wrong.
    const winner = matchWinner;
    const drawn = winner === null;
    const won = winner === view.me;
    // Worked out here rather than waited for. The server is authoritative and
    // the next record fetch confirms it, but the moment worth showing is now.
    // A session is rated like a rubber or a mirror now — see `ratingsFor` for
    // what that concedes (no dedicated duplicate anchor, only the rubber one
    // standing in) — so it earns a line here too. This preview does not yet
    // know the per-match length weight the server applies there, only the
    // account's own settling-vs-settled step, so a long or short session's
    // shown delta can be a rough preview of the real one; the next fetch
    // still confirms the true number, the same tolerance the provisional
    // period already relies on.
    //
    // No rating line for a match on **repeated boards**, though: the computer
    // meets every one of them with perfect recall — which is the argument
    // that used to keep a mirror out too, until it was measured at +17 ± 34
    // rating points and the objection turned out to be about a quantity that
    // is zero. A mirror is rated; "Same boards back" is not.
    const rating = repeated ? null : ratingChange({ opponent: opponentRating, won });

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
            {/* **A mirror ends on the same three rows the strip carried all match.**
                Total, then each half — the figures a player has been reading the whole
                time, in the same order, one last time. Above and below the line are
                dropped here rather than kept: at the end of a pair they describe the
                *second half only*, which is a true statement about a thing nobody is
                asking about, sitting directly above the total that decides the match.

                Total leads rather than foots, because it is the verdict. On the strip
                it led for the same reason. */}
            {pairPoints === null ? (
              <>
                <Row label="Above the line" values={standing.rubber.aboveLine} view={view} />
                <Row
                  divider
                  label="Below the line"
                  values={standing.rubber.belowLineTotal}
                  view={view}
                />
                <Row emphasis label="Final score" values={totalScore(standing.rubber)} view={view} />
              </>
            ) : (
              <>
                <Row emphasis label="Total" values={pairPoints.both} view={view} />
                <Row divider label="1st half" values={pairPoints.first} view={view} />
                <Row label="2nd half" values={pairPoints.second} view={view} />
              </>
            )}
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

      {/* Half time. Said plainly, and deliberately *not* as a verdict: winning the
          first game of a pair decides nothing, and a screen announcing it would teach
          the opposite of how the format is scored. What it does say is the figure that
          will decide it. */}
      {halfDone && standing.kind === "rubber" ? (
        <div className="w-full max-w-sm text-sm">
          <p className="pb-1 text-xs tracking-wide text-white/45 uppercase">
            First half done &middot; one more to come
          </p>
          <Columns opponentName={opponentName} />
          <Row emphasis label="First half" values={totalScore(standing.rubber)} view={view} />
          <p className="pt-2 text-xs text-white/50">
            The same deals again, with the draw swapped. The two halves added together
            decide it.
          </p>
        </div>
      ) : null}

      {pad}

      {button}
    </div>
  );
}
