import type { Call, Card, Contract } from "@hb/engine";
import {
  callLabel,
  rankLabel,
  strainIsRed,
  strainSymbol,
  suitIsRed,
  suitSymbol,
} from "../game/labels.js";

/**
 * The ground a card's name is set on, which decides its ink. Each ground has
 * its own pair: on paper it is `text-ink-black` and `text-ink-red`, the inks the
 * cards are printed with; on the table it is the table's own body colour and
 * `text-red-400`, a red that lifts off felt where the printed one goes muddy.
 *
 * **A suit's colour carries exactly one bit: red or black.** That is its whole
 * job in bridge, and white carries it perfectly well — the shape says spade, and
 * the colour only has to say "not a red suit". So a white spade in running text
 * is the correct ink for the table and costs a reader nothing.
 *
 * Which is worth writing down because it was not believed, and four attempts to
 * make every suit in the app black went past it. In order: a chip of paper behind
 * each name (specks of white on a large field of blue); a paper-coloured rim
 * around each name (a sticker cut out and laid on the felt, worst where the name
 * is smallest); printed ink straight onto the table (a silhouette); and washed
 * surfaces behind the contract bar, the scorepad, the settled contract and a
 * deal's result (which worked, and made the app's dark table a lighter one, for
 * a mismatch nobody could see).
 *
 * **Matching the cards' ink matters only where the glyph stands amongst cards.**
 * That is the auction's five strain tiles, inches below thirteen real cards where
 * the same glyph is black — a visible mismatch, fixed there and nowhere else, on
 * real card stock (see `AuctionPhase`'s `strainTone`). Everything else names a
 * card in prose, and prose takes the ink of what it is printed on.
 *
 * The other survivor is `.scorecard` behind the auction record, and it is not an
 * exception to any of this: a two-column record of an auction is a scorecard and
 * looks like one. Black suits fall out of it; they are not why it is there.
 */
export type Ground = "dark" | "light";

const RED: Record<Ground, string> = {
  dark: "text-red-400",
  light: "text-ink-red",
};

/**
 * The class that keeps a red suit red on a given ground.
 *
 * Exported because a symbol shown on its own — a strain button in the auction —
 * has the same problem as one in running text, and the two must not drift into
 * different reds.
 */
export function redTone(on: Ground): string {
  return RED[on];
}

export interface CardTextProps {
  readonly card: Card;
  /** The background it sits on, since red needs to lift off felt as well as white. */
  readonly on: Ground;
}

/**
 * A card named in running text — "Keep 7♦", "3♥ made".
 *
 * The suit has to carry its color here as well as on the card face. A red suit
 * printed black beside the card it refers to reads as a different card, which
 * is exactly the kind of doubt this game does not need in the draw phase.
 */

export function CardText({ card, on }: CardTextProps): React.JSX.Element {
  return (
    <>
      {rankLabel(card.rank)}
      <span className={suitIsRed(card.suit) ? RED[on] : ""}>{suitSymbol(card.suit)}</span>
    </>
  );
}

export function CallText({ call, on }: { readonly call: Call; readonly on: Ground }): React.JSX.Element {
  if (call.type !== "bid") {
    return <>{callLabel(call)}</>;
  }
  return (
    <>
      {call.bid.level}
      <span className={strainIsRed(call.bid.strain) ? RED[on] : ""}>
        {strainSymbol(call.bid.strain)}
      </span>
    </>
  );
}

export function ContractText({
  contract,
  on,
}: {
  readonly contract: Contract;
  readonly on: Ground;
}): React.JSX.Element {
  const suffix =
    contract.doubling === "doubled" ? " X" : contract.doubling === "redoubled" ? " XX" : "";

  return (
    <>
      {contract.level}
      <span className={strainIsRed(contract.strain) ? RED[on] : ""}>
        {strainSymbol(contract.strain)}
      </span>
      {suffix}
    </>
  );
}
