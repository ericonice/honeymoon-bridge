import type { CompletedTrick, PlayedCard, PlayerId, PlayerView } from "@hb/engine";
import { CardFace, CardSlot } from "./CardFace.js";
import { Overlay } from "./Overlay.js";

export interface LastTrickOverlayProps {
  onClose(): void;
  readonly opponentName: string;
  readonly trick: CompletedTrick;
  readonly view: PlayerView;
}

/**
 * The trick just before this one, on demand.
 *
 * Both cards were played face up and both players saw them, so this reveals
 * nothing private — it is the paper game's right to look back at the trick
 * just played. Deliberately only the most recent one: the full history is in
 * the view, and showing it would turn a game where memory is the point into a
 * reference table.
 */
export function LastTrickOverlay({
  onClose,
  opponentName,
  trick,
  view,
}: LastTrickOverlayProps): React.JSX.Element {
  const played = (player: PlayerId): PlayedCard | undefined =>
    trick.cards.find((card) => card.by === player);

  return (
    <Overlay title={`Trick ${view.completedTricks.length}`} onClose={onClose}>
      <div className="flex items-center justify-center gap-8 py-2">
        {([view.opponent, view.me] as const).map((player) => {
          const card = played(player);
          return (
            <div key={player} className="flex flex-col items-center gap-2">
              <p className="text-xs text-white/50">{player === view.me ? "You" : opponentName}</p>
              {card === undefined ? (
                <CardSlot size="table" />
              ) : (
                <CardFace card={card.card} size="table" />
              )}
            </div>
          );
        })}
      </div>
      <p className="pt-1 text-center text-base font-semibold">
        {trick.winner === view.me ? "You won it" : `${opponentName} won it`}
      </p>
    </Overlay>
  );
}
