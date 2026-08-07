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
 * A card named in running text — "Keep 7♦", "3♥ made".
 *
 * The suit has to carry its colour here as well as on the card face. A red suit
 * printed black beside the card it refers to reads as a different card, which
 * is exactly the kind of doubt this game does not need in the draw phase.
 */
export type Ground = "dark" | "light";

const RED: Record<Ground, string> = {
  dark: "text-red-400",
  light: "text-red-600",
};

export interface CardTextProps {
  readonly card: Card;
  /** The background it sits on, since red needs to lift off felt as well as white. */
  readonly on: Ground;
}

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
