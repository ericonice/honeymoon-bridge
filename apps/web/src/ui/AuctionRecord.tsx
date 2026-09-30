import type { AuctionEntry, Contract, PlayerId } from "@hb/engine";
import { CallText, ContractText } from "./CardText.js";

export interface AuctionRecordProps {
  readonly auction: readonly AuctionEntry[];
  /** What to rule under the calls — the contract they settled on, where there is one. */
  readonly children?: React.ReactNode;
  readonly me: PlayerId;
  readonly opponentName: string;
}

/**
 * The auction, written onto a scorecard.
 *
 * Two columns, because calls strictly alternate: each one belongs to a fixed column
 * and the rows line up without any bookkeeping.
 *
 * **The surface is what makes a spade black here** (§1.5). A black suit cannot be
 * printed black on the table, and giving each call its own little chip of paper was
 * tried and reads as a row of specks — so the record gets *one* surface instead of
 * six, and every call on it takes the cards' own inks. A spade in the auction record
 * is then the same black as the spade in your hand.
 *
 * Paper at 55% rather than solid, so it composites with whatever table is behind it:
 * it reads as a ruled area the auction is written into rather than a white card laid
 * on top of one, and it needs no per-theme value of its own. That figure is the only
 * dial here — lower melds further and costs contrast.
 *
 * It takes the calls rather than a `PlayerView`, which is what lets a board already
 * played draw its own auction from what was kept of it. Three screens showed this
 * record and two of them held their own copy of the markup; this is that copy taken
 * down to one.
 */
export function AuctionRecord({
  auction,
  children,
  me,
  opponentName,
}: AuctionRecordProps): React.JSX.Element {
  return (
    <div className="scorecard rounded-xl px-3 py-2">
      <div className="grid grid-cols-2 gap-x-6 text-sm">
        <p className="pb-1 text-xs text-ink-black/55">You</p>
        <p className="pb-1 text-xs text-ink-black/55">{opponentName}</p>
        {auction.map((entry, index) => (
          // The auction is append-only, so the index is a stable identity.
          <p key={index} className={entry.by === me ? "col-start-1" : "col-start-2"}>
            <CallText call={entry.call} on="light" />
          </p>
        ))}
      </div>
      {auction.length === 0 ? <p className="text-sm text-ink-black/50">No calls yet.</p> : null}
      {children}
    </div>
  );
}

/**
 * What the calls settled on, ruled under them.
 *
 * A child of the record rather than part of it, because the auction in progress has
 * nothing to rule off yet — and its own component rather than markup repeated at
 * each call site, which is what the record itself was until now.
 */
export function ContractLine({
  contract,
  me,
  opponentName,
}: {
  readonly contract: Contract;
  readonly me: PlayerId;
  readonly opponentName: string;
}): React.JSX.Element {
  return (
    <p className="mt-2 border-t border-ink-black/15 pt-2 text-sm text-ink-black/75">
      <ContractText contract={contract} on="light" />{" "}
      {contract.declarer === me ? "by you" : `by ${opponentName}`}
    </p>
  );
}
