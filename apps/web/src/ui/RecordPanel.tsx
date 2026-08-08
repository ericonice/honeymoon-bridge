import type { OpponentRecord } from "../game/records.js";
import { useRecords } from "../game/records.js";

export interface RecordPanelProps {
  /** Only fetched while Settings is actually open. */
  readonly active: boolean;
  readonly signedIn: boolean;
}

function Row({ record }: { readonly record: OpponentRecord }): React.JSX.Element {
  const played = record.won + record.lost;
  return (
    <div className="flex items-baseline gap-3 border-t border-white/10 py-2 first:border-t-0">
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
        <span className="block text-xs text-white/40">
          {played === 1 ? "1 rubber" : `${played} rubbers`}
        </span>
      </span>
    </div>
  );
}

/**
 * Who you have played and how it went.
 *
 * The computer gets its own heading rather than a place in the list. The row is
 * identical — a rubber against it is won or lost the same way — but a networked
 * rubber was witnessed by the server and one against the computer was played
 * entirely in a browser, so the two are worth keeping apart rather than summing
 * into a single record.
 */
export function RecordPanel({ active, signedIn }: RecordPanelProps): React.JSX.Element | null {
  const { loading, records } = useRecords(active && signedIn);

  if (!signedIn) {
    return null;
  }
  if (loading && records === null) {
    return <p className="text-sm text-white/40">Looking up your record…</p>;
  }
  if (records === null) {
    return <p className="text-sm text-white/40">Could not load your record.</p>;
  }

  const nothingYet = records.opponents.length === 0 && records.robot === null;
  if (nothingYet) {
    return (
      <p className="text-sm text-white/40">
        No finished rubbers yet. A rubber counts once somebody has won two games — an abandoned one
        is not scored.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {records.opponents.length === 0 ? null : (
        <div>
          <h3 className="text-xs tracking-wide text-white/45 uppercase">Against people</h3>
          <div className="mt-1">
            {records.opponents.map((record) => (
              <Row key={`${record.email ?? record.name}-${record.lastPlayed}`} record={record} />
            ))}
          </div>
        </div>
      )}

      {records.robot === null ? null : (
        <div>
          <h3 className="text-xs tracking-wide text-white/45 uppercase">Against the computer</h3>
          <div className="mt-1">
            <Row record={records.robot} />
          </div>
        </div>
      )}
    </div>
  );
}
