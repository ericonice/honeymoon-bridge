import type { PlayerView } from "@hb/engine";
import { AuctionRecord, ContractLine } from "./AuctionRecord.js";
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
          being made — §1.5, and one component so the two cannot drift. */}
      <AuctionRecord auction={view.auction} me={view.me} opponentName={opponentName}>
        {contract === null ? null : (
          <ContractLine contract={contract} me={view.me} opponentName={opponentName} />
        )}
      </AuctionRecord>
    </Overlay>
  );
}
