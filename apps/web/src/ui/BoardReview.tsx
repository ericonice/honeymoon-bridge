import { boardPercentageOf, honorsOn, netFor } from "@hb/engine";
import type { Card, FieldResult, PlayerId } from "@hb/engine";
import { useState } from "react";
import type { BoardReview as Review } from "../game/boardReview.js";
import { AuctionRecord, ContractLine } from "./AuctionRecord.js";
import { CardFace } from "./CardFace.js";
import { ContractText } from "./CardText.js";
import { CARD_WIDTHS, MINI_MIN_STEP, spreadStep, useRowRoom } from "./Hand.js";
import { Overlay } from "./Overlay.js";
import { Segmented } from "./Segmented.js";
import { Traveller } from "./Traveller.js";
import { contractTags, resultOf, signed } from "./fieldText.js";

/** The two questions a board raises, which is what the tabs are. */
type Tab = "deal" | "field";

export interface BoardReviewProps {
  /** Which board of the session, for the title. */
  readonly at: number;
  readonly me: PlayerId;
  /** Pops back to the pad this was opened from — see `Overlay`. Null when opened over the board. */
  readonly onBack?: (() => void) | null;
  readonly opponentName: string;
  readonly result: FieldResult;
  readonly review: Review;
  onClose(): void;
}

/**
 * A board you have already played, looked at again.
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
 * **One panel rather than a row that expands and a panel behind it.** The pad used
 * to open a traveller inside the list and put the hands behind a further button,
 * which is two ways in for one question and lost your place in the list on the way
 * back. Everything about a board is here.
 *
 * **Two tabs, because there are two questions and they are asked one at a time.**
 * The field answers *why that percentage* and the deal answers *could I have done
 * better* — and at a phone's width all of it at once is about 590px of content in a
 * panel capped near 630, which grows past it as a board's field fills with people.
 *
 * **Bidding and hands are deliberately not separated.** A third tab for the auction
 * was the shape first proposed and it splits the one comparison this panel exists
 * for: a bridge player reads an auction *against* a holding, and "they bid 4♥ on
 * that?" needs both on screen at once. The seam that costs nothing is between what
 * everybody else did and what happened here.
 *
 * **The header sits above the tabs** rather than inside either, because what the
 * contract was and what it came to is the answer to "what happened" — wanted
 * whichever tab you are on, and what makes the two labels mean anything.
 *
 * **The hands are card faces rather than a written record**, which is the one thing
 * about this that was chosen against a good alternative. Four suit lines a hand is
 * the idiom for looking a deal up and is more compact. Cards win on continuity: they
 * are how a hand has looked on every screen of this game up to now, and a review
 * that asks you to re-read your own hand in another notation is a second thing to
 * learn at the moment you are trying to remember the first.
 */
export function BoardReview({
  at,
  me,
  onBack = null,
  onClose,
  opponentName,
  result,
  review,
}: BoardReviewProps): React.JSX.Element {
  // The field first, because the placing is what a reader tapped the row to explain.
  const [tab, setTab] = useState<Tab>("field");
  const { contract } = result;
  const net = netFor(result.points, me);
  const placed = boardPercentageOf(result, me);
  const vulnerable = result.board.vulnerable;
  const honors =
    contract === null
      ? null
      : honorsOn({ contract, net, seat: me, tricks: result.tricks, vulnerable });
  // `defending` is false whatever the contract, because this header names the
  // declarer outright — there is room for "by Computer" here where a traveller row
  // has only a tag. The tag and the phrase would say one thing twice.
  const tags =
    contract === null
      ? []
      : contractTags({ defending: false, honors, vulnerable: vulnerable[contract.declarer] });

  return (
    <Overlay title={`Board ${at + 1}`} onBack={onBack} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
            {contract === null ? (
              <span className="text-white/60">Passed out</span>
            ) : (
              <>
                <ContractText contract={contract} on="dark" />
                <span>{contract.declarer === me ? "by you" : `by ${opponentName}`}</span>
                <span className="text-xs text-white/45">{resultOf(contract, result.tricks)}</span>
                {tags.map((tag) => (
                  <span key={tag} className="text-[0.65rem] text-white/35">
                    {tag}
                  </span>
                ))}
              </>
            )}
          </span>
          <span className="shrink-0 tabular-nums">
            <span className="text-white/60">{signed(net)}</span>{" "}
            <span className="font-semibold">{placed === null ? "—" : `${Math.round(placed)}%`}</span>
          </span>
        </div>

        <Segmented<Tab>
          options={[
            { label: "The field", value: "field" },
            { label: "The deal", value: "deal" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "field" ? (
          // No caption: the tab that is pressed already says what this is, and a
          // heading repeating it would be the only thing on the panel said twice.
          <Traveller at={at} caption={false} me={me} result={result} />
        ) : (
          <>
            <div>
              <Caption>The hands</Caption>
              {/* Their row above yours, which is where the two have sat on every
                  screen that draws both — the table's own geometry rather than a
                  choice made again here. */}
              <p className="pb-1 text-xs text-white/55">{opponentName}</p>
              <HandRow cards={review.hands[me === 0 ? 1 : 0]} />
              <p className="pt-3 pb-1 text-xs text-white/55">You</p>
              <HandRow cards={review.hands[me]} />
            </div>

            <div>
              <Caption>The bidding</Caption>
              <AuctionRecord auction={review.auction} me={me} opponentName={opponentName}>
                {contract === null ? null : (
                  <ContractLine contract={contract} me={me} opponentName={opponentName} />
                )}
              </AuctionRecord>
            </div>

            {/* The tricks as a count rather than trick by trick. Thirteen pairs of
                cards is the expensive half of this screen and the least often
                wanted: what a board turns on is what was bid and what was held. */}
            <p className="text-xs text-white/35">
              {result.tricks[me]} tricks to you, {result.tricks[me === 0 ? 1 : 0]} to{" "}
              {opponentName}.
            </p>
          </>
        )}

      </div>
    </Overlay>
  );
}

function Caption({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="pb-1.5 text-[0.65rem] tracking-wide text-white/45 uppercase">{children}</p>
  );
}

/**
 * Thirteen cards as they finished, spaced by the rule every other row follows.
 *
 * `spreadStep` rather than a fixed overlap, for the reason it exists: a row that
 * spaces itself differently from the ones on the play screen reads as a different
 * kind of object, and these are the same thirteen cards.
 */
function HandRow({ cards }: { readonly cards: readonly Card[] }): React.JSX.Element {
  const { ref, room } = useRowRoom();
  const step = spreadStep({
    available: room,
    cardWidth: CARD_WIDTHS.mini,
    count: cards.length,
    minStep: MINI_MIN_STEP,
  });

  return (
    <div ref={ref} className="flex w-full items-center">
      {cards.map((card, index) => (
        <div
          key={`${card.rank}${card.suit}`}
          style={index === 0 ? {} : { marginLeft: step - CARD_WIDTHS.mini }}
        >
          <CardFace card={card} size="mini" />
        </div>
      ))}
    </div>
  );
}
