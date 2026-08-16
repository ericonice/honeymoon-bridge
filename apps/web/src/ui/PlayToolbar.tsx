const BUTTON = "flex-1 rounded-lg border border-white/25 px-2 py-1.5 text-xs text-white/70 disabled:opacity-25";
const CLAIM_BUTTON =
  "flex-1 rounded-lg border border-amber-300/40 px-2 py-1.5 text-xs text-amber-200/80 disabled:border-white/25 disabled:text-white/70 disabled:opacity-25";

export interface PlayToolbarProps {
  /** Offered only on your own turn, with nothing already pending — a claim
   * while one is outstanding is not a second call to make, it is the other
   * player's, and `ClaimReveal` is where that happens. Disabled rather than
   * hidden, same as the other two: a row that gains and loses a button as
   * the trick changes hands reads as flicker, not as a control appearing. */
  readonly claimable: boolean;
  /** Disabled rather than hidden, same as the button it replaces — there is
   * nothing to look back on before the first trick has resolved. */
  readonly lastTrickAvailable: boolean;
  onClaim(): void;
  onShowBidding(): void;
  onShowLastTrick(): void;
}

/**
 * What there is to do about the deal in progress — Bidding and Last trick are
 * only meaningful once play has started, and Claim only during it, so all
 * three live in a strip just below the scoring section, where the deal they
 * act on is already the subject. Score is not in this strip: it applies on
 * every phase, not just this one, so it stays where `ContractBar` already
 * puts it, a tap on the bar itself, rather than a fourth button here.
 */
export function PlayToolbar({
  claimable,
  lastTrickAvailable,
  onClaim,
  onShowBidding,
  onShowLastTrick,
}: PlayToolbarProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-t border-white/10 bg-white/5 px-4 py-1.5">
      <button type="button" className={BUTTON} onClick={onShowBidding}>
        Bidding
      </button>
      <button type="button" className={BUTTON} disabled={!lastTrickAvailable} onClick={onShowLastTrick}>
        Last trick
      </button>
      <button type="button" className={CLAIM_BUTTON} disabled={!claimable} onClick={onClaim}>
        Claim
      </button>
    </div>
  );
}
