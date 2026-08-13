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
      <div className="grid grid-cols-2 gap-x-6 text-sm">
        <p className="pb-1 text-xs text-white/45">You</p>
        <p className="pb-1 text-xs text-white/45">{opponentName}</p>
        {view.auction.map((entry, index) => (
          // The auction is append-only, so the index is a stable identity.
          <p key={index} className={entry.by === view.me ? "col-start-1" : "col-start-2"}>
            <CallText call={entry.call} on="dark" />
          </p>
        ))}
      </div>
      {contract === null ? null : (
        <p className="mt-3 border-t border-white/10 pt-3 text-sm text-white/70">
          <ContractText contract={contract} on="dark" />{" "}
          {contract.declarer === view.me ? "by you" : `by ${opponentName}`}
        </p>
      )}
    </Overlay>
  );
}
