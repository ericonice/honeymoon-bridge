import { boardPercentageOf, honorsOn, netFor } from "@hb/engine";
import type { Card, FieldResult, PlayerId } from "@hb/engine";
import { useState } from "react";
import type { BoardReview as Review } from "../game/boardReview.js";
import { AuctionRecord, ContractLine } from "./AuctionRecord.js";
import { CardFace } from "./CardFace.js";
import { ContractText } from "./CardText.js";
import { CARD_WIDTHS, MINI_MIN_STEP, spreadStep, useRowRoom } from "./Hand.js";
import { Segmented } from "./Segmented.js";
import { Tags, Traveller } from "./Traveller.js";
import { contractTags, resultOf, signed } from "./fieldText.js";

/** The two questions a board raises, which is what the tabs are. */
type Tab = "deal" | "field";

export interface BoardDetailProps {
  /** Which board of the session, for the traveller's own numbering. */
  readonly at: number;
  readonly me: PlayerId;
  readonly opponentName: string;
  readonly result: FieldResult;
  /**
   * What this device kept of the board, or null where it kept nothing.
   *
   * Null for a board finished by a claim, a board passed out, and every board of a
   * session carried across a reload — see `useBoardReviews`. **It still draws on all
   * of them**, because the field is what a reader came for and a `FieldResult`
   * always has one; only the deal is missing, and it says so.
   */
  readonly review: Review | null;
}

/**
 * One board, whole: where it placed among everybody who has held these cards, and
 * what was held and what was said here.
 *
 * **Drawn in two places and therefore one component.** The reveal between deals
 * shows the board just played and the score pad opens any earlier one, and those
 * were different screens until now — the reveal laid out a traveller with a "Hands
 * and bidding" button beneath it, and that button opened a panel that *starts on the
 * field*. So it promised the deal and landed you on what you were already looking
 * at. Now both show the same thing, and the panel adds nothing but its chrome.
 *
 * **Two tabs, because there are two questions and they are asked one at a time.**
 * The field answers *why that percentage* and the deal answers *could I have done
 * better* — and at a phone's width all of it at once is about 590px of content in a
 * panel capped near 630, which grows past it as a board's field fills with people.
 *
 * **Bidding and hands are deliberately not separated.** A third tab for the auction
 * was the shape first proposed, and it splits the one comparison this exists for: a
 * bridge player reads an auction *against* a holding, and "they bid 4♥ on that?"
 * needs both on screen at once. The seam that costs nothing is between what
 * everybody else did and what happened here.
 *
 * **The header sits above the tabs** rather than inside either, because what the
 * contract was and what it came to is the answer to "what happened" — wanted
 * whichever tab you are on, and what makes the two labels mean anything.
 *
 * **The hands are card faces rather than a written record**, which was chosen
 * against a good alternative. Four suit lines a hand is the idiom for looking a deal
 * up and is more compact. Cards win on continuity: they are how a hand has looked on
 * every screen of this game up to now, and a review that asks you to re-read your own
 * hand in another notation is a second thing to learn at the moment you are trying
 * to remember the first.
 */
export function BoardDetail({
  at,
  me,
  opponentName,
  result,
  review,
}: BoardDetailProps): React.JSX.Element {
  // The field first, because the placing is what a reader came to have explained.
  const [tab, setTab] = useState<Tab>("field");
  const { contract } = result;
  const net = netFor(result.points, me);
  const placed = boardPercentageOf(result, me);
  const vulnerable = result.board.vulnerable;
  const honors =
    contract === null
      ? null
      : honorsOn({ contract, net, seat: me, tricks: result.tricks, vulnerable });
  // No `dec`/`def` here: this header names the declarer outright — there is room for
  // "by Computer" where a traveller row has only a tag, and the tag and the phrase
  // would say one thing twice.
  const tags =
    contract === null
      ? []
      : contractTags({ honors, role: null, vulnerable: vulnerable[contract.declarer] });

  return (
    <div className="flex w-full flex-col gap-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
          {contract === null ? (
            <span className="text-white/60">Passed out</span>
          ) : (
            <>
              <ContractText contract={contract} on="dark" />
              <span>{contract.declarer === me ? "by you" : `by ${opponentName}`}</span>
              <span className="text-xs text-white/45">{resultOf(contract, result.tricks)}</span>
              <Tags tags={tags} />
            </>
          )}
        </span>
        <span className="shrink-0 tabular-nums">
          <span className="text-white/60">{signed(net)}</span>{" "}
          <span className="font-semibold">{placed === null ? "—" : `${Math.round(placed)}%`}</span>
        </span>
      </div>

      {review === null ? null : (
        <Segmented<Tab>
          options={[
            { label: "The field", value: "field" },
            { label: "The deal", value: "deal" },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}

      {review === null || tab === "field" ? (
        <>
          {/* Said here rather than only between deals, where it used to live: what
              makes a traveller comparable at all is that every line on it faced the
              same offers, and that is as worth knowing on an old board as a new one. */}
          <p className="text-xs text-white/45">
            Everybody here faced the same offers and kept their own cards.
          </p>
          {/* No caption: the tab that is pressed already says what this is, and with
              no deal to switch to there is no tab either — the surface around it
              names the board. */}
          <Traveller at={at} caption={false} me={me} result={result} />
          {review !== null || contract === null ? null : (
            <p className="text-xs text-white/35">
              The hands and the bidding are not kept for this board.
            </p>
          )}
        </>
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
              cards is the expensive half of this screen and the least often wanted:
              what a board turns on is what was bid and what was held. */}
          <p className="text-xs text-white/35">
            {result.tricks[me]} tricks to you, {result.tricks[me === 0 ? 1 : 0]} to {opponentName}.
          </p>
        </>
      )}
    </div>
  );
}

function Caption({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <p className="pb-1.5 text-[0.65rem] tracking-wide text-white/45 uppercase">{children}</p>;
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
