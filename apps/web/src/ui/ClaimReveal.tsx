import { cardId } from "@hb/engine";
import type { Card } from "@hb/engine";
import { CardFace } from "./CardFace.js";
import { CARD_WIDTHS, MINI_MIN_STEP, spreadStep, useRowRoom } from "./Hand.js";

export interface ClaimRevealProps {
  readonly cards: readonly Card[];
  readonly claimantName: string;
  onAccept(): void;
  onDeny(): void;
}

/**
 * Somebody else's claim, put to you.
 *
 * The one moment in the whole game where the other seat's hand is shown on
 * purpose — a real game event, not the development-only peek `OpponentPeek`
 * offers, so it gets its own framing rather than that one's fuchsia "you are
 * looking at something you should not" treatment. Accepting or denying is
 * itself the decision; there is no further confirmation on top of it.
 */
export function ClaimReveal({
  cards,
  claimantName,
  onAccept,
  onDeny,
}: ClaimRevealProps): React.JSX.Element {
  const { ref: roomRef, room } = useRowRoom();
  const step = spreadStep({
    available: room,
    cardWidth: CARD_WIDTHS.mini,
    count: cards.length,
    minStep: MINI_MIN_STEP,
  });

  return (
    <div className="safe-inset absolute inset-0 z-40 flex flex-col justify-end bg-black/70 px-5 pb-5">
      <div className="flex flex-col gap-4 rounded-2xl bg-table-dark px-5 py-5">
        <div>
          <span className="text-xs tracking-wide text-amber-200/80 uppercase">Claim</span>
          <h2 className="text-lg font-semibold">{claimantName} claims the rest</h2>
          <p className="mt-1 text-sm text-white/55">
            Their remaining hand, face up. Accept if you agree every trick from here is theirs;
            deny to keep playing it out. Either way, you will see this hand for the rest of the
            deal.
          </p>
        </div>

        {/* Spaced the way every other row of cards in the app is — see
            `spreadStep`. A claim is usually made with few cards left, which is
            exactly where a fixed overlap looks wrong: five cards bunched at
            thirteen-card spacing in a box with room for all of them. */}
        <div ref={roomRef} className="flex h-16 w-full items-center justify-center">
          <div className="flex items-center">
            {cards.map((card, index) => (
              <div
                key={cardId(card)}
                style={index === 0 ? {} : { marginLeft: step - CARD_WIDTHS.mini }}
              >
                <CardFace card={card} size="mini" />
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="w-full rounded-xl bg-white px-4 py-3.5 text-base font-semibold text-stone-900"
          onClick={onAccept}
        >
          Accept
        </button>
        <button
          type="button"
          className="w-full rounded-xl border border-white/25 px-4 py-3.5 text-base text-white"
          onClick={onDeny}
        >
          Deny, keep playing
        </button>
      </div>
    </div>
  );
}
