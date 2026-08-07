import { useLocalSession } from "../game/localSession.js";
import { GameBoard } from "./GameBoard.js";

export interface RobotGameProps {
  readonly devTools: boolean;
  readonly peeking: boolean;
  onShowSettings(): void;
}

/** A rubber against the computer, running entirely in this browser. */
export function RobotGame(props: RobotGameProps): React.JSX.Element {
  return <GameBoard {...props} session={useLocalSession()} />;
}
