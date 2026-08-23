import { matchNoun } from "../game/labels.js";
import { useLocalSession } from "../game/localSession.js";
import type { Density } from "../game/identity.js";
import { knownRatings } from "../game/records.js";
import { GameBoard } from "./GameBoard.js";

export interface RobotGameProps {
  /** How much room the chrome may take — see `Density`. */
  readonly density: Density;
  readonly devTools: boolean;
  readonly peeking: boolean;
  readonly sound: boolean;
  readonly tapToSelect: boolean;
  /** Whether the play screen draws each side's trick countdown. */
  readonly trickCount: boolean;
  onLeave(): void;
  onShowSettings(): void;
}

/** A rubber against the computer, running entirely in this browser. */
export function RobotGame({
  density,
  devTools,
  onLeave,
  onShowSettings,
  peeking,
  sound,
  tapToSelect,
  trickCount,
}: RobotGameProps): React.JSX.Element {
  // Read once a mount. It changes only when a match ends, and this screen is one match.
  const cached = knownRatings();
  const session = useLocalSession({ peek: peeking });
  const noun = matchNoun(session.rubber.format);

  return (
    <GameBoard
      density={density}
      devTools={devTools}
      // Nobody is kept waiting and nobody is told, so the warning is only about
      // what this browser is about to throw away.
      exit={{
        leave: onLeave,
        title: `Leave this ${noun}?`,
        warning: "The deals played so far are lost — an unfinished match is not kept anywhere.",
      }}
      peeking={peeking}
      // Both sides are knowable here and only here: the computer's rating is
      // pinned server-side and yours came down with the record, so neither costs
      // a request the robot game is not allowed to make.
      ratings={{ mine: cached.mine, opponent: cached.bot }}
      session={session}
      sound={sound}
      tapToSelect={tapToSelect}
      trickCount={trickCount}
      // Only here. At a table the other player would be sitting watching somebody
      // read three notes, and the draw phase has no clock to protect them with.
      walkthrough
      onShowSettings={onShowSettings}
    />
  );
}
