import { GAME_THRESHOLD, sessionSplit, totalScore } from "@hb/engine";
import type {
  Contract,
  MatchFormat,
  DealPhase,
  DuplicateSummary,
  FieldSummary,
  MatchStanding,
  Pair,
  PlayerId,
  PlayerView,
} from "@hb/engine";
import { ORDER_LABEL } from "../game/identity.js";
import { ContractText } from "./CardText.js";
import type { Density } from "../game/identity.js";

export interface ContractBarProps {
  /** How much room this strip may take — see `Density`. */
  readonly density: Density;
  /**
   * What is being played, which the standing cannot always say for itself.
   *
   * A two-game match's halves each *are* a single game, standing and all, so without
   * this the strip reads as one game throughout and its total is half the story.
   */
  readonly format: MatchFormat;
  /** Deals played so far this rubber, including the one in progress. */
  readonly handsPlayed: number;
  readonly opponentName: string;
  /** Shown phase, same lag as `TopBar` — see its own doc for why. */
  readonly phase: DealPhase;
  readonly standing: MatchStanding;
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
  outOf,
  outOfWord,
  values,
  view,
}: {
  readonly label: string;
  /** A denominator, for a figure that is progress rather than money. */
  readonly outOf?: number;
  /**
   * "0 of 2" rather than "0/2" — a count of games reads as a sentence, where a
   * part score reads as a fraction of a hundred points. Slash stays the
   * default so Part score is untouched.
   */
  readonly outOfWord?: boolean;
  /** Null for a game not yet played — dashes rather than a zero nobody scored. */
  readonly values: Pair<number> | null;
  readonly view: PlayerView;
}): React.JSX.Element {
  const denominator = outOf === undefined ? "" : outOfWord === true ? ` of ${outOf}` : `/${outOf}`;
  const pair = values === null ? "—" : `${values[view.me]}–${values[view.opponent]}${denominator}`;

  return (
    <span className="whitespace-nowrap">
      {label}{" "}
      <span className={`tabular-nums ${values === null ? "text-white/25" : "text-white/60"}`}>
        {pair}
      </span>
    </span>
  );
}

// Wide enough for "Computer · 1400" whole, which is what the header carries: a
// name and, beside it, that side's rating. Sized off the longest thing it will
// ever hold rather than off the numbers underneath — w-14 clipped "Computer"
// alone and w-[5.5rem] clipped it again once the rating was added, which is the
// mistake this width exists to stop repeating. Ratings only ever appear against
// the computer (a person's rating is theirs and does not travel), so "Computer"
// really is the longest name this has to fit.
//
// Not wider still, and the ceiling is arithmetic rather than taste: the frame is
// `max-w-md` with `px-4`, so the narrowest phone worth supporting leaves 288px.
// Two of these plus the gaps plus "Part score" comes to 286. `w-28` would be
// 302, and the row does not overflow — the label shrinks and wraps instead,
// which is a worse failure than it sounds because it moves one row out of line
// with the rest.
const CELL = "w-[6.5rem] text-right tabular-nums";

/**
 * Which of the two columns is which, stated once rather than on every row below.
 *
 * Carries each side's rating too, under its own name. **A rating belongs to a
 * person, not to this deal** — so it sits with the name rather than as a row of
 * the standing, where it would read as another figure the rubber is made of.
 * Under rather than beside, because the columns are fixed width so the numbers
 * below line up, and "Bobby Orr 1400" does not fit one on a phone.
 *
 * Drawn only when both are known. One alone invites comparing it with the blank
 * beside it, which is half a comparison — the same reason `botAnchor` returns
 * null rather than a guess.
 */
function StandingHeader({
  opponentName,
}: {
  readonly opponentName: string;
}): React.JSX.Element {
  return (
    <p className="flex justify-end gap-2 text-[0.65rem] text-white/35">
      <span className={`${CELL} truncate`}>You</span>
      <span className={`${CELL} truncate`}>{opponentName}</span>
    </p>
  );
}

