import type { FieldResult, PlayerId } from "@hb/engine";
import type { BoardReview as Review } from "../game/boardReview.js";
import { BoardDetail } from "./BoardDetail.js";
import { Overlay } from "./Overlay.js";

export interface BoardReviewProps {
  /** Which board of the session, for the title. */
  readonly at: number;
  readonly me: PlayerId;
  /** Pops back to the pad this was opened from — see `Overlay`. Null when opened over the board. */
  readonly onBack?: (() => void) | null;
  readonly opponentName: string;
  readonly result: FieldResult;
  /** What this device kept of the board, or null — see `BoardDetail`. */
  readonly review: Review | null;
  onClose(): void;
}

/**
 * A board already played, opened again from the score pad.
 *
 * **Everything here was on screen at the reveal**, which is what makes it allowable
 * rather than a new disclosure: a deal is played to all thirteen tricks, so both
 * hands are public by the end, and the auction was made in the open. What it adds is
 * only that you no longer have to have been looking — a placing tells you how a
 * board went and says nothing about *why*, and the why is the hands and the bidding.
 *
 * Offered in Doop and nowhere else. A board here is played once and
 * `fieldBoardsFor` excludes seeds met in earlier sessions, so nothing learnt from
 * looking back can be spent on a board still to come; in Replay, a mirror or a
 * return match the same screen would hand over the second run.
 *
 * The panel is the chrome and nothing else — `BoardDetail` is the board, and the
 * reveal between deals draws the same component without a panel around it.
 */
export function BoardReview({
  at,
  me,
  onBack = null,
  onClose,
  opponentName,
  result,
  review,
}: BoardReviewProps): React.JSX.Element {
  return (
    <Overlay title={`Board ${at + 1}`} onBack={onBack} onClose={onClose}>
      <BoardDetail at={at} me={me} opponentName={opponentName} result={result} review={review} />
    </Overlay>
  );
}
