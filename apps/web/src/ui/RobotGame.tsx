import { matchNoun } from "../game/labels.js";
import { useLocalSession } from "../game/localSession.js";
import { GameBoard } from "./GameBoard.js";

export interface RobotGameProps {
  readonly devTools: boolean;
  readonly peeking: boolean;
  onLeave(): void;
  onShowSettings(): void;
}

/** A rubber against the computer, running entirely in this browser. */
export function RobotGame({
  devTools,
  onLeave,
  onShowSettings,
  peeking,
}: RobotGameProps): React.JSX.Element {
  const session = useLocalSession();
  const noun = matchNoun(session.rubber.format);

  return (
    <GameBoard
      devTools={devTools}
      // Nobody is kept waiting and nobody is told, so the warning is only about
      // what this browser is about to throw away.
      exit={{
        leave: onLeave,
        title: `Leave this ${noun}?`,
        warning: "The deals played so far are lost — an unfinished match is not kept anywhere.",
      }}
      peeking={peeking}
      session={session}
      onShowSettings={onShowSettings}
    />
  );
}
