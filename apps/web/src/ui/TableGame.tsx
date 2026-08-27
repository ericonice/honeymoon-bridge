import { opponentOf } from "@hb/engine";
import { useEffect, useState } from "react";
import { matchNoun } from "../game/labels.js";
import { useNetworkSession } from "../game/networkSession.js";
import type { NetworkGame } from "../game/networkSession.js";
import type { GameSession } from "../game/session.js";
import { knownRatings } from "../game/records.js";
import { inviteLink } from "../game/serverUrl.js";
import type { Density } from "../game/identity.js";
import { GameBoard } from "./GameBoard.js";

export interface TableGameProps {
  readonly code: string;
  /** How much room the chrome may take — see `Density`. */
  readonly density: Density;
  readonly devTools: boolean;
  readonly peeking: boolean;
  readonly sound: boolean;
  readonly tapToSelect: boolean;
  /** Whether the play screen draws each side's trick countdown. */
  readonly trickCount: boolean;
  /** Goes back to the home screen. The seat is given up before this is called. */
  onLeave(): void;
  onShowSettings(): void;
}

/** Seconds left on a grace period, ticking. */
function useCountdown(until: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) {
      return;
    }
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [until]);

  return until === null ? null : Math.max(0, Math.ceil((until - now) / 1000));
}

function Waiting({
  code,
  game,
  onLeave,
}: {
  readonly code: string;
  readonly game: NetworkGame;
  onLeave(): void;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(code);

  return (
    <div className="flex flex-1 flex-col justify-between px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Waiting for a second player</h1>
        <p className="mt-1 text-sm text-white/55">
          {game.connection === "open"
            ? "Send them this link. The game starts when they open it."
            : "Reconnecting…"}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-white/20 px-4 py-4">
          <p className="text-xs tracking-widest text-white/45 uppercase">Table code</p>
          <p className="mt-1 font-mono text-3xl tracking-[0.3em]">{code}</p>
        </div>
        <button
          type="button"
          className="rounded-xl bg-white px-4 py-4 text-base font-semibold text-stone-900"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied ? "Link copied" : "Copy invite link"}
        </button>
      </div>

      <button
        type="button"
        className="self-start text-sm text-white/50 underline underline-offset-4"
        onClick={onLeave}
      >
        Leave table
      </button>
    </div>
  );
}

/**
 * A banner for the states a networked game has and a local one cannot.
 *
 * §2.2 asks for an explicit "waiting for X to reconnect" with a visible
 * countdown rather than a frozen table, because both players *will* drop during
 * a normal session — iOS closes the socket every time the phone locks.
 */
function Interruption({ game }: { readonly game: NetworkGame }): React.JSX.Element | null {
  const seconds = useCountdown(game.table?.waitingUntil ?? null);

  if (game.connection !== "open") {
    return (
      <p className="bg-amber-500/25 px-4 py-1.5 text-center text-xs text-amber-100">
        Reconnecting…
      </p>
    );
  }

  const seat = game.seat;
  const them = seat === null ? null : (game.table?.seats[opponentOf(seat)] ?? null);
  if (them === null || them.connected) {
    return null;
  }

  return (
    <p className="bg-amber-500/25 px-4 py-1.5 text-center text-xs text-amber-100">
      Waiting for {them.nickname} to reconnect
      {seconds === null ? "" : ` · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
    </p>
  );
}

function Message({
  detail,
  onLeave,
  title,
}: {
  readonly detail: string;
  readonly title: string;
  onLeave(): void;
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-white/55">{detail}</p>
      </div>
      <button
        type="button"
        className="rounded-xl bg-white px-6 py-3 text-base font-semibold text-stone-900"
        onClick={onLeave}
      >
        Back
      </button>
    </div>
  );
}

/**
 * The other seat has been emptied, which is somebody leaving on purpose — a
 * dropped socket keeps its seat and gets a countdown instead.
 *
 * A match that has already been won is a different piece of news: leaving one
 * of those is declining another rather than abandoning anything, and the result
 * is on the record either way. Telling somebody a rubber they just won has been
 * thrown away would be the wrong news entirely.
 */
function TheyLeft({
  onLeave,
  session,
}: {
  readonly session: GameSession;
  onLeave(): void;
}): React.JSX.Element {
  const noun = matchNoun(session.format);

  if (session.matchComplete) {
    return (
      <Message
        title={`${session.opponentName} has left`}
        detail={`The ${noun} is over and on your record. Nothing was lost by stopping here.`}
        onLeave={onLeave}
      />
    );
  }

  return (
    <Message
      title={`${session.opponentName} left the table`}
      detail={`The ${noun} ends here — there is nowhere to keep an unfinished one.`}
      onLeave={onLeave}
    />
  );
}

export function TableGame({
  code,
  density,
  devTools,
  onLeave,
  onShowSettings,
  peeking,
  sound,
  tapToSelect,
  trickCount,
}: TableGameProps): React.JSX.Element {
  const game = useNetworkSession(code);

  // Every way out of this screen goes through here, so the other player is
  // always told rather than left watching a countdown for somebody who has
  // gone. Giving up a seat the server has already closed costs nothing.
  const quit = (): void => {
    game.leave();
    onLeave();
  };

  if (game.error !== null && game.session === null) {
    return <Message title={game.error} detail="" onLeave={quit} />;
  }

  // Nothing heard from the server yet. Deliberately not the waiting screen:
  // that one shows the table code in large type, and flashing a code at
  // somebody who is joining an existing table tells them nothing they need.
  if (game.table === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-sm text-white/55">Connecting…</p>
      </div>
    );
  }

  // A seat that has been emptied after the game began is somebody who left, as
  // distinct from somebody whose socket dropped — they keep their seat.
  const seat = game.seat;
  const session = game.session;
  if (seat !== null && session !== null && game.table.seats[opponentOf(seat)] === null) {
    return <TheyLeft session={session} onLeave={quit} />;
  }

  if (session === null) {
    return <Waiting code={code} game={game} onLeave={quit} />;
  }

  const noun = matchNoun(session.format);

  return (
    <>
      <Interruption game={game} />
      <GameBoard
        density={density}
        devTools={devTools}
        exit={{
          leave: quit,
          title: "Leave the table?",
          // The half Settings never said: somebody else is sitting there, and
          // walking out ends their match too.
          warning: `${session.opponentName} will be told the ${noun} ended. There is nowhere to keep an unfinished one.`,
        }}
        peeking={peeking}
        // Yours only. A person's rating is theirs, and nothing about a seat
        // carries it — the server sends a nickname, not a record.
        ratings={{ mine: knownRatings().mine, opponent: null }}
        session={session}
        sound={sound}
        tapToSelect={tapToSelect}
        trickCount={trickCount}
        // Never at a table: the walkthrough holds the board while it is read, and the
        // other seat has no way to know why nothing is happening.
        walkthrough={false}
        onShowSettings={onShowSettings}
      />
    </>
  );
}
