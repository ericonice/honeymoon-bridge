import { Fragment, useState } from "react";
import type { MatchFormat } from "@hb/engine";
import { formatName, formatPlural } from "../game/labels.js";
import type { MatchRecord, OpponentMatch, OpponentRecord, Records } from "../game/records.js";
import { resetRecord, useRecentMatches, useRecords } from "../game/records.js";
import { useStandings } from "../game/standings.js";
import { useSwipeBack } from "../game/swipeBack.js";
import { BackButton } from "./BackButton.js";
import { RatingTrend } from "./RatingTrend.js";
import { Standings } from "./Standings.js";

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

/** A place, written the way it is said. Only ever a small number here. */
function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) {
    return `${place}th`;
  }
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[place % 10] ?? "th";
  return `${place}${suffix}`;
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
          {/* Where the number stands, which is the one fact about the pool that is
              about *you* — so it rides here while the list of everybody else is a
              view of its own. Absent while the rating is settling, and from a
              server too old to say. */}
          {rating.rank === null || rating.rank === undefined || rating.of === null || rating.of === undefined
            ? null
            : ` · ${ordinal(rating.rank)} of ${rating.of}`}
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

const SPARKLINE_WIDTH = 60;
const SPARKLINE_HEIGHT = 16;

/**
 * Cumulative margin against this opponent, over the matches this screen still
 * holds — up to `MATCHES_PER_OPPONENT`, oldest to newest so it reads the same
 * direction the rating trend does.
 *
 * **Replaces a proportion bar of the point totals, and answers a different
 * question.** "Am I ahead against this person" was a fair question for a bar to
 * answer, but the answer sat still — a single ratio cannot say whether that lead
 * is widening or has been shrinking for months, which is the more interesting
 * fact once the plain total is already on screen as the margin figure beside it.
 * Below two matches there is no direction to draw, only a result the margin
 * figure already states, so this renders nothing rather than one dot pretending
 * to be a trend.
 */
