import { useState } from "react";
import { matchNoun } from "../game/labels.js";
import type { MatchRecord, OpponentRecord, Records } from "../game/records.js";
import { resetRecord, useRecentMatches, useRecords } from "../game/records.js";
import { RatingTrend } from "./RatingTrend.js";

export interface RecordProps {
  readonly signedIn: boolean;
  onBack(): void;
  onSignIn(): void;
}

/**
 * How long ago, in the roundest terms that are still true.
 *
 * Deleted once, when "last played" left the opponent row, and back because the
 * opened panel wants it: the list's most-recent-first order says *which* opponent
 * was played latest and nothing about when. Days are computed from local midnight
 * rather than by dividing a difference, so "yesterday" means the previous calendar
 * day and not twenty-four hours.
 */
export function whenPlayed(at: number): string {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.ceil((midnight.getTime() - at) / 86_400_000));
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  const months = Math.round(days / 30);
  return months <= 1 ? "a month ago" : `${months} months ago`;
}

/** The plural is given rather than guessed, because "matchs" is not a word. */
function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
}

/** A signed points figure, with the minus sign that reads as one rather than a hyphen. */
function signed(points: number, digits = 0): string {
  const size = Math.abs(points).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
  return `${points < 0 ? "−" : "+"}${size}`;
}

/**
/**
 * One number for how you are playing, rather than one per opponent.
 *
 * A rating is the only figure on this screen that is not *relative to somebody* —
 * which is exactly what a head-to-head table cannot give you, and why it sits above
 * the table rather than in it. It is comparable between two people who have never
 * played each other, because the computer is a fixed point they have both been
 * measured against; the server's `ratings.ts` has why that pinning is what makes the
 * whole thing mean anything.
 *
 * The match count is not decoration. At four rated matches the number is mostly the
 * 1500 everybody starts on, and saying so is the difference between a rating and a
 * guess wearing one's clothes.
 */
function Rating({
  rating,
}: {
  readonly rating: Records["rating"];
}): React.JSX.Element {
  // Over five matches, which is the shortest span worth calling recent — and a
  // number rather than a slope, because a number is what you would say out loud.
  const recent = rating.history.length < 6 ? null : rating.value - rating.history.at(-6)!.rating;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-3xl tabular-nums text-white">{rating.value}</span>
        <span className="text-xs text-white/45">
          your rating
          {rating.played === 0
            ? " · no rated matches yet"
            : ` · ${count(rating.played, "match", "matches")}`}
          {recent === null ? null : (
            <>
              {" · "}
              <span className={recent >= 0 ? "text-emerald-300/80" : "text-amber-200/70"}>
                {signed(recent)}
              </span>{" "}
              over 5
            </>
          )}
        </span>
      </div>
      <RatingTrend history={rating.history} />
    </div>
  );
}

/**
 * The column layout, shared by the header and every row so they cannot drift.
 *
 * Fixed widths rather than content-sized, which is the entire point: a column that
 * sizes to its own row puts the same figure in a different place on every line, and
 * then the eye has to parse each row from scratch. Fixed, it learns the positions
 * once. 384px of app minus the screen's 24px padding each side leaves 336px, and
 * the four numeric columns plus their gaps take 202 of it.
 */
const COLUMNS = "grid grid-cols-[1fr_40px_30px_60px_44px_12px] items-baseline gap-1.5";

