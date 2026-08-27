import { netTo, totalScore } from "@hb/engine";
import type {
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
  /** Deals played so far this rubber, including the one in progress. */
  readonly handsPlayed: number;
  readonly opponentName: string;
  /** Shown phase, same lag as `TopBar` — see its own doc for why. */
  readonly phase: DealPhase;
  /**
   * Both sides' ratings, either null until something has said.
   *
   * Here and nowhere else on the board. It sat beside the seat labels first,
   * which put it on the play screen only — so it was missing through the draw
   * and the auction, which is most of a deal. The standing strip is the one
   * place a figure about the two players is on screen the whole time, and a
   * rating shown intermittently invites reading its absence as a change.
   */
  readonly ratings: { readonly mine: number | null; readonly opponent: number | null };
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
  ratings,
}: {
  readonly opponentName: string;
  readonly ratings: { readonly mine: number | null; readonly opponent: number | null };
}): React.JSX.Element {
  const rated = ratings.mine !== null && ratings.opponent !== null;
  return (
    <p className="flex justify-end gap-2 text-[0.65rem] text-white/35">
      {/* Name and figure are separate spans rather than one string, so if a
          column ever is too narrow it is the *name* that gives — a shortened
          name is legible where half a rating is a different number. */}
      <span className={`${CELL} flex justify-end`}>
        <span className="truncate">You</span>
        {rated ? (
          <span className="shrink-0 tabular-nums">
            <span className="px-1 text-white/20">·</span>
            {ratings.mine}
          </span>
        ) : null}
      </span>
      <span className={`${CELL} flex justify-end`}>
        <span className="truncate">{opponentName}</span>
        {rated ? (
          <span className="shrink-0 tabular-nums">
            <span className="px-1 text-white/20">·</span>
            {ratings.opponent}
          </span>
        ) : null}
      </span>
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
 * A session's standing: **one signed score, and what the hand before it came to.**
 *
 * No two columns, and no boards. A rubber has two running totals because both sides
 * really do have one; a session has a single number that is positive or negative,
 * and drawing it twice — once negated — was the same fact said twice in the space a
 * phone has for five short rows. Boards went for the same reason: the total is the
 * sum of every hand's own score, so counting boards was arithmetic nobody needed to
 * follow.
 *
 * What replaced them is the fact the strip could not say at all: **whether this deal
 * is one you have played before**, and if so what it came to the first time. Which
 * board it is stays hidden — the replay order is random precisely so that
 * identifying it is the player's job.
 *
 * "Played before" hands you a number your memory was otherwise meant to supply, and
 * that is a deliberate trade rather than an oversight: it is the score, not the
 * cards, and knowing you were +170 on this deal does not tell you which
 * twenty-six cards are about to be offered.
 */
function playedBefore(summary: DuplicateSummary, seat: PlayerId): number | null {
  const current = summary.current;
  if (current === null || !current.replay) {
    return null;
  }
  const board = summary.boards[current.board];
  const first = board?.played.find((run) => !run.replay);
  return board === undefined || first === undefined ? null : netTo(board, first, seat);
}

function signed(value: number): string {
  return value === 0 ? "0" : `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}

function SessionRows({
  summary,
  view,
}: {
  readonly summary: DuplicateSummary;
  readonly view: PlayerView;
}): React.JSX.Element {
  const before = playedBefore(summary, view.me);

  return (
    <>
      {/* Always rendered, reading "—" on a deal nobody has seen, so the strip keeps
          the same number of rows from deal to deal. A row that came and went would
          move the board underneath it, which is the fault the format row just had. */}
      <p className="flex items-baseline justify-between gap-2 text-white/40">
        <span>Played before</span>
        <span className="tabular-nums text-white/60">
          {before === null ? "—" : signed(before)}
        </span>
      </p>
      <p className="flex items-baseline justify-between gap-2 text-white/40">
        <span>Score</span>
        <span className="font-semibold tabular-nums text-white/90">
          {signed(summary.margin[view.me])}
        </span>
      </p>
    </>
  );
}

/** The same two figures on one wrapping line, for a phone with no room for rows. */
function SessionFigures({
  summary,
  view,
}: {
  readonly summary: DuplicateSummary;
  readonly view: PlayerView;
}): React.JSX.Element {
  const before = playedBefore(summary, view.me);

  return (
    <>
      {before === null ? null : (
        <span className="whitespace-nowrap">
          Before <span className="tabular-nums text-white/60">{signed(before)}</span>
        </span>
      )}
      <span className="whitespace-nowrap">
        Score{" "}
        <span className="font-semibold tabular-nums text-white/90">
          {signed(summary.margin[view.me])}
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
function StandingLines({
  density,
  handsPlayed,
  opponentName,
  ratings,
  standing,
  view,
}: {
  readonly density: Density;
  readonly handsPlayed: number;
  readonly opponentName: string;
  readonly ratings: { readonly mine: number | null; readonly opponent: number | null };
  readonly standing: MatchStanding;
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
        {standing.kind === "duplicate" ? (
          <SessionFigures summary={standing.summary} view={view} />
        ) : (
          <>
            <Figure label="Total" values={totalScore(standing.rubber)} view={view} />
            <Figure label="Part" values={standing.rubber.partScore} view={view} />
            {standing.rubber.format === "rubber" ? (
              <Figure label="Games" values={standing.rubber.gamesWon} view={view} />
            ) : null}
          </>
        )}
        {/* Compact has no names to hang a rating on, so it says "Rated" and
            keeps the same you–them order as every other figure on the line. It
            is included rather than dropped because this *is* the always-visible
            score on a short phone, and leaving it out would hide the number
            from exactly the devices that cannot reach it anywhere else. One
            more item on a line that already wraps costs no height. */}
        {ratings.mine === null || ratings.opponent === null ? null : (
          <span className="whitespace-nowrap">
            Rated{" "}
            <span className="tabular-nums text-white/60">
              {ratings.mine}&ndash;{ratings.opponent}
            </span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="text-xs">
      <p className="pb-0.5 text-white/40">
        {standing.kind === "duplicate"
          ? `Deal ${handNumber} of ${standing.summary.boards.length * 2}`
          : `Hand #${handNumber}`}
        {standing.kind === "duplicate" && standing.summary.current?.replay === true
          ? " · replay"
          : ""}
      </p>
      {standing.kind === "duplicate" ? null : (
        <StandingHeader opponentName={opponentName} ratings={ratings} />
      )}
      {standing.kind === "duplicate" ? (
        <SessionRows summary={standing.summary} view={view} />
      ) : (
        <>
          <StandingRow label="Total" values={totalScore(standing.rubber)} view={view} />
          <StandingRow label="Part score" values={standing.rubber.partScore} view={view} />
          {standing.rubber.format === "rubber" ? (
            <StandingRow label="Games won" values={standing.rubber.gamesWon} view={view} />
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
  handsPlayed,
  onShowScore,
  opponentName,
  phase,
  ratings,
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
          handsPlayed={handsPlayed}
          opponentName={opponentName}
          ratings={ratings}
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