function MarginSparkline({ matches }: { readonly matches: readonly OpponentMatch[] }): React.JSX.Element | null {
  if (matches.length < 2) {
    return null;
  }
  // Newest first coming in — see `results.ts` — reversed so the line reads left
  // to right the way it actually happened.
  let running = 0;
  const cumulative = [...matches]
    .reverse()
    .map((match) => (running += match.pointsFor - match.pointsAgainst));

  const low = Math.min(0, ...cumulative);
  const high = Math.max(0, ...cumulative);
  const span = high - low || 1;
  const x = (index: number): number =>
    (index / (cumulative.length - 1)) * (SPARKLINE_WIDTH - 2) + 1;
  const y = (value: number): number =>
    SPARKLINE_HEIGHT - 2 - ((value - low) / span) * (SPARKLINE_HEIGHT - 4);

  const path = cumulative
    .map((value, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`)
    .join(" ");
  const final = cumulative[cumulative.length - 1]!;
  const ahead = final >= 0;

  return (
    <svg
      aria-hidden="true"
      className="self-center"
      height={SPARKLINE_HEIGHT}
      preserveAspectRatio="none"
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      width={SPARKLINE_WIDTH}
    >
      {/* Zero, not the average — this is a running total against a fixed opponent
          rather than a spread of independent results, so "level" is the one
          reference line that means something drawn over it. */}
      <line
        className="stroke-white/15"
        strokeDasharray="1.5 1.5"
        x1={0}
        x2={SPARKLINE_WIDTH}
        y1={y(0)}
        y2={y(0)}
      />
      <path
        className={ahead ? "stroke-emerald-300" : "stroke-amber-200"}
        d={path}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.4}
      />
      <circle
        className={ahead ? "fill-emerald-300" : "fill-amber-200"}
        cx={x(cumulative.length - 1)}
        cy={y(final)}
        r={1.6}
      />
    </svg>
  );
}

/** Says a record was taken on a browser's word rather than witnessed by the server. */
function RobotTag(): React.JSX.Element {
  return (
    <span className="shrink-0 rounded-sm bg-white/10 px-1 py-px font-mono text-[0.5rem] font-semibold tracking-wide text-white/40 uppercase">
      cpu
    </span>
  );
}

/**
 * An opponent's rating, wherever their name is shown — and nowhere else now.
 *
 * A `shrink-0` sibling of the truncating name span rather than text appended
 * inside it, the same fix this project already learned for the seat label:
 * "Computer (1400)" as one string clips a long name before the rating even
 * gets read. Kept separate, the name can lose width and the number cannot.
 */
function RatingTag({ rating }: { readonly rating: number }): React.JSX.Element {
  return <span className="shrink-0 font-mono text-[0.65rem] text-white/40">{rating}</span>;
}

/** The one thing that says a row opens something, so both drill-down levels draw it alike. */
function Chevron({ open }: { readonly open: boolean }): React.JSX.Element {
  return (
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
  );
}

/**
 * One opponent, in one match format, on one line — the second drill-down level,
 * nested under the opponent's own summary row (`OpponentSummaryLine`) and shown
 * only while that row is open.
 *
 * `format · won–lost · hands · points · margin`. Getting here took four shapes
 * and the lesson is worth keeping: **what made the original unreadable was not
 * how many figures it held but that they did not line up.** It was a sentence of
 * middot-separated values, so the third figure sat somewhere different on every
 * row and each one had to be read from the beginning. A fixed grid with the
 * labels paid for once fixes that without dropping anything.
 *
 * **Hands sits beside the points rather than beside the record** because it is the
 * sample size — it is what makes a margin mean anything.
 *
 * The name and the rating are not here: they are said once, on the summary row
 * this sits under, and repeating them on every format would be the row that
 * squeezed the name in the first place, come back under a new heading.
 */
function OpponentLine({
  onToggle,
  open,
  record,
}: {
  onToggle(): void;
  readonly open: boolean;
  readonly record: OpponentRecord;
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
        <span className="truncate pl-3 text-[0.7rem] text-white/55">
          {formatPlural(record.format)}
        </span>
      </span>
      {/* The third figure only when there is one. Every rubber row would otherwise
          carry a "–0" for something that cannot happen to it, and this row is
          scanned rather than read. */}
      <span className="text-right font-mono text-xs tabular-nums">
        {record.won}–{record.lost}
        {record.drawn > 0 ? `–${record.drawn}` : ""}
      </span>
      <span className="text-right font-mono text-xs tabular-nums text-white/70">
        {record.deals.toLocaleString()}
      </span>
      <MarginSparkline matches={record.matches} />
      <span
        className={`text-right font-mono text-sm tabular-nums ${margin >= 0 ? "text-emerald-300" : "text-amber-200"}`}
      >
        {signed(margin)}
      </span>
      <Chevron open={open} />
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
function OpponentPanel({ record }: { readonly record: OpponentRecord }): React.JSX.Element {
  const margin = record.pointsFor - record.pointsAgainst;
  // Every match, drawn ones included — this is what the panel compares its
  // truncated match list against to say how much it is not showing, so leaving
  // draws out would understate the history by exactly the sessions that ended level.
  const played = record.won + record.lost + record.drawn;
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
          {record.drawn > 0 ? `–${record.drawn}` : ""}
          {record.drawn > 0 ? <Dim>won–lost–drawn</Dim> : null}
        </Fact>
        <Fact label="Hands">
          {record.deals.toLocaleString()}{" "}
          <Dim>{played === 0 ? "—" : `${(record.deals / played).toFixed(1)} a match`}</Dim>
        </Fact>
        {/* Only a combined rubber-family record has a length to split — see
            `byLength`. A single game and a full rubber read the same "won" and
            "lost" above; this is the one place that says which was which. */}
        {record.byLength === undefined ? null : (
          <>
            <Fact label="Rubbers">
              {record.byLength.rubber.won}–{record.byLength.rubber.lost}
              {record.byLength.rubber.drawn > 0 ? `–${record.byLength.rubber.drawn}` : ""}{" "}
              <Dim>{count(record.byLength.rubber.deals, "deal")}</Dim>
            </Fact>
            <Fact label="Single games">
              {record.byLength.game.won}–{record.byLength.game.lost}
              {record.byLength.game.drawn > 0 ? `–${record.byLength.game.drawn}` : ""}{" "}
              <Dim>{count(record.byLength.game.deals, "deal")}</Dim>
            </Fact>
          </>
        )}
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
  readonly isRobot: boolean;
  readonly key: string;
  readonly name: string;
  /**
   * One record per format played against this opponent, in a fixed reading order.
   *
   * A list rather than a slot per format, which is what this was. Two named slots
   * meant a third format was **silently dropped** rather than failing — duplicate
   * records arrived and simply did not appear — and a list is also the honest shape
   * for "whichever formats have been played against them".
   */
  readonly records: readonly OpponentRecord[];
}

/**
 * The order formats are listed in, which is the order they were added to the
 * game rather than anything about them. Stated because a `Map`'s insertion order
 * would otherwise make the list depend on which format happened to be played
 * first.
 */
const FORMAT_ORDER: readonly MatchFormat[] = ["rubber", "game", "mirror", "duplicate"];

function lastPlayedOf(group: Pick<OpponentGroup, "records">): number {
  return Math.max(0, ...group.records.map((record) => record.lastPlayed));
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
    const existing = groups.get(record.opponentKey);
    const records = [...(existing?.records ?? []), record].sort(
      (one, two) => FORMAT_ORDER.indexOf(one.format) - FORMAT_ORDER.indexOf(two.format),
    );
    groups.set(record.opponentKey, { isRobot, name: record.name, records });
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

/** An opponent's totals with every format folded in — see `OpponentSummaryLine`. */
interface CombinedRecord {
  readonly deals: number;
  readonly drawn: number;
  readonly lost: number;
  readonly margin: number;
  readonly won: number;
}

/**
 * Won, lost, drawn and deals add up the same way regardless of format — a
 * sitting is won or it is not, whatever game it was. Points do not: a rubber's
 * are real card play and duplicate's are a margin standing in for one (see
 * `PointsBar`'s own doc comment), so nothing here sums them into a pair. The
 * *margin* still adds up, because "how much better did this go than it went
 * for them" is the same question in every format — the same reasoning
 * `ratings.ts` already leans on to pool formats into one number at all.
 */
function combinedOf(group: OpponentGroup): CombinedRecord {
  return group.records.reduce<CombinedRecord>(
    (total, record) => ({
      deals: total.deals + record.deals,
      drawn: total.drawn + record.drawn,
      lost: total.lost + record.lost,
      margin: total.margin + (record.pointsFor - record.pointsAgainst),
      won: total.won + record.won,
    }),
    { deals: 0, drawn: 0, lost: 0, margin: 0, won: 0 },
  );
}

/**
 * One opponent, every format folded into one line — the first drill-down level,
 * and the only row on the list before anything is tapped.
 *
 * `name · won–lost · hands · margin`, the same columns `OpponentLine` uses one
 * level down, minus the points bar: nothing here is a real pair to draw a
 * proportion of once formats are pooled — see `combinedOf`.
 */
function OpponentSummaryLine({
  combined,
  group,
  onToggle,
  open,
}: {
  readonly combined: CombinedRecord;
  readonly group: OpponentGroup;
  onToggle(): void;
  readonly open: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-expanded={open}
      className={`${COLUMNS} w-full border-b border-white/7 py-1.5 text-left last:border-b-0 ${open ? "border-b-transparent bg-white/5" : ""}`}
      onClick={onToggle}
    >
      <span className="flex min-w-0 items-baseline gap-1">
        <span className={`truncate text-sm ${group.isRobot ? "text-white/60 italic" : ""}`}>
          {group.name}
        </span>
        <RatingTag rating={group.records[0]!.rating} />
        {group.isRobot ? <RobotTag /> : null}
      </span>
      <span className="text-right font-mono text-xs tabular-nums">
        {combined.won}–{combined.lost}
        {combined.drawn > 0 ? `–${combined.drawn}` : ""}
      </span>
      <span className="text-right font-mono text-xs tabular-nums text-white/70">
        {combined.deals.toLocaleString()}
      </span>
      <span />
      <span
        className={`text-right font-mono text-sm tabular-nums ${combined.margin >= 0 ? "text-emerald-300" : "text-amber-200"}`}
      >
        {signed(combined.margin)}
      </span>
      <Chevron open={open} />
    </button>
  );
}

/**
 * Where the list currently is — the whole list, one opponent's formats, or one
 * format's own detail. Exactly one shape at a time rather than two independent
 * booleans, because the two levels are not independent: a format panel only
 * ever belongs to the one opponent currently drilled into, and modelling that
 * as `openOpponent` plus `openFormat` would let them name two different
 * opponents at once — a state nothing here should be able to reach but nothing
 * would stop.
 */
type Drill =
  | { readonly level: "list" }
  | { readonly key: string; readonly level: "opponent" }
  | { readonly format: MatchFormat; readonly key: string; readonly level: "format" };

/**
 * One opponent's summary row, and — while it is open — the breakdown or the
 * detail underneath it.
 *
 * **Two drill-downs, not one.** The summary row folds every format together;
 * tapping it reveals one row per format actually played (skipped entirely for
 * an opponent with only one, who goes straight to its detail — a second tap on
 * a row that could only ever say "this one" would be asking a question with no
 * second answer); tapping a format row reveals its detail, exactly what used to
 * open straight from the old per-format row. Tapping the open summary row again
 * closes the whole thing, at whichever depth it was left.
 */
function OpponentSection({
  drill,
  group,
  onToggleFormat,
  onToggleOpponent,
}: {
  readonly drill: Drill;
  readonly group: OpponentGroup;
  onToggleFormat(format: MatchFormat): void;
  onToggleOpponent(): void;
}): React.JSX.Element {
  const combined = combinedOf(group);
  const opponentOpen = drill.level !== "list" && drill.key === group.key;
  const openFormat = drill.level === "format" && drill.key === group.key ? drill.format : null;
  const single = group.records.length === 1;

  return (
    <>
      <OpponentSummaryLine
        combined={combined}
        group={group}
        open={opponentOpen}
        onToggle={onToggleOpponent}
      />
      {single && openFormat !== null ? <OpponentPanel record={group.records[0]!} /> : null}
      {!single && opponentOpen
        ? group.records.map((record) => {
            const open = openFormat === record.format;
            return (
              <Fragment key={record.format}>
                <OpponentLine
                  open={open}
                  record={record}
                  onToggle={() => {
                    onToggleFormat(record.format);
                  }}
                />
                {open ? <OpponentPanel record={record} /> : null}
              </Fragment>
            );
          })
        : null}
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
          {formatName(match.format)} · {count(match.deals, "deal")}
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
 *
 * **Collapsed by default, and expandable.** Up to twenty matches at two lines
 * each is a real scroll for something that is supplementary detail once the
 * tallies above already say how things stand — the same reasoning behind
 * every panel on this screen, so it reuses the same tap-to-open heading and
 * chevron rather than a second interaction language for the same idea.
 */
function RecentMatches({ signedIn }: { readonly signedIn: boolean }): React.JSX.Element | null {
  const { matches } = useRecentMatches(signedIn);
  const [open, setOpen] = useState(false);

  if (matches === null || matches.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        className="flex items-center justify-between text-left"
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span className="text-lg font-semibold">Recent matches</span>
        <Chevron open={open} />
      </button>
      {open ? (
        <div>
          {matches.map((match) => (
            <MatchRow key={`${match.finishedAt}-${match.opponentName}`} match={match} />
          ))}
        </div>
      ) : null}
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
  // Declared before the early returns below so the hook order does not depend
  // on whether there is anything to show.
  const [drill, setDrill] = useState<Drill>({ level: "list" });

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
              drill={drill}
              group={group}
              onToggleFormat={(format) => {
                // Tapping the open one steps back up to the format list rather
                // than closing everything, since that list is still where the
                // reader was browsing.
                setDrill((current) =>
                  current.level === "format" && current.key === group.key && current.format === format
                    ? { key: group.key, level: "opponent" }
                    : { format, key: group.key, level: "format" },
                );
              }}
              onToggleOpponent={() => {
                // Tapping the open one — at either depth — closes the whole
                // thing, which is the only way back to a list that is a list.
                // A single-format opponent has no format list to land on, so it
                // goes straight to the one detail there is to show.
                setDrill((current) =>
                  current.level !== "list" && current.key === group.key
                    ? { level: "list" }
                    : group.records.length === 1
                      ? { format: group.records[0]!.format, key: group.key, level: "format" }
                      : { key: group.key, level: "opponent" },
                );
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

/** Which of the two things this screen holds is being read. */
type View = "everyone" | "you";

/**
 * The switch between your own record and everybody's standings.
 *
 * **Two views behind one door rather than two doors.** Both answer "how am I
 * doing", which is what the button on Home already promises, so nothing new has
 * to be learned to find the board — and the alternative, a fifth entry in Home's
 * secondary row, drops those buttons from 84px to 64px and wraps two of the four
 * captions onto a second line.
 *
 * The vocabulary is `SettingsOverlay`'s own `Choice`: flex-1 buttons, the live one
 * filled, `aria-pressed` saying which. Reused rather than invented so the control
 * reads as a thing this app does.
 *
 * It is a real pair of buttons and not a tappable heading, for the reason the
 * opponent rows are real buttons with `aria-expanded`: a decorated `div` leaves
 * the keyboard and a screen reader with no way to know there is anywhere to go.
 */
function ViewSwitch({
  onChange,
  view,
}: {
  onChange(next: View): void;
  readonly view: View;
}): React.JSX.Element {
  return (
    <div className="flex gap-2">
      {(
        [
          { label: "You", value: "you" },
          { label: "Everyone", value: "everyone" },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === view}
          className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium ${
            option.value === view ? "bg-white text-stone-900" : "border border-white/15 text-white"
          }`}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Who you have played and how it went, and where everybody stands.
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
 *
 * **Two views, because the second one has no point of view.** Everything under
 * `You` is from your side — a points-for, a win-loss from your seat, and a button
 * that deletes your history. A board is a list of other people. Sharing one scroll
 * would mean one screen speaking in two voices, and would put a destructive
 * control at the foot of a list that is partly somebody else's; sharing one door
 * costs nothing, since both answer the same question.
 *
 * The heading follows the view rather than sitting above the switch, so the
 * first-person voice stays attached to the first-person half.
 */
export function Record({ onBack, onSignIn, signedIn }: RecordProps): React.JSX.Element {
  const [view, setView] = useState<View>("you");
  // Held here rather than in the board, so the switch is free after the first
  // look — and fetched only once somebody has actually asked for it.
  const board = useStandings(signedIn && view === "everyone");
  useSwipeBack(onBack);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="px-4 pt-4">
        <BackButton onBack={onBack} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pt-2 pb-8">
        <h1 className="text-2xl font-semibold">
          {view === "you" ? "Your record" : "Standings"}
        </h1>
        {signedIn ? <ViewSwitch view={view} onChange={setView} /> : null}
        {view === "you" ? (
          <Body signedIn={signedIn} onSignIn={onSignIn} />
        ) : (
          <Standings loading={board.loading} standings={board.standings} />
        )}
      </div>
    </div>
  );
}
