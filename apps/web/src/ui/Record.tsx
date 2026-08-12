import { useState } from "react";
import { matchNoun } from "../game/labels.js";
import type { MatchRecord, OpponentRecord, Records } from "../game/records.js";
import { resetRecord, useRecentMatches, useRecords } from "../game/records.js";

export interface RecordProps {
  readonly signedIn: boolean;
  onBack(): void;
  onSignIn(): void;
}

/**
 * Roughly how long ago, in the terms somebody would actually use.
 *
 * A date is not what the question is: "three days ago" answers whether this is
 * a standing rivalry or something from last winter, and an exact timestamp on a
 * scoreboard is precision nobody asked for.
 *
 * Counted in calendar days from local midnight, not in elapsed 24-hour spans.
 * Dividing the difference by a day says "today" about a game played at eleven
 * last night and "yesterday" about one from two mornings ago — which is wrong
 * in the small hours, and the small hours are when this gets played.
 */
export function whenPlayed(at: number): string {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const days = Math.ceil((midnight.getTime() - at) / 86_400_000);
  if (days <= 0) {
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

/** One opponent's record in one match format — half of an `OpponentSection`. */
function FormatRow({
  formatLabel,
  record,
}: {
  readonly formatLabel: string;
  readonly record: OpponentRecord;
}): React.JSX.Element {
  const played = record.won + record.lost;
  const margin = record.pointsFor - record.pointsAgainst;

  return (
    <div className="mt-2 first:mt-0">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 text-sm text-white/50">{formatLabel}</span>
        <span className="shrink-0 font-mono text-base tabular-nums">
          {record.won}–{record.lost}
        </span>
      </div>

      {/* Every count on the left reads in one direction now, labeled rather
          than left to guesswork — the points total used to be a bare "N–N",
          the same bare shape as the won-lost record above it, with nothing
          to tell the two apart at a glance. "Last played" keeps its own
          place on the right: recency answers a different question than the
          tally does, and folding it into the same run of numbers is what
          made deals read as "today's deals" once before. */}
      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-white/40">
        <span>
          {count(played, "match", "matches")} · {count(record.deals, "deal")} ·{" "}
          <span className="font-mono tabular-nums">
            {record.pointsFor.toLocaleString()}–{record.pointsAgainst.toLocaleString()}
          </span>{" "}
          pts (
          <span className={margin >= 0 ? "text-emerald-300/70" : "text-amber-200/60"}>
            {margin >= 0 ? "+" : "−"}
            {Math.abs(margin).toLocaleString()}
          </span>
          )
        </span>
        <span className="shrink-0">last played {whenPlayed(record.lastPlayed)}</span>
      </div>
    </div>
  );
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
function OpponentSection({ group }: { readonly group: OpponentGroup }): React.JSX.Element {
  return (
    <div className="border-t border-white/10 py-3 first:border-t-0">
      <div className="flex items-center gap-2">
        <span className={`truncate text-base ${group.isRobot ? "text-white/60 italic" : ""}`}>
          {group.name}
        </span>
        {group.isRobot ? (
          <span className="shrink-0 rounded bg-white/10 px-1.5 py-px text-[0.6rem] font-semibold tracking-wide text-white/45 uppercase">
            computer
          </span>
        ) : null}
      </div>
      {group.rubber === null ? null : <FormatRow formatLabel="Rubber" record={group.rubber} />}
      {group.game === null ? null : <FormatRow formatLabel="Single game" record={group.game} />}
    </div>
  );
}

/**
 * When a match finished, in whatever timezone this device is currently set
 * to — unlike `whenPlayed`, which only says how long ago, this is for telling
 * two matches from the same day apart.
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
 * What it names is the part that surprises: a rubber against a person stays on
 * *their* record. It is one row holding both sides of a game they also played,
 * and taking a win off somebody else's scoreboard is not this button's to do.
 */
function Reset({ onDone }: { onDone(): void }): React.JSX.Element {
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const go = async (): Promise<void> => {
    setWorking(true);
    setFailed(false);
    const forgotten = await resetRecord().catch(() => null);
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
        <h2 className="text-lg font-semibold">Head to head</h2>
        <div>
          {groups.map((group) => (
            <OpponentSection key={group.key} group={group} />
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
