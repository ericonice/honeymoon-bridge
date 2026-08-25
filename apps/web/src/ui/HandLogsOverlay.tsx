import type { Contract, PlayerId } from "@hb/engine";
import { useEffect, useState } from "react";
import { DIFFICULTY_LABEL } from "../bot/difficulty.js";
import type { Difficulty } from "../bot/difficulty.js";
import { releaseFor } from "../bot/release.js";
import { HUMAN } from "../game/localSession.js";
import { fetchHandLogs } from "../game/handLog.js";
import { ContractText } from "./CardText.js";
import { Overlay } from "./Overlay.js";

export interface HandLogsOverlayProps {
  onClose(): void;
}

/**
 * The logged hands, as a table.
 *
 * Every hand *anyone* has played against the computer, not only the asker's —
 * which is what makes this a different kind of screen from the record, and why
 * it is gated on the playtester list rather than on an ordinary session.
 *
 * It was a `JSON.stringify` dump for a long while, on the reasoning that a
 * formatted dump was honest about how unfinished the question was. That stopped
 * being true once there was something to look *for*: which opponent, at which
 * rung, and whether the contract came home. A dump can be read; it cannot be
 * scanned, and a list of fifty deals is scanned.
 *
 * Four columns and no more. The deal itself — every card, the auction, the seed
 * — is still in the payload and still the point, but it belongs to
 * `bench/hands.ts`, which can replay it. What a person wants from a phone is
 * whether anything looks wrong.
 */

/** One row's worth, from a payload this screen deliberately does not fully type. */
interface LoggedRow {
  readonly botVersion: number | null;
  readonly contractLevel: number;
  readonly contractStrain: string;
  /**
   * The deal itself. Only the contract is read here, and it is read in
   * preference to the flattened columns beside it because those do not carry
   * the *doubling* — and a doubled contract is the single most interesting
   * thing a row can say. Every recorded disaster this project has investigated
   * was a doubled one.
   */
  readonly deal?: { readonly contract?: Contract };
  readonly declarer: PlayerId;
  readonly difficulty: string | null;
  readonly id: string;
  readonly made: boolean;
  readonly playedAt: number;
  readonly tricksDeclarer: number;
}

function asRows(hands: readonly unknown[]): readonly LoggedRow[] {
  return hands.filter((one): one is LoggedRow => typeof one === "object" && one !== null);
}

/**
 * Which computer, and how hard it was set to play.
 *
 * Both halves matter and neither is enough alone: the release says what the
 * bidder is and the rung says how hard it thinks — and at the bottom rung, what
 * it thinks *with*, since Kitchen bids by `simpleBidder`. Pooling rungs would
 * pool two different opponents.
 */
function opponentOf(row: LoggedRow): string {
  const release = row.botVersion === null ? null : releaseFor(row.botVersion);
  const name = release === null ? `v${row.botVersion ?? "?"}` : release.name;
  const rung =
    row.difficulty === null
      ? ""
      : ` · ${DIFFICULTY_LABEL[row.difficulty as Difficulty] ?? row.difficulty}`;
  return `${name}${rung}`;
}

/**
 * The contract as played, doubling included.
 *
 * The flattened columns are the fallback rather than the source: they lose the
 * doubling, and a row that cannot say "doubled" is missing the fact somebody
 * scanning this list is most likely looking for.
 */
function contractOf(row: LoggedRow): Contract {
  return (
    row.deal?.contract ?? {
      declarer: row.declarer,
      doubling: "none",
      level: row.contractLevel as Contract["level"],
      strain: row.contractStrain as Contract["strain"],
    }
  );
}

/** Down two reads faster than "eight tricks against a required ten". */
function resultOf(row: LoggedRow): string {
  const needed = row.contractLevel + 6;
  return row.made ? `made ${row.tricksDeclarer}` : `down ${needed - row.tricksDeclarer}`;
}

function When({ at }: { readonly at: number }): React.JSX.Element {
  const when = new Date(at);
  const day = when.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <span className="whitespace-nowrap text-white/45">
      {day} {time}
    </span>
  );
}

function Row({ row }: { readonly row: LoggedRow }): React.JSX.Element {
  return (
    <tr className="border-t border-white/10 align-top">
      <td className="py-2 pr-2 text-[11px]">
        <When at={row.playedAt} />
      </td>
      <td className="py-2 pr-2 text-[11px] text-white/60">{opponentOf(row)}</td>
      <td className="py-2 pr-2 whitespace-nowrap">
        <ContractText contract={contractOf(row)} on="dark" />
        <span className="pl-1 text-[11px] text-white/45">
          {row.declarer === HUMAN ? "you" : "it"}
        </span>
      </td>
      <td
        className={`py-2 text-right text-[11px] whitespace-nowrap ${
          row.made ? "text-emerald-300/80" : "text-white/55"
        }`}
      >
        {resultOf(row)}
      </td>
    </tr>
  );
}

export function HandLogsOverlay({ onClose }: HandLogsOverlayProps): React.JSX.Element {
  const [state, setState] = useState<{ readonly hands: unknown[] } | { readonly error: true } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchHandLogs().then((hands) => {
      if (!cancelled) {
        setState(hands === null ? { error: true } : { hands });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Overlay title="Logged hands" onClose={onClose}>
      {state === null ? (
        <p className="text-sm text-white/50">Loading…</p>
      ) : "error" in state ? (
        <p className="text-sm text-white/50">Could not load logged hands.</p>
      ) : state.hands.length === 0 ? (
        <p className="text-sm text-white/50">No hands logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-[11px] text-white/40">
                <th className="pb-1 pr-2 text-left font-normal">When</th>
                <th className="pb-1 pr-2 text-left font-normal">Opponent</th>
                <th className="pb-1 pr-2 text-left font-normal">Contract</th>
                <th className="pb-1 text-right font-normal">Result</th>
              </tr>
            </thead>
            <tbody>
              {asRows(state.hands).map((row) => (
                <Row key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Overlay>
  );
}