function StandingRow({
  label,
  outOf,
  outOfWord,
  values,
  view,
}: {
  readonly label: string;
  /**
   * Null for a game that has not been played yet, drawn as dashes.
   *
   * A row rather than nothing, so the strip has the same rows in the same places all
   * match. Zeroes would be the other option and they would be a lie: nobody has scored
   * nothing in the second game, there is no second game.
   */
  readonly values: Pair<number> | null;
  /**
   * A denominator, for a figure that is progress rather than money.
   *
   * **The part score is a different kind of number from the ones above it** and looked
   * like one of them: Total, 1st and 2nd are points banked, where this resets when a
   * game is won and is already counted inside all three. Sitting in the same column of
   * plain figures it invites being added to them, which is exactly wrong. A denominator
   * cannot be mistaken for money — and it answers the question actually being asked
   * mid-auction, which is how much more is needed.
   */
  readonly outOf?: number;
  /**
   * "0 of 2" rather than "0/2" — see `Figure`'s own doc. Games won is a count,
   * not a fraction of a target the way Part score is.
   */
  readonly outOfWord?: boolean;
  readonly view: PlayerView;
}): React.JSX.Element {
  const figure = (player: PlayerId): string =>
    values === null
      ? "—"
      : outOf === undefined
        ? String(values[player])
        : outOfWord === true
          ? `${values[player]} of ${outOf}`
          : `${values[player]}/${outOf}`;

  return (
    <p className="flex items-baseline justify-between gap-2">
      <span className="text-white/55">{label}</span>
      <span className="flex gap-2">
        <span className={`${CELL} ${values === null ? "text-white/25" : ""}`}>
          {figure(view.me)}
        </span>
        <span className={`${CELL} ${values === null ? "text-white/25" : "text-white/60"}`}>
          {figure(view.opponent)}
        </span>
      </span>
    </p>
  );
}

/**
 * A placing, or a dash for a session no board of which has come back yet.
 *
 * A dash rather than "0%", which would be a real and terrible result rather than the
 * absence of one — the same distinction every other figure in this app draws between
 * nothing scored and nothing known.
 */
