import type { MatchFormat } from "@hb/engine";
import type { OpponentRecord } from "../game/records.js";
import { useRecords } from "../game/records.js";

export interface RecordProps {
  readonly signedIn: boolean;
  onBack(): void;
  onShowSettings(): void;
}

/**
 * Roughly how long ago, in the terms somebody would actually use.
 *
 * A date is not what the question is: "three days ago" answers whether this is
 * a standing rivalry or something from last winter, and an exact timestamp on a
 * scoreboard is precision nobody asked for.
 */
function whenPlayed(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000);
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

function count(n: number, noun: string): string {
  return `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
}

function Row({ record }: { readonly record: OpponentRecord }): React.JSX.Element {
  const played = record.won + record.lost;
  const margin = record.pointsFor - record.pointsAgainst;

  return (
    <div className="border-t border-white/10 py-2.5 first:border-t-0">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base">{record.name}</span>
          {record.email === null ? null : (
            <span className="block truncate text-xs text-white/40">{record.email}</span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-base tabular-nums">
            {record.won}–{record.lost}
          </span>
          <span className="block text-xs text-white/40">{count(played, "match")}</span>
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
        <span className="shrink-0">
          {count(record.deals, "deal")} · {whenPlayed(record.lastPlayed)}
        </span>
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
          <Row key={`${record.email ?? record.name}-${record.lastPlayed}`} record={record} />
        ))}
      </div>
    </div>
  );
}

const SECTIONS: { readonly format: MatchFormat; readonly title: string }[] = [
  { format: "rubber", title: "Rubbers" },
  { format: "game", title: "Single games" },
];

function Body({
  signedIn,
  onShowSettings,
}: {
  readonly signedIn: boolean;
  onShowSettings(): void;
}): React.JSX.Element {
  const { loading, records } = useRecords(signedIn);

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
          onClick={onShowSettings}
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
export function Record({ onBack, onShowSettings, signedIn }: RecordProps): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-8">
        <h1 className="text-2xl font-semibold">Your record</h1>
        <Body signedIn={signedIn} onShowSettings={onShowSettings} />
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
