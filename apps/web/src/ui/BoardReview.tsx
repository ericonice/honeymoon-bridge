import type { FieldResult, PlayerId } from "@hb/engine";
import type { BoardReview as Review } from "../game/boardReview.js";
import { useSwipeBack } from "../game/swipeBack.js";
import { BackButton } from "./BackButton.js";
import { BoardDetail } from "./BoardDetail.js";

export interface BoardReviewProps {
  /** Which board of the session, for the title. */
  readonly at: number;
  readonly me: PlayerId;
  readonly opponentName: string;
  readonly result: FieldResult;
  /** What this device kept of the board, or null — see `BoardDetail`. */
  readonly review: Review | null;
  onBack(): void;
}

/**
 * A board already played, opened from the score pad.
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
 * **A page, not a panel, and the rule `Overlay` states is what says so.** A panel is
 * for looking something up with what you were doing still behind it — the score
 * mid-auction, the last trick, the bidding. This is not a glance: it is a traveller,
 * twenty-six cards and an auction, reached by drilling into a list, and a phone
 * answers that with a page you can swipe out of. It was a panel only because it was
 * pushed from one, which is inheritance rather than a reason.
 *
 * That also disposes of the chevron-in-a-panel this briefly grew. A nested panel
 * needed a way to mean "back one step" that was not "dismiss"; a page has the
 * platform's own answer to that, in the corner an iPhone keeps it and on the gesture
 * that corner promises. **Removing the nesting beat accommodating it.**
 *
 * One way out rather than two, because there is only one way in: the reveal between
 * deals draws `BoardDetail` inline, so every board reached *here* was reached from a
 * list, and Back always means the list.
 */
export function BoardReview({
  at,
  me,
  onBack,
  opponentName,
  result,
  review,
}: BoardReviewProps): React.JSX.Element {
  useSwipeBack(onBack);

  return (
    <div className="safe-inset absolute inset-0 z-40 flex flex-col bg-table-dark/97">
      <div className="px-4 pt-4">
        <BackButton onBack={onBack} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-5 pt-2 pb-6">
        <div className="flex w-full max-w-sm flex-col gap-3">
          <h1 className="text-lg font-semibold">Board {at + 1}</h1>
          <BoardDetail at={at} me={me} opponentName={opponentName} result={result} review={review} />
        </div>
      </div>
    </div>
  );
}
