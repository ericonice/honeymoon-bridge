import { matchNoun } from "../game/labels.js";
import { useLocalSession } from "../game/localSession.js";
import { GameBoard } from "./GameBoard.js";

export interface RobotGameProps {
  readonly devTools: boolean;
  readonly peeking: boolean;
  readonly sound: boolean;
  readonly tapToSelect: boolean;
  onLeave(): void;
  onShowSettings(): void;
}

/** A rubber against the computer, running entirely in this browser. */
export function RobotGame({
  devTools,
  onLeave,
  onShowSettings,
  peeking,
  sound,
  tapToSelect,
}: RobotGameProps): React.JSX.Element {
  const session = useLocalSession({ peek: peeking });
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
      sound={sound}
      tapToSelect={tapToSelect}
      onShowSettings={onShowSettings}
    />
  );
}
