import { GAME_THRESHOLD, firstPlayTotal, replayTotal, totalScore } from "@hb/engine";
import type {
  MatchFormat,
  DealPhase,
  DuplicateSummary,
  MatchStanding,
  Pair,
  PlayerId,
  PlayerView,
} from "@hb/engine";
import type { Density } from "../game/identity.js";
import { ContractText } from "./CardText.js";

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

function signed(value: number): string {
  return value === 0 ? "0" : `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}

/**
 * A session's standing: the total, and the two passes it is built from.
 *
 * Used to be one signed score plus "what this deal came to before" — right for a
 * session with no two-sided rubber under it, but it said nothing about how the two
 * *passes* through the boards compare, which is exactly the question mirror's own
 * strip answers for its two halves. First play and replay are that same question
 * asked of a duplicate session: not two sides of one score, since a session's total
 * is already a single number rather than a pair, but two subtotals of the runs seen
 * so far — one per pass — that sum to it. Replay reads "—" until at least one board's
 * second run exists, the same convention mirror's own not-yet-played half uses.
 *
 * "Played before" — the deal in hand's own earlier score — is gone rather than kept
 * alongside these: it answered a narrower question, this one board rather than the
 * session, and three rows was already the budget a duplicate standing has here.
 */
function SessionRows({
  summary,
  view,
}: {
  readonly summary: DuplicateSummary;
  readonly view: PlayerView;
}): React.JSX.Element {
  const first = firstPlayTotal(summary, view.me);
  const replay = replayTotal(summary, view.me);

  return (
    <>
      <p className="flex items-baseline justify-between gap-2 text-white/40">
        <span>Total</span>
        <span className="font-semibold tabular-nums text-white/90">
          {signed(summary.margin[view.me])}
        </span>
      </p>
      <p className="flex items-baseline justify-between gap-2 text-white/40">
        <span>First play</span>
        <span className="tabular-nums text-white/60">
          {first === null ? "—" : signed(first)}
        </span>
      </p>
      <p className="flex items-baseline justify-between gap-2 text-white/40">
        <span>Replay</span>
        <span className="tabular-nums text-white/60">
          {replay === null ? "—" : signed(replay)}
        </span>
      </p>
    </>
  );
}

/** The same three figures on one wrapping line, for a phone with no room for rows. */
function SessionFigures({
  summary,
  view,
}: {
  readonly summary: DuplicateSummary;
  readonly view: PlayerView;
}): React.JSX.Element {
  const first = firstPlayTotal(summary, view.me);
  const replay = replayTotal(summary, view.me);

  return (
    <>
      <span className="whitespace-nowrap">
        Total{" "}
        <span className="font-semibold tabular-nums text-white/90">
          {signed(summary.margin[view.me])}
        </span>
      </span>
      <span className="whitespace-nowrap">
        First play{" "}
        <span className="tabular-nums text-white/60">
          {first === null ? "—" : signed(first)}
        </span>
      </span>
      <span className="whitespace-nowrap">
        Replay{" "}
        <span className="tabular-nums text-white/60">
          {replay === null ? "—" : signed(replay)}
        </span>
      </span>
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
  density,
  format,
  handsPlayed,
  opponentName,
  standing,
  view,
}: {
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
        <span className="whitespace-nowrap">Hand {handNumber}</span>
        {standing.kind === "duplicate" ? (
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
      <p className="pb-0.5 text-white/40">
        {standing.kind === "duplicate"
          ? `Deal ${handNumber} of ${standing.summary.boards.length * 2}`
          : pair === null
            ? `Hand #${handNumber}`
            : `Half ${pair.half} of 2 · hand #${handNumber}`}
        {standing.kind === "duplicate" && standing.summary.current?.replay === true
          ? " · replay"
          : ""}
      </p>
      {standing.kind === "duplicate" ? null : (
        <StandingHeader opponentName={opponentName} />
      )}
      {standing.kind === "duplicate" ? (
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
          format={format}
          handsPlayed={handsPlayed}
          opponentName={opponentName}
          standing={standing}
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
