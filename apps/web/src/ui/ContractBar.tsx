import type { DealPhase, PlayerView } from "@hb/engine";
import { ContractText } from "./CardText.js";

export interface ContractBarProps {
  readonly opponentName: string;
  /** Shown phase, same lag as `TopBar` — see its own doc for why. */
  readonly phase: DealPhase;
  readonly view: PlayerView;
}

/**
 * The contract and the running trick count, in a strip of their own below the
 * top bar.
 *
 * Both used to live in the bar itself, competing for the same row as leaving,
 * the score button and — when a dev build turns it on — the skip shortcut.
 * The contract text is the one piece of chrome that actually changes every
 * deal, so it earns a stable place rather than however much room is left
 * over once navigation has taken its share; on a narrow phone that room was
 * sometimes only "2NT by…".
 *
 * Null outside the play phase: during the draw and the auction there is no
 * contract yet and the trick count is always nil, which is no information at
 * all — see `TopBar`'s own headline for what those phases show instead.
 */
export function ContractBar({
  opponentName,
  phase,
  view,
}: ContractBarProps): React.JSX.Element | null {
  if (phase !== "play" && phase !== "complete") {
    return null;
  }
  const contract = view.contract;
  if (contract === null) {
    return null;
  }

  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-white/10 bg-white/5 px-4 py-1.5 text-sm">
      <p className="min-w-0 truncate text-white/85">
        <ContractText contract={contract} on="dark" />{" "}
        {contract.declarer === view.me ? "by you" : `by ${opponentName}`}
      </p>
      <p className="shrink-0 tabular-nums text-white/60">
        Tricks {view.tricksWon[view.me]} – {view.tricksWon[view.opponent]}
      </p>
    </div>
  );
}
