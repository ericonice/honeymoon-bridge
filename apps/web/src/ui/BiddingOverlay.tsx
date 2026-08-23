import type { PlayerView } from "@hb/engine";
import { CallText, ContractText } from "./CardText.js";
import { Overlay } from "./Overlay.js";

export interface BiddingOverlayProps {
  onClose(): void;
  readonly opponentName: string;
  readonly view: PlayerView;
}

/**
 * The auction that set the contract, on demand during play.
 *
 * `AuctionPhase` shows this same record while it is being made; once play
 * starts there is no screen left that reads `view.auction` at all, so a level
 * or a double made several calls back is gone unless this seat remembered it
 * — the same kind of recall the discards are testing, but nothing here forces
 * that memory the way §1.3 forces it for the draw.
 */
export function BiddingOverlay({ onClose, opponentName, view }: BiddingOverlayProps): React.JSX.Element {
  const { contract } = view;

  return (
    <Overlay title="Bidding" onClose={onClose}>
      {/* The same scorecard `AuctionPhase` writes this record on while it is
          being made — §1.5. One surface for the whole account rather than a mark
          per call, which is what lets every black suit in here be black. */}
      <div className="scorecard rounded-xl px-3 py-2">
        <div className="grid grid-cols-2 gap-x-6 text-sm">
          <p className="pb-1 text-xs text-ink-black/55">You</p>
          <p className="pb-1 text-xs text-ink-black/55">{opponentName}</p>
          {view.auction.map((entry, index) => (
            // The auction is append-only, so the index is a stable identity.
            <p key={index} className={entry.by === view.me ? "col-start-1" : "col-start-2"}>
              <CallText call={entry.call} on="light" />
            </p>
          ))}
        </div>
        {contract === null ? null : (
          <p className="mt-2 border-t border-ink-black/15 pt-2 text-sm text-ink-black/75">
            <ContractText contract={contract} on="light" />{" "}
            {contract.declarer === view.me ? "by you" : `by ${opponentName}`}
          </p>
        )}
      </div>
    </Overlay>
  );
}
