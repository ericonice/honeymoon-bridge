export interface OverlayProps {
  readonly children: React.ReactNode;
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
export function Overlay({ children, onClose, title }: OverlayProps): React.JSX.Element {
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
          <h2 className="text-base font-semibold">{title}</h2>
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