function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function signed(value: number): string {
  return value === 0 ? "0" : `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}

/**
 * A session's standing: what is decided, and how much is still riding on stocks that
 * have not come back.
 *
 * **Total led this strip and has been dropped, because it is not a score.** A board is
 * worth the difference between its two runs, so a deal whose stock nobody has answered
 * yet contributes whatever this seat happened to make on it — early in a session that is
 * mostly a statement about the cards. `DuplicateSummary.margin` runs per deal on purpose
 * and its own doc says why; the mistake was letting the honest running figure be the one
 * the player reads as their standing. Under `shuffled`, which puts no floor on the gap at
 * all, a session can go a long way with nothing settled while that number moves the whole
 * time. Reported as having no clear way of knowing how you are doing.
 *
 * So **Settled**, and nothing else: the real duplicate score, boards both runs of which
 * are in and the luck cancelled. At the end there is nothing out and Settled *is* the
 * total, which is why dropping Total costs no final figure.
 *
 * **A second row said what was still out, and it argued against itself.** A board's
 * margin is your net in run 1 plus your net in run 2 — you hold one stream in each, so
 * the cards cancel across the pair. A board still out has contributed only its run-1
 * net, luck of the stream included, so a large positive there usually means you held the
 * good cards and are about to hand them back. Drawn as a credit it read as money in the
 * bank and was a warning. **And the count was redundant anyway**: `Settled 1/5` already
 * says four are out. Reported as not helpful, which it was, twice over.
 *
 * `sessionSplit` still returns both halves, because the sum is what makes Settled
 * checkable against the total; only the drawing of the second one is gone.
 *
 * **The currency is named on the settled row** rather than implied by which rows exist,
 * which also removed an old asymmetry: IMPs used to get one row where points got two,
 * because `margin` already summed closed boards only.
 *
 * Earlier shapes, so they are not re-proposed: one signed score plus "what this deal came
 * to before", which answered a narrower question — this one board rather than the
 * session; and first-play/replay subtotals, one per pass through the boards, which is a
 * split by *when* rather than by what is decided, and is the same mistake `SessionPad`'s
 * feet made until it was measured.
 */
/**
 * A Doop session's standing: where you are placing, and nothing else most of the time.
 *
 * **The count of ranked boards is only drawn when it is not the whole story.** It read
 * `Ranked 1/1` next to `Placing 59%` — two figures side by side, one of them a real
 * score and the other a diagnostic that says `N/N` on every ordinary deal. Reported
 * as not understandable, which it was: a row that almost always says the same thing
 * teaches the eye to skip it, so the one moment it matters is the moment it is missed.
 *
 * It matters when §1.8a's fetch has not come back — the field arrives only after the
 * deal, and may never — because a placing over four boards of six is a weaker claim
 * than a placing over six. So that is when it speaks, and it says what is wrong rather
 * than a fraction the reader has to interpret.
 */
function waitingFor(summary: FieldSummary): string | null {
  const waiting = summary.boardsPlayed - summary.boardsRanked;
  return waiting <= 0 ? null : `${waiting} board${waiting === 1 ? "" : "s"} not back yet`;
}

function FieldRows({ summary }: { readonly summary: FieldSummary }): React.JSX.Element {
  const waiting = waitingFor(summary);
  return (
    <>
      <p className="flex items-baseline justify-between gap-2 text-white/40">
        <span>Placing</span>
        <span className="font-semibold tabular-nums text-white/90">
          {percent(summary.percentage)}
        </span>
      </p>
      {waiting === null ? null : (
        <p className="flex justify-end text-white/40">
          <span className="text-[0.65rem]">{waiting}</span>
        </p>
      )}
    </>
  );
}

/** The same, on one wrapping line, for the compact strip. */
function FieldFigures({ summary }: { readonly summary: FieldSummary }): React.JSX.Element {
  const waiting = waitingFor(summary);
  return (
    <>
      <span className="whitespace-nowrap">
        Placing{" "}
        <span className="font-semibold tabular-nums text-white/90">
          {percent(summary.percentage)}
        </span>
      </span>
      {waiting === null ? null : <span className="whitespace-nowrap">{waiting}</span>}
    </>
  );
}

function SessionRows({
  summary,
  view,
}: {
  readonly summary: DuplicateSummary;
  readonly view: PlayerView;
}): React.JSX.Element {
  const split = sessionSplit(summary, view.me);

  return (
    <>
      {/* **Settled leads, and it is the only figure here that is a score.** The running
          total used to lead and is honest arithmetic rather than a standing: a board is
          worth the difference between its two runs, so until a stock comes back this
          seat's figure on it is mostly what the cards were. See `sessionSplit`. */}
      <p className="flex items-baseline justify-between gap-2 text-white/40">
        <span>
          Settled{summary.scoring === "imps" ? " (IMPs)" : ""} {summary.closed}/
          {summary.boards.length}
        </span>
        <span className="font-semibold tabular-nums text-white/90">
          {signed(split.settled)}
        </span>
      </p>
      {pointsWorthShowing(summary) ? (
        <p className="flex items-baseline justify-between gap-2 text-white/40">
          <span>Points</span>
          <span className="tabular-nums text-white/60">{signed(runningPoints(summary, view))}</span>
        </p>
      ) : null}
    </>
  );
}

/**
 * The session's running score in **points**, whatever it is being scored in.
 *
 * **Under IMPs there is otherwise nothing alive on this strip**, and that is the format
 * rather than an oversight: `impsFor` converts a board's *margin*, an open board has no
 * margin, so an IMPs session's own figure counts closed boards only and cannot move
 * until a stock repeats. Under a shuffled order that is most of the first half.
 * Reported as there being no score until both halves are played, which is literally
 * true there and only loosely true under points.
 *
 * Points are available every deal even in an IMPs session — the engine scores each deal
 * in points and only *converts* at the board — so this is a real figure rather than an
 * invented one, and it is `summary.points` rather than a fresh fold: the gross totals
 * differ by exactly the sum of every run's net, which is what makes them the same
 * quantity the points-scored session shows as its own total.
 */
function runningPoints(summary: DuplicateSummary, view: PlayerView): number {
  return summary.points[view.me] - summary.points[view.opponent];
}

/**
 * Whether that figure says anything the settled one does not.
 *
 * **Under IMPs, always**: the two are different units and neither implies the other.
 * Under points they are the same quantity and converge exactly when the last board comes
 * back — so it is shown only while a board is still open, which is the one time it
 * differs. Printing one number twice is what kept IMPs to a single row in the first
 * place, and the rule is the same one read from the other side.
 */
function pointsWorthShowing(summary: DuplicateSummary): boolean {
  return summary.scoring === "imps" || summary.closed < summary.boards.length;
}

/** The same figure(s) on one wrapping line, for a phone with no room for rows. */
function SessionFigures({
  summary,
  view,
}: {
  readonly summary: DuplicateSummary;
  readonly view: PlayerView;
}): React.JSX.Element {
  const split = sessionSplit(summary, view.me);

  return (
    <>
      <span className="whitespace-nowrap">{ORDER_LABEL[summary.schedule]}</span>
      <span className="whitespace-nowrap">
        Settled{summary.scoring === "imps" ? " (IMPs)" : ""} {summary.closed}/
        {summary.boards.length}{" "}
        <span className="font-semibold tabular-nums text-white/90">
          {signed(split.settled)}
        </span>
      </span>
      {pointsWorthShowing(summary) ? (
        <span className="whitespace-nowrap">
          Points{" "}
          <span className="tabular-nums text-white/60">{signed(runningPoints(summary, view))}</span>
        </span>
      ) : null}
    </>
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
/** The pair's running total, which is the figure a two-game match is decided on. */
function pairTotal(earlier: Pair<number> | null, here: Pair<number>): Pair<number> {
  return earlier === null ? here : [earlier[0] + here[0], earlier[1] + here[1]];
}

function StandingLines({
  contract,
  density,
  format,
  handsPlayed,
  opponentName,
  standing,
  view,
}: {
  /** The contract, once the *shown* phase has one. Null through the draw and auction. */
  readonly contract: Contract | null;
  readonly density: Density;
  readonly format: MatchFormat;
  readonly handsPlayed: number;
  readonly opponentName: string;
  readonly standing: MatchStanding;
  readonly view: PlayerView;
}): React.JSX.Element {
  /**
   * A two-game match is the one format whose standing does not say what it is.
   *
   * Each half *is* a single game and its standing is exactly a single game's, so the
   * strip would read as one all the way through and the total on it would be half the
   * story. The format has to come from outside the standing, and which half from
   * whether an earlier one has been carried in.
   */
  const pair =
    format === "mirror" && standing.kind === "rubber"
      ? {
          earlier: standing.previousPoints,
          half: standing.previousPoints === null ? 1 : 2,
        }
      : null;
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
        {/* A session knows how long it is, so the count says how far through you are
            rather than only where you are. A rubber does not — it ends when somebody
            wins it — so it keeps a bare number. */}
        <span className="whitespace-nowrap">
          {standing.kind === "field"
            ? `Board ${handNumber} of ${standing.summary.boards}`
            : standing.kind === "duplicate"
              ? `Deal ${handNumber} of ${standing.summary.boards.length * 2}`
              : `Hand ${handNumber}`}
        </span>
        {/* Compact is the always-visible score on a short phone, so it needs the
            contract for the same reason the full strip does — and as a wrapping item
            rather than a row, which is what this layout is. */}
        {contract === null ? null : (
          <span className="whitespace-nowrap text-white/85">
            <ContractText contract={contract} on="dark" />{" "}
            <span className="text-white/50">
              {contract.declarer === view.me ? "by you" : `by ${opponentName}`}
            </span>
          </span>
        )}
        {standing.kind === "field" ? (
          <FieldFigures summary={standing.summary} />
        ) : standing.kind === "duplicate" ? (
          <SessionFigures summary={standing.summary} view={view} />
        ) : (
          <>
            {pair === null ? null : (
              <span className="whitespace-nowrap">Half {pair.half} of 2</span>
            )}
            <Figure
              label="Total"
              values={pairTotal(pair?.earlier ?? null, totalScore(standing.rubber))}
              view={view}
            />
            {pair === null ? null : (
              <>
                <Figure
                  label="1st half"
                  values={pair.half === 1 ? totalScore(standing.rubber) : pair.earlier}
                  view={view}
                />
                <Figure
                  label="2nd half"
                  values={pair.half === 2 ? totalScore(standing.rubber) : null}
                  view={view}
                />
              </>
            )}
            <Figure
              label="Part"
              outOf={GAME_THRESHOLD}
              values={standing.rubber.partScore}
              view={view}
            />
            {standing.rubber.format === "rubber" ? (
              <Figure label="Games" outOf={2} outOfWord values={standing.rubber.gamesWon} view={view} />
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="text-xs">
      <p className="flex items-baseline justify-between gap-2 pb-0.5 text-white/40">
        <span className="min-w-0 truncate">
          {standing.kind === "field"
            ? `Board ${handNumber} of ${standing.summary.boards}`
            : standing.kind === "duplicate"
              ? `Deal ${handNumber} of ${standing.summary.boards.length * 2}`
              : pair === null
                ? `Hand #${handNumber}`
                : `Half ${pair.half} of 2 · hand #${handNumber}`}
          {standing.kind === "duplicate" && standing.summary.current?.replay === true
            ? " · replay"
            : ""}
          {standing.kind === "duplicate" ? ` · ${ORDER_LABEL[standing.summary.schedule]}` : ""}
        </span>
        {/* **The contract, on the right of the row that is already about the deal.**
            This row says which hand you are on; the money is on the rows beneath it.
            So a contract belongs here and not there — and the row exists in every
            phase, so the right-hand half is simply empty until there is a contract
            rather than a row appearing when play starts and pushing the board down.

            It has now been in three other places. Inside the score proper, where it
            grew that extra row; on the declarer's own `SeatLabel`, which is
            deliberately the quietest thing on the board and so the wrong home for
            something you go looking for; and in the top bar's headline, which names
            the *phase* in every other state and should not mean two kinds of thing. */}
        {contract === null ? null : (
          <span className="shrink-0 text-white/85">
            <ContractText contract={contract} on="dark" />{" "}
            <span className="text-white/50">
              {contract.declarer === view.me ? "by you" : `by ${opponentName}`}
            </span>
          </span>
        )}
      </p>
      {standing.kind === "duplicate" || standing.kind === "field" ? null : (
        <StandingHeader opponentName={opponentName} />
      )}
      {standing.kind === "field" ? (
        <FieldRows summary={standing.summary} />
      ) : standing.kind === "duplicate" ? (
        <SessionRows summary={standing.summary} view={view} />
      ) : (
        <>
          {/* **Three rows, always, whichever half is being played.** The first version
              changed the label on the running figure and grew a fourth row at half
              time, so the strip you had learned to read became a different strip
              halfway through the match — and the row that appeared moved everything
              under it. Total is the match, This game is the half in hand, Part score is
              what is still below the line. During the first game the top two agree,
              which is the truth rather than a redundancy: the match *is* that game so
              far. */}
          <StandingRow
            label="Total"
            values={pairTotal(pair?.earlier ?? null, totalScore(standing.rubber))}
            view={view}
          />
          {/* Named halves rather than "this game", so a row means the same thing all
              match. "This game" pointed at a different game depending on when you read
              it, which is the one thing a fixed row must not do. The half not yet
              played is dashes, not zeroes: nobody has scored nothing in it. */}
          {pair === null ? null : (
            <>
              <StandingRow
                label="1st half"
                values={pair.half === 1 ? totalScore(standing.rubber) : pair.earlier}
                view={view}
              />
              <StandingRow
                label="2nd half"
                values={pair.half === 2 ? totalScore(standing.rubber) : null}
                view={view}
              />
            </>
          )}
          {/* Ruled off from the three above it, which are all money. This one is
              progress toward the next game — it resets when one is won, and it is
              already inside every total above. The rule says "different group" and the
              denominator says "different kind of number". */}
          <div className="mt-0.5 border-t border-white/10 pt-0.5">
            <StandingRow
              label="Part score"
              outOf={GAME_THRESHOLD}
              values={standing.rubber.partScore}
              view={view}
            />
          </div>
          {standing.rubber.format === "rubber" ? (
            <StandingRow label="Games won" outOf={2} outOfWord values={standing.rubber.gamesWon} view={view} />
          ) : null}
        </>
      )}
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
  format,
  handsPlayed,
  onShowScore,
  opponentName,
  phase,
  standing,
  view,
}: ContractBarProps): React.JSX.Element | null {
  // **The contract and the trick count have left this strip**, which is the score and
  // now only the score. They sat here through play and were absent through the draw
  // and the auction, so the strip grew a row mid-deal and pushed the whole board down
  // — the fault Home's note line had to be pinned to avoid. The contract is on the
  // declarer's own `SeatLabel` instead, where whose it is needs no words; the trick
  // count is simply gone, because `TrickRing` already counts each side *down* to what
  // it still needs, which is the question being asked.
  //
  // So there is nothing left to draw once the deal is over: the reveal underneath
  // already says what the contract made.
  if (phase === "complete") {
    return null;
  }

  // The *shown* phase rather than `view.phase` — see `TopBar`'s own doc: the auction's
  // closing screen is still up for a beat after the engine has moved on, and the
  // contract it has just announced does not want repeating an inch below it.
  const contract = phase === "play" ? view.contract : null;

  const content = (
    <StandingLines
      contract={contract}
      density={density}
      format={format}
      handsPlayed={handsPlayed}
      opponentName={opponentName}
      standing={standing}
      view={view}
    />
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
