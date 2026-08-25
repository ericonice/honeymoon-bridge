import { useEffect, useState } from "react";
import { DIFFICULTY_LABEL } from "../bot/difficulty.js";
import type { Difficulty } from "../bot/difficulty.js";
import { releaseFor } from "../bot/release.js";
import { fetchEveryMatch } from "../game/records.js";
import type { AnyMatch, MatchSeat } from "../game/records.js";
import { Overlay } from "./Overlay.js";

export interface LatestGamesOverlayProps {
  onClose(): void;
}

/**
 * The latest matches by anybody, two seats a row.
 *
 * Everything else on the record side answers "how did *you* do" — it takes a
 * side, reports a `pointsFor`, and calls the other seat "them". This one has no
 * asker: it is a list of games other people played, so both seats are named and
 * neither is "you". That is the whole reason it is a separate screen rather
 * than the record with a wider query behind it.
 *
 * A sibling of the logged hands, and gated identically. Not scoped to the
 * account, so a session is not the right permission — the server checks the
 * playtester list and answers 404 rather than 401 to everybody else.
 *
 * The hand log is per *deal*; this is per *match*. Both are wanted and they
 * answer different questions: whether a contract came home, against who is
 * playing and how it finished.
 */

/** The computer's seat says which computer and how hard, since those are two opponents. */
function nameOf(seat: MatchSeat, match: AnyMatch): string {
  if (!seat.robot) {
    return seat.name;
  }
  const release = match.botVersion === null ? null : releaseFor(match.botVersion);
  const who = release === null ? seat.name : release.name;
  const rung =
    match.difficulty === null
      ? ""
      : ` · ${DIFFICULTY_LABEL[match.difficulty as Difficulty] ?? match.difficulty}`;
  return `${who}${rung}`;
}

function Seat({
  match,
  seat,
  won,
}: {
  readonly match: AnyMatch;
  readonly seat: MatchSeat;
  readonly won: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2">
      {/* The winner carries the emphasis rather than a marker of its own: the
          row already has two names and two figures, and a third signal for the
          one fact those two already imply is clutter. */}
      <span className={`truncate ${won ? "text-white/90" : "text-white/50"}`}>{seat.name}</span>
      <span className={`tabular-nums ${won ? "text-white/90" : "text-white/50"}`}>{seat.points}</span>
    </div>
  );
}

function Row({ match }: { readonly match: AnyMatch }): React.JSX.Element {
  const when = new Date(match.finishedAt);
  const [first, second] = match.players;
  return (
    <tr className="border-t border-white/10 align-top">
      <td className="py-2 pr-3 text-[11px] whitespace-nowrap text-white/40">
        {when.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
        <br />
        {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </td>
      <td className="w-full py-2 text-sm">
        <Seat match={match} seat={{ ...first, name: nameOf(first, match) }} won={match.winner === 0} />
        <Seat match={match} seat={{ ...second, name: nameOf(second, match) }} won={match.winner === 1} />
      </td>
      <td className="py-2 pl-3 text-right text-[11px] whitespace-nowrap text-white/40">
        {match.deals} {match.deals === 1 ? "deal" : "deals"}
        <br />
        {match.format === "game" ? "game" : "rubber"}
      </td>
    </tr>
  );
}

export function LatestGamesOverlay({ onClose }: LatestGamesOverlayProps): React.JSX.Element {
  const [state, setState] = useState<
    { readonly matches: AnyMatch[] } | { readonly error: true } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void fetchEveryMatch().then((matches) => {
      if (!cancelled) {
        setState(matches === null ? { error: true } : { matches });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Overlay title="Latest games" onClose={onClose}>
      {state === null ? (
        <p className="text-sm text-white/50">Loading…</p>
      ) : "error" in state ? (
        <p className="text-sm text-white/50">Could not load the latest games.</p>
      ) : state.matches.length === 0 ? (
        <p className="text-sm text-white/50">No games recorded yet.</p>
      ) : (
        <table className="w-full border-collapse">
          <tbody>
            {state.matches.map((match) => (
              <Row key={`${match.finishedAt}-${match.players[0].name}`} match={match} />
            ))}
          </tbody>
        </table>
      )}
    </Overlay>
  );
}