/** The header, paid for once above the whole list rather than on every row. */
function ListHeader(): React.JSX.Element {
  return (
    <div className={`${COLUMNS} border-b border-white/15 pb-1`}>
      {/* The sixth is the chevron's column, and it is empty on purpose: labelling
          the control would be labelling the whole row, which is what the name
          already does. */}
      {["opponent", "w–l", "hands", "points", "diff", ""].map((label) => (
        <span
          key={label === "" ? "chevron" : label}
          className={`font-mono text-[0.55rem] tracking-wider text-white/40 uppercase ${label === "opponent" ? "" : "text-right"}`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Points for against points against, as a share of everything scored.
 *
 * The exact totals are gone from this screen, deliberately — three fuller versions
 * were drawn first and this is the one that read fastest, because "am I behind
 * against this person" turns out to be a question about proportion rather than
 * about two six-digit numbers. A bar answers it without a digit being read, and it
 * is *scale-aware* in a way the margin is not: +641 across 146 deals is a nearly
 * even bar, which is the truth of it, where the same +641 in nine deals would not
 * be.
 *
 * The totals still exist for a screen reader, which is the one place they are free.
 * For everyone else the individual match list below carries every game's own points.
 */
function PointsBar({
  against,
  points,
}: {
  readonly against: number;
  readonly points: number;
}): React.JSX.Element {
  const total = points + against;
  const share = total === 0 ? 0 : (points / total) * 100;

  return (
    <div className="flex h-1.5 self-center overflow-hidden rounded-sm bg-white/12">
      <span className="sr-only">
        {points.toLocaleString()} points for, {against.toLocaleString()} against
      </span>
      {total === 0 ? null : (
        <>
          <div className="h-full bg-emerald-300" style={{ width: `${share}%` }} />
          <div className="h-full bg-amber-300" style={{ width: `${100 - share}%` }} />
        </>
      )}
    </div>
  );
}

/**
 * One opponent, in one match format, on one line.
 *
 * `name · won–lost · hands · points · margin`, under one header at the top of the
 * list. Getting here took four shapes and the lesson is worth keeping: **what made
 * the original unreadable was not how many figures it held but that they did not
 * line up.** It was a sentence of middot-separated values, so the third figure sat
 * somewhere different on every row and each one had to be read from the beginning.
 * A fixed grid with the labels paid for once fixes that without dropping anything.
 *
 * A version with a captioned column per figure was drawn too, and repeating those
 * captions per opponent is what made it cost five lines each.
 *
 * **Hands sits beside the points rather than beside the record** because it is the
 * sample size — it is what makes a margin mean anything.
 *
 * Deals won and lost is not here and cannot be: `results` records a match winner, a
 * deal count and each side's points, with no per-deal outcome, so it would need a
 * column blank for every game already recorded. It is also weaker than the margin
 * beside it, since a deal can be passed out with nobody winning it.
 */
function OpponentLine({
  format,
  name,
  onToggle,
  open,
  record,
  robot,
}: {
  /** Named only when this opponent has a record in both formats. */
  readonly format: string | null;
  readonly name: string;
  onToggle(): void;
  readonly open: boolean;
  readonly record: OpponentRecord;
  readonly robot: boolean;
}): React.JSX.Element {
  const margin = record.pointsFor - record.pointsAgainst;

  return (
    <button
      type="button"
      aria-expanded={open}
      className={`${COLUMNS} w-full border-b border-white/7 py-1.5 text-left last:border-b-0 ${open ? "border-b-transparent bg-white/5" : ""}`}
      onClick={onToggle}
    >
      <span className="flex min-w-0 items-baseline gap-1">
        <span className={`truncate text-sm ${robot ? "text-white/60 italic" : ""}`}>{name}</span>
        {robot ? (
          <span className="shrink-0 rounded-sm bg-white/10 px-1 py-px font-mono text-[0.5rem] font-semibold tracking-wide text-white/40 uppercase">
            cpu
          </span>
        ) : null}
        {format === null ? null : (
          <span className="shrink-0 text-[0.6rem] text-white/35">{format}</span>
        )}
      </span>
      <span className="text-right font-mono text-xs tabular-nums">
        {record.won}–{record.lost}
      </span>
      <span className="text-right font-mono text-xs tabular-nums text-white/70">
        {record.deals.toLocaleString()}
      </span>
      <PointsBar against={record.pointsAgainst} points={record.pointsFor} />
      <span
        className={`text-right font-mono text-sm tabular-nums ${margin >= 0 ? "text-emerald-300" : "text-amber-200"}`}
      >
        {signed(margin)}
      </span>
      <svg
        aria-hidden="true"
        className={`self-center transition-transform ${open ? "rotate-180 text-white/55" : "text-white/30"}`}
        fill="none"
        height="10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
        viewBox="0 0 10 10"
        width="10"
      >
        <path d="M2 3.6 L5 6.6 L8 3.6" />
      </svg>
    </button>
  );
}

/**
 * Everything the row could not hold, for the one opponent whose row is open.
 *
 * The exact point totals — which the row draws only as a proportion — every rate
 * derived from them, and that opponent's own match history. **The captions are
 * affordable here in a way they were not on the row**: there is one open panel
 * rather than one per opponent, which is what made a captioned table cost five
 * lines a person.
 *
 * Each rate sits on the line of the total it came from, which is where a rate is
 * easiest to trust: `+641` and `+4.4 a deal` together rather than in separate
 * columns that have to be mentally paired.
 *
 * The history is capped server-side, so the count of matches shown is not the
 * number played. It says what it is not showing rather than presenting a partial
 * list as a whole one — and it is empty from a server too old to send it, which
 * reads as a record with no history rather than as an error.
 */
function OpponentPanel({
  myRating,
  record,
}: {
  /** The asker's own, so this one can be called above or below it. */
  readonly myRating: number;
  readonly record: OpponentRecord;
}): React.JSX.Element {
  const margin = record.pointsFor - record.pointsAgainst;
  const played = record.won + record.lost;
  const rate = (value: number, per: number): string => (per === 0 ? "—" : signed(value / per, 1));
  const older = played - record.matches.length;

  return (
    <div className="border-b border-white/7 bg-white/5 px-0.5 pt-1 pb-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 pb-2">
        <Fact label="Points">
          {record.pointsFor.toLocaleString()} <Dim>for</Dim> {record.pointsAgainst.toLocaleString()}{" "}
          <Dim>against</Dim>
        </Fact>
        <Fact label="Margin">
          <span className={margin >= 0 ? "text-emerald-300" : "text-amber-200"}>
            {signed(margin)}
          </span>{" "}
          <Dim>{rate(margin, record.deals)} a deal</Dim>
        </Fact>
        <Fact label="Matches">
          {played} <Dim>played</Dim> {record.won}–{record.lost}
        </Fact>
        <Fact label="Hands">
          {record.deals.toLocaleString()}{" "}
          <Dim>{played === 0 ? "—" : `${(record.deals / played).toFixed(1)} a match`}</Dim>
        </Fact>
        <Fact label="Rating">
          {record.rating}
          <Dim>{record.rating >= myRating ? "above you" : "below you"}</Dim>
        </Fact>
        <Fact label="Last played">
          <Dim>{whenPlayed(record.lastPlayed)}</Dim>
        </Fact>
      </dl>

      {record.matches.length === 0 ? null : (
        <>
          <p className="border-t border-white/8 pt-1 font-mono text-[0.55rem] tracking-wider text-white/35 uppercase">
            every match
          </p>
          {record.matches.map((match) => (
            <div
              key={match.finishedAt}
              className="grid grid-cols-[62px_1fr_26px_74px] items-baseline gap-1.5 py-0.5"
            >
              <span className="font-mono text-[0.65rem] text-white/40">
                {formatMatchTime(match.finishedAt)}
              </span>
              <span className="text-[0.68rem] text-white/40">{count(match.deals, "deal")}</span>
              <span
                className={`font-mono text-[0.55rem] font-semibold tracking-wide uppercase ${match.won ? "text-emerald-300" : "text-amber-200"}`}
              >
                {match.won ? "won" : "lost"}
              </span>
              <span className="text-right font-mono text-[0.7rem] tabular-nums text-white/70">
                {match.pointsFor.toLocaleString()}–{match.pointsAgainst.toLocaleString()}
              </span>
            </div>
          ))}
          {older <= 0 ? null : (
            <p className="pt-1 text-[0.65rem] text-white/30">
              {count(older, "older match", "older matches")} not shown
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** A label and its value, on one line of the panel's list. */
function Fact({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}): React.JSX.Element {
  return (
    <>
      <dt className="text-[0.7rem] text-white/40">{label}</dt>
      <dd className="m-0 text-right font-mono text-[0.74rem] tabular-nums text-white/80">
        {children}
      </dd>
    </>
  );
}

/** The unit or the rate beside a figure — present, and not competing with it. */
function Dim({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <span className="text-white/45">{children}</span>;
}

interface OpponentGroup {
  readonly game: OpponentRecord | null;
  readonly isRobot: boolean;
  readonly key: string;
  readonly name: string;
  readonly rubber: OpponentRecord | null;
}

function lastPlayedOf(group: Pick<OpponentGroup, "game" | "rubber">): number {
  return Math.max(group.game?.lastPlayed ?? 0, group.rubber?.lastPlayed ?? 0);
}

/**
 * One entry per opponent, whichever formats have been played against them —
 * rather than a rubber record and a game record against the same person
 * living in two different sections, which meant reading their name twice to
 * find out how things actually stand. The computer folds into the same list
 * rather than keeping its own heading, flagged instead: see `OpponentSection`.
 *
 * Grouped by `opponentKey`, not by name: two different people can happen to
 * share a display name, and grouping by the name itself would either merge
 * their rows into one section or silently drop one's rubber record in favor
 * of the other's. `opponentKey` is the one thing the server guarantees is
 * unique per real opponent — see its doc comment for why it is not simply
 * their account id.
 */
function groupByOpponent(records: Records): readonly OpponentGroup[] {
  const groups = new Map<string, Omit<OpponentGroup, "key">>();

  const fold = (record: OpponentRecord, isRobot: boolean): void => {
    const existing = groups.get(record.opponentKey) ?? {
      game: null,
      isRobot,
      name: record.name,
      rubber: null,
    };
    groups.set(record.opponentKey, {
      game: record.format === "game" ? record : existing.game,
      isRobot,
      name: record.name,
      rubber: record.format === "rubber" ? record : existing.rubber,
    });
  };

  for (const record of records.opponents) {
    fold(record, false);
  }
  for (const record of records.robot) {
    fold(record, true);
  }

  return [...groups.entries()]
    .map(([key, group]) => ({ key, ...group }))
    .sort((a, b) => lastPlayedOf(b) - lastPlayedOf(a));
}

/**
 * One opponent, with a row underneath for each format played against them.
 *
 * The computer is flagged rather than walled off under its own heading: a
 * networked match was witnessed by the server, which owned the state and
 * applied every rule, while one against the computer was played entirely in a
 * browser and is taken on its word. They are not the same kind of fact and
 * should not read as one — but naming that difference on the row itself is
 * enough; it does not need a whole section to itself to say it.
 */
/**
 * One opponent's rows, and the panel under whichever of them is open.
 *
 * One open at a time across the whole list — see `Body`. A panel breaks the column
 * alignment where it sits, which is the thing that makes the table readable, so
 * having several open at once would leave the list looking like the sentence this
 * replaced.
 */
function OpponentSection({
  group,
  myRating,
  onToggle,
  openRow,
}: {
  readonly group: OpponentGroup;
  /** See `OpponentPanel`. */
  readonly myRating: number;
  onToggle(row: string): void;
  /** `key|format` of the row whose panel is showing, or null. */
  readonly openRow: string | null;
}): React.JSX.Element {
  // Only worth naming when there are two of them to tell apart.
  const both = group.game !== null && group.rubber !== null;

  const row = (record: OpponentRecord, format: string | null): React.JSX.Element => {
    const id = `${group.key}|${record.format}`;
    const open = openRow === id;
    return (
      <>
        <OpponentLine
          format={format}
          name={group.name}
          open={open}
          record={record}
          robot={group.isRobot}
          onToggle={() => {
            onToggle(id);
          }}
        />
        {open ? <OpponentPanel myRating={myRating} record={record} /> : null}
      </>
    );
  };

  return (
    <>
      {group.rubber === null ? null : row(group.rubber, both ? "rubbers" : null)}
      {group.game === null ? null : row(group.game, both ? "single games" : null)}
    </>
  );
}

/**
 * When a match finished, in whatever timezone this device is currently set to.
 *
 * Precise to the minute rather than "3 days ago", because this is the individual
 * match list: telling two matches from the same afternoon apart is the whole job,
 * and how long ago they were is what the ordering says.
 */
function formatMatchTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function MatchRow({ match }: { readonly match: MatchRecord }): React.JSX.Element {
  return (
    <div className="border-t border-white/10 py-2 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate">
          <span className={match.won ? "text-emerald-300/80" : "text-amber-200/70"}>
            {match.won ? "Won" : "Lost"}
          </span>{" "}
          vs {match.opponentName}
        </span>
        <span className="shrink-0 font-mono text-sm tabular-nums text-white/70">
          {match.pointsFor.toLocaleString()}–{match.pointsAgainst.toLocaleString()}
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-white/40">
        <span>
          {matchNoun(match.format)} · {count(match.deals, "deal")}
        </span>
        <span>{formatMatchTime(match.finishedAt)}</span>
      </div>
    </div>
  );
}

/**
 * The individual matches behind the tallies above, newest first.
 *
 * A tally can say how a rivalry stands but not what was played last Tuesday
 * evening or how a string of wins actually happened one game at a time — this
 * is for that, so it stays a short, ungrouped list rather than another set of
 * sections.
 */
function RecentMatches({ signedIn }: { readonly signedIn: boolean }): React.JSX.Element | null {
  const { matches } = useRecentMatches(signedIn);

  if (matches === null || matches.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Recent matches</h2>
      <div>
        {matches.map((match) => (
          <MatchRow key={`${match.finishedAt}-${match.opponentName}`} match={match} />
        ))}
      </div>
    </div>
  );
}

/**
 * Forgetting the lot.
 *
 * Asks first, and the confirmation names what is actually lost — the same rule
 * §2.2 arrived at for leaving a game, and for the same reason: a warning that
 * does not say what goes only teaches people to tap through warnings.
 *
 * A rubber against a person stays on *their* record: it is one row holding both
 * sides of a game they also played, and taking a win off somebody else's
 * scoreboard is not this button's to do. That is named because nobody would
 * guess it.
 *
 * Achievements are a checkbox rather than a consequence. The two wishes are
 * genuinely different: a record is relative and ongoing, so clearing it is a
 * fresh start against the people you play — while a collection of titles has no
 * fresh start, and somebody starting a new season has no reason to give up a
 * Grand Slam they made in March. Off by default, because that is the less
 * destructive of the two and because the sentence above already promises
 * enough. Still one control rather than two: a second reset button elsewhere
 * would be two destructive things for one idea.
 */
function Reset({ onDone }: { onDone(): void }): React.JSX.Element {
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [alsoAchievements, setAlsoAchievements] = useState(false);

  const go = async (): Promise<void> => {
    setWorking(true);
    setFailed(false);
    const forgotten = await resetRecord({ achievements: alsoAchievements }).catch(() => null);
    setWorking(false);
    if (forgotten === null) {
      setFailed(true);
      return;
    }
    setAsking(false);
    onDone();
  };

  if (!asking) {
    return (
      <button
        type="button"
        className="self-start text-sm text-white/40 underline underline-offset-4"
        onClick={() => {
          setAsking(true);
        }}
      >
        Reset your record
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-white/15 px-4 py-3">
      <p className="text-sm text-white/70">
        Forget every match on your record? Games against the computer are deleted outright. Games
        against people leave your record but stay on theirs — they played them too.
      </p>
      {/* A checkbox rather than a line of prose, because it is a decision and
          not a warning. Labelled with what is lost rather than with the word
          "achievements" alone: "every title and every count" is the part worth
          thinking about for a second. */}
      <label className="mt-3 flex items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-amber-200"
          checked={alsoAchievements}
          onChange={(event) => {
            setAlsoAchievements(event.target.checked);
          }}
        />
        <span className="text-sm text-white/70">
          Reset achievements too — every title and every count back to nothing.
        </span>
      </label>
      <p className="mt-1 text-xs text-white/40">This cannot be undone.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-lg bg-amber-200 px-3 py-2 text-sm font-semibold text-stone-900 disabled:opacity-35"
          disabled={working}
          onClick={() => {
            void go();
          }}
        >
          {working ? "Forgetting…" : "Forget them"}
        </button>
        <button
          type="button"
          className="flex-1 rounded-lg border border-white/25 px-3 py-2 text-sm"
          disabled={working}
          onClick={() => {
            setAsking(false);
            setFailed(false);
            setAlsoAchievements(false);
          }}
        >
          Keep them
        </button>
      </div>
      {failed ? <p className="mt-2 text-sm text-amber-200">That did not work. Try again.</p> : null}
    </div>
  );
}

function Body({
  signedIn,
  onSignIn,
}: {
  readonly signedIn: boolean;
  onSignIn(): void;
}): React.JSX.Element {
  const { loading, records, reload } = useRecords(signedIn);
  // `key|format` of the one open row. Declared before the early returns below so
  // the hook order does not depend on whether there is anything to show.
  const [openRow, setOpenRow] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-white/60">
          A record needs somewhere to live that outlasts this browser. Sign in and the matches
          you have already played on this device come with you.
        </p>
        <button
          type="button"
          className="rounded-xl border border-white/25 px-4 py-3 text-base text-white"
          onClick={onSignIn}
        >
          Sign in
        </button>
      </div>
    );
  }
  if (loading && records === null) {
    return <p className="text-sm text-white/40">Looking up your record…</p>;
  }
  if (records === null) {
    return <p className="text-sm text-white/40">Could not load your record.</p>;
  }

  const groups = groupByOpponent(records);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-white/60">
        No finished matches yet. One counts when somebody has won it — an abandoned match is not
        scored.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Rating rating={records.rating} />
        <h2 className="text-lg font-semibold">Head to head</h2>
        <div>
          <ListHeader />
          {groups.map((group) => (
            <OpponentSection
              key={group.key}
              group={group}
              myRating={records.rating.value}
              openRow={openRow}
              onToggle={(row) => {
                // Tapping the open one closes it, which is the only way back to a
                // list that is purely a list.
                setOpenRow((current) => (current === row ? null : row));
              }}
            />
          ))}
        </div>
      </div>
      <RecentMatches signedIn={signedIn} />
      <Reset onDone={reload} />
    </div>
  );
}

/**
 * Who you have played and how it went.
 *
 * Its own screen rather than a panel in Settings. Settings is where you go to
 * change something and every row in it is short and bounded; this grows with
 * every person played. Scrolling past a scoreboard to reach a theme switch is
 * the wrong way round.
 *
 * Grouped by opponent rather than by match length — see `groupByOpponent` and
 * `OpponentSection`. A rubber and a game against the same person used to live
 * in two separate sections, which meant reading their name twice to answer
 * one question: how things stand with them.
 */
export function Record({ onBack, onSignIn, signedIn }: RecordProps): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-8">
        <h1 className="text-2xl font-semibold">Your record</h1>
        <Body signedIn={signedIn} onSignIn={onSignIn} />
      </div>

      <div className="px-6 pb-6">
        <button
          type="button"
          className="w-full rounded-xl border border-white/25 px-4 py-3.5 text-base text-white"
          onClick={onBack}
        >
          Back
        </button>
      </div>
    </div>
  );
}
