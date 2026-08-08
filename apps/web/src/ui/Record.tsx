import type { MatchFormat } from "@hb/engine";
import { useState } from "react";
import type { OpponentRecord } from "../game/records.js";
import { resetRecord, useRecords } from "../game/records.js";

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

function Row({ record }: { readonly record: OpponentRecord }): React.JSX.Element {
  const played = record.won + record.lost;
  const margin = record.pointsFor - record.pointsAgainst;

  return (
    <div className="border-t border-white/10 py-2.5 first:border-t-0">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base">{record.name}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-base tabular-nums">
            {record.won}–{record.lost}
          </span>
          {/* Both totals together. Deals used to sit beside "today" at the
              bottom, which read as a count of deals played today rather than
              the running total it is. */}
          <span className="block text-xs text-white/40">
            {count(played, "match", "matches")} · {count(record.deals, "deal")}
          </span>
        </span>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-white/40">
        <span className="font-mono tabular-nums">
          {record.pointsFor.toLocaleString()}–{record.pointsAgainst.toLocaleString()}
          {/* The margin, because two large totals a few points apart look like a
              thrashing until you subtract them. */}
          <span className={margin >= 0 ? "text-emerald-300/70" : "text-amber-200/60"}>
            {" "}
            {margin >= 0 ? "+" : "−"}
            {Math.abs(margin).toLocaleString()}
          </span>
        </span>
        <span className="shrink-0">last played {whenPlayed(record.lastPlayed)}</span>
      </div>
    </div>
  );
}

function Group({
  records,
  title,
}: {
  readonly records: readonly OpponentRecord[];
  readonly title: string;
}): React.JSX.Element | null {
  if (records.length === 0) {
    return null;
  }
  return (
    <div>
      <h3 className="text-xs tracking-wide text-white/45 uppercase">{title}</h3>
      <div className="mt-1">
        {records.map((record) => (
          <Row key={`${record.name}-${record.lastPlayed}`} record={record} />
        ))}
      </div>
    </div>
  );
}

const SECTIONS: { readonly format: MatchFormat; readonly title: string }[] = [
  { format: "rubber", title: "Rubbers" },
  { format: "game", title: "Single games" },
];

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

  const shown = SECTIONS.map((section) => ({
    ...section,
    opponents: records.opponents.filter((r) => r.format === section.format),
    robot: records.robot.filter((r) => r.format === section.format),
  })).filter((section) => section.opponents.length > 0 || section.robot.length > 0);

  if (shown.length === 0) {
    return (
      <p className="text-sm text-white/60">
        No finished matches yet. One counts when somebody has won it — an abandoned match is not
        scored.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {shown.map((section) => (
        <div key={section.format} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <Group records={section.opponents} title="Against people" />
          <Group records={section.robot} title="Against the computer" />
        </div>
      ))}
      <Reset onDone={reload} />
    </div>
  );
}

/**
 * Who you have played and how it went.
 *
 * Its own screen rather than a panel in Settings. Settings is where you go to
 * change something and every row in it is short and bounded; this grows with
 * every person played, and doubles again because a rubber and a single game are
 * counted apart. Scrolling past a scoreboard to reach a theme switch is the
 * wrong way round.
 *
 * Split by match length first, because a rubber and a game are not the same
 * achievement. Within each, the computer keeps its own heading: the row is
 * identical, but a networked match was witnessed by the server while one against
 * the computer was played entirely in a browser and is taken on its word.
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
