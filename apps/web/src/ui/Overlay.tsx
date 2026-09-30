import { ChevronLeftIcon } from "./icons.js";

export interface OverlayProps {
  readonly children: React.ReactNode;
  /**
   * Pops back to the panel this was pushed from, rather than dismissing everything.
   *
   * Null — the usual case — for a panel opened over the board, where there is nothing
   * behind it but the game and ✕ is the whole of what a reader needs.
   */
  readonly onBack?: (() => void) | null;
  onClose(): void;
  readonly title: string;
}

/**
 * What a surface calls its way out, which was two words for one thing.
 *
 * **A surface that fills the screen says "Back". A panel floating over what you were
 * doing gets a ✕.** Nothing else: the question is not where you came from, which
 * varies — Help opens from Home, from Settings and from the middle of an auction —
 * but whether the thing you were doing is still on screen behind it. If it is, you
 * are dismissing something; if it is not, you are going back.
 *
 * By that rule Help and Settings were the only two wrong. Both are `absolute inset-0`
 * over an opaque ground, so they are screens wearing the word "overlay" in their
 * filenames, and they said "Close" while the record, the achievements, the account
 * page and the scoring page all said "Back" from the identical position.
 *
 * **There is a third case, and it arrived the day a panel could open another one.**
 * Tapping a board in the Score panel used to stack a second panel on the first: two
 * dimmed grounds, two ✕s and nothing saying which one a swipe would dismiss — not a
 * phone pattern, and against the rule above as well, since what sits behind the
 * second ✕ is another panel rather than the game. A panel *pushed from within* a
 * panel replaces it and takes `onBack`, which is a chevron beside the title exactly
 * where a screen keeps one. The ✕ stays, and dismisses the lot: back one step and
 * out altogether are different intentions and a sheet with a stack in it needs both.
 */

/**
 * A panel over the table rather than in place of it.
 *
 * `ClaimConfirm` and `LeaveConfirm` are asking for a decision and take the
 * bottom of the screen for it; this is for looking something up mid-trick, so
 * it stays centered and short rather than pushing the table out of the way —
 * shared by every button in the strip under `ContractBar` so checking the
 * bidding, the last trick or the score all feel like the same kind of glance.
 */
export function Overlay({ children, onBack = null, onClose, title }: OverlayProps): React.JSX.Element {
  return (
    <div
      className="safe-inset absolute inset-0 z-30 flex items-center justify-center bg-black/75 px-5"
      onClick={onClose}
    >
      <div
        className="flex max-h-[75vh] w-full max-w-sm flex-col gap-3 rounded-2xl bg-table-dark px-5 py-4"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            {onBack == null ? null : (
              <button
                type="button"
                aria-label="Back"
                className="-ml-1.5 flex items-center rounded-lg px-1 py-1 text-white/70"
                onClick={onBack}
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
            )}
            <h2 className="truncate text-base font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="px-1 text-lg leading-none text-white/50"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
