import { matchNoun } from "../game/labels.js";
import { useLocalSession } from "../game/localSession.js";
import type { Density } from "../game/identity.js";
import { clearRobotMatch } from "../game/robotPersistence.js";
import { knownRatings, useBotAnchor } from "../game/records.js";
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
  // Which opponent this is: the release, and the rung it is set to play at.
  // Read off the session itself rather than the current setting a second
  // time — `useLocalSession` is what actually pinned these, whether this
  // match just started or was resumed from one already under way, and a
  // second, independent read here is how the two come to disagree.
  const opponent = useBotAnchor(session.releaseVersion, session.rung, session.format);
  const noun = matchNoun(session.format);

  return (
    <GameBoard
      density={density}
      devTools={devTools}
      // Nobody is kept waiting and nobody is told, so the warning is only about
      // what this browser is about to throw away — which `clearRobotMatch` is
      // what actually makes true. Without it, the warning would be a promise
      // a reload could quietly keep anyway.
      exit={{
        leave: () => {
          clearRobotMatch();
          onLeave();
        },
        title: `Leave this ${noun}?`,
        warning: "The deals played so far are lost — an unfinished match is not kept anywhere.",
      }}
      peeking={peeking}
      // Both sides are knowable here and only here: the computer's rating is
      // pinned server-side and yours came down with the record, so neither costs
      // a request the robot game is not allowed to make. The opponent's is looked
      // up per rung rather than taken from the last match played, since the whole
      // point of the setting is that those are different opponents.
      ratings={{ mine: cached.mine, opponent }}
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
