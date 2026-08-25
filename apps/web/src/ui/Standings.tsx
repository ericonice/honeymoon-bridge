import { DIFFICULTY_LABEL } from "../bot/difficulty.js";
import type { Difficulty } from "../bot/difficulty.js";
import { STARTING_RATING } from "../game/records.js";
import type { Standing, Standings as Board, StandingsState } from "../game/standings.js";

/**
 * Where everybody stands.
 *
 * **The one view in this app with no point of view.** Its neighbour answers "how
 * did you do against them" and reports a points-for; this is a list of other
 * people, and the only thing on it that is the reader's is the row drawn as
 * theirs. That is why it is a view of its own rather than another section of
 * "Your record", and why a rating — the one figure over there that is not
 * relative to anybody — is what links the two.
 *
 * A leaderboard in a family-sized pool would normally say nothing: Elo conserves
 * points, so people who only play each other trade the same points back and
 * forth. **The computer is what makes the ordering mean something**, which is why
 * its rungs are drawn in the list rather than left off — see `pinnedOpponents` on
 * the server.
 */

/** The columns, shared by the header and every row so they cannot drift. */
const COLUMNS = "grid grid-cols-[22px_1fr_52px_34px] items-baseline gap-1.5";

function ListHeader(): React.JSX.Element {
  return (
    <div className={`${COLUMNS} border-b border-white/15 pb-1`}>
      {/* The first is the rank's column and is left unlabelled: a column of
          1, 2, 3 beside a name needs no word above it, and "#" reads as noise. */}
      {["", "player", "rating", "played"].map((label) => (
        <span
          key={label === "" ? "rank" : label}
          className={`font-mono text-[0.55rem] tracking-wider text-white/40 uppercase ${
            label === "player" ? "" : "text-right"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * What to call a row.
 *
 * The computer's releases have names — see `bot/release.ts` — and they appear in
 * Settings and nowhere else, because a first name in the seat opposite promises a
 * personality that is not there. A board is no different: what matters about these
 * rows is which rung they are, since that is the thing a person chose to play.
 */
function standingName(row: Standing): string {
  if (row.name !== null) {
    return row.name;
  }
  const rung = row.difficulty === null ? null : DIFFICULTY_LABEL[row.difficulty as Difficulty];
  return rung === undefined || rung === null ? "The computer" : `The computer · ${rung}`;
}

/**
 * One line of the board.
 *
 * Three weights rather than one, because the rows are three different kinds of
 * thing: your own row is what you came to read, another player's is what it is
 * measured against, and a computer's is a mark on the scale rather than a
 * competitor. Drawn by weight instead of by colour — the tiers already own colour
 * as a ranking in this app, and a leaderboard is not a ranking of that kind.
 */
function Row({ row }: { readonly row: Standing }): React.JSX.Element {
  const computer = row.name === null;
  const tone = row.you ? "text-white" : computer ? "text-white/40" : "text-white/70";

  return (
    <div className={`${COLUMNS} py-1.5 ${row.you ? "font-medium" : ""} ${tone}`}>
      <span className="font-mono text-[0.7rem] tabular-nums text-right text-white/45">
        {row.rank ?? ""}
      </span>
      <span className="truncate text-sm">
        {standingName(row)}
        {row.you ? <span className="text-white/45"> · you</span> : null}
      </span>
      <span className="font-mono text-sm tabular-nums text-right">{row.rating}</span>
      <span className="font-mono text-[0.7rem] tabular-nums text-right text-white/40">
        {row.played ?? ""}
      </span>
    </div>
  );
}

/**
 * The players whose numbers are still mostly the number everybody starts on.
 *
 * Listed rather than hidden, and unranked rather than sorted in among the rest,
 * for the reason the rating chart shades its opening stretch instead of trimming
 * it: one win over the strongest computer puts a brand-new player above somebody
 * settled, and that is the starting 1500 talking. Saying so explains both the
 * number and why it is not in the ranking.
 */
function Settling({ board }: { readonly board: Board }): React.JSX.Element | null {
  if (board.settling.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <h3 className="font-mono text-[0.55rem] tracking-wider text-white/40 uppercase">settling</h3>
      <p className="text-xs text-white/45">
        Under {board.settledAfter} rated matches, so these are still mostly the{" "}
        {STARTING_RATING} everybody starts on.
      </p>
      <div>
        {board.settling.map((row, index) => (
          <Row key={index} row={row} />
        ))}
      </div>
    </div>
  );
}

/**
 * The board, or what can be said instead.
 *
 * Handed its state rather than fetching its own, so the fetch belongs to the
 * screen that outlives the switch between the two views: swapping back and forth
 * then costs nothing, where a hook in here would reload the whole pool every time
 * somebody looked at their own record and came back.
 */
export function Standings({ loading, standings }: StandingsState): React.JSX.Element {
  if (standings === null) {
    return (
      <p className="text-sm text-white/40">
        {loading ? "Looking up the standings…" : "Could not load the standings."}
      </p>
    );
  }

  if (standings.ranked.length === 0 && standings.settling.length === 0) {
    return (
      <p className="text-sm text-white/60">
        Nobody has a rating yet. One starts the first time somebody finishes a match.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <ListHeader />
        {standings.ranked.map((row, index) => (
          <Row key={index} row={row} />
        ))}
      </div>
      <Settling board={standings} />
      {/* The one thing a board of numbers cannot say about itself. Kept to a
          sentence: the record screen's rating block is where the longer version
          of this argument belongs, and the server's `ratings.ts` has all of it. */}
      <p className="text-xs text-white/40">
        The computer's ratings are fixed, which is what makes everybody else's
        comparable — including two people who have never played each other.
      </p>
    </div>
  );
}
