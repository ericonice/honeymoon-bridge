import { STRAINS, legalActionsForView } from "@hb/engine";
import type { Call, Level, PlayerView, Strain } from "@hb/engine";
import { useEffect, useState } from "react";
import { callLabel, strainIsRed, strainSymbol } from "../game/labels.js";
import { CallText } from "./CardText.js";

const LEVELS: readonly Level[] = [1, 2, 3, 4, 5, 6, 7];

export interface AuctionPhaseProps {
  readonly view: PlayerView;
  onCall(call: Call): void;
}

function callKey(call: Call): string {
  return call.type === "bid" ? `bid:${call.bid.level}:${call.bid.strain}` : call.type;
}

function bidKey(level: Level, strain: Strain): string {
  return `bid:${level}:${strain}`;
}

function legalCallKeys(view: PlayerView): Set<string> {
  const keys = legalActionsForView(view).flatMap((action) =>
    action.type === "call" ? [callKey(action.call)] : [],
  );
  return new Set(keys);
}

const BUTTON = "rounded-lg py-2.5 text-sm font-semibold disabled:opacity-20";

function toneFor(selected: boolean): string {
  return selected ? "bg-amber-400 text-stone-900" : "bg-white/10 text-white";
}

/**
 * The auction so far, in two columns. Calls strictly alternate, so each one
 * belongs to a fixed column and the rows line up without any bookkeeping.
 */
function History({ view }: { readonly view: PlayerView }): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
      <div className="grid grid-cols-2 gap-x-6 text-sm">
        <p className="pb-1 text-xs text-white/45">You</p>
        <p className="pb-1 text-xs text-white/45">Opponent</p>
        {view.auction.map((entry, index) => (
          // The auction is append-only, so the index is a stable identity.
          <p key={index} className={entry.by === view.me ? "col-start-1" : "col-start-2"}>
            <CallText call={entry.call} on="dark" />
          </p>
        ))}
      </div>
      {view.auction.length === 0 ? <p className="pt-2 text-sm text-white/40">No calls yet.</p> : null}
    </div>
  );
}

export function AuctionPhase({ onCall, view }: AuctionPhaseProps): React.JSX.Element {
  const [level, setLevel] = useState<Level | null>(null);
  const [chosen, setChosen] = useState<Call | null>(null);

  const myTurn = view.toAct === view.me;
  const legal = legalCallKeys(view);

  // Anything picked before the opponent called may no longer be legal, and in
  // any case the auction has moved on. Start the decision again.
  const callCount = view.auction.length;
  useEffect(() => {
    setLevel(null);
    setChosen(null);
  }, [callCount]);

  const levelIsOpen = (candidate: Level): boolean =>
    STRAINS.some((strain) => legal.has(bidKey(candidate, strain)));

  // Pre-select the cheapest level still available, since that is where most
  // bids live. The strain still has to be chosen, and confirmed, deliberately.
  const activeLevel = level ?? LEVELS.find(levelIsOpen) ?? null;

  function chooseLevel(next: Level): void {
    setLevel(next);
    // The bid under consideration was at the old level, so it no longer stands.
    setChosen(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <History view={view} />

      <div className="flex flex-col gap-1.5 px-3">
        <div className="grid grid-cols-7 gap-1.5">
          {LEVELS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={`${BUTTON} ${toneFor(activeLevel === candidate)}`}
              disabled={!myTurn || !levelIsOpen(candidate)}
              onClick={() => {
                chooseLevel(candidate);
              }}
            >
              {candidate}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {STRAINS.map((strain) => {
            const open = activeLevel !== null && legal.has(bidKey(activeLevel, strain));
            const selected =
              chosen !== null && chosen.type === "bid" && chosen.bid.strain === strain;

            return (
              <button
                key={strain}
                type="button"
                className={`${BUTTON} ${toneFor(selected)}`}
                disabled={!myTurn || !open}
                onClick={() => {
                  if (activeLevel !== null) {
                    setChosen({ type: "bid", bid: { level: activeLevel, strain } });
                  }
                }}
              >
                <span className={strainIsRed(strain) && !selected ? "text-red-400" : ""}>
                  {strainSymbol(strain)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {([{ type: "pass" }, { type: "double" }, { type: "redouble" }] as const).map((call) => (
            <button
              key={call.type}
              type="button"
              className={`${BUTTON} ${toneFor(chosen !== null && chosen.type === call.type)}`}
              disabled={!myTurn || !legal.has(call.type)}
              onClick={() => {
                setChosen(call);
              }}
            >
              {callLabel(call)}
            </button>
          ))}
        </div>
      </div>

      {/* Always present rather than appearing once a call is picked, so the
          layout does not jump and no space is reserved for a hint. It is still
          a second, deliberate tap — a misplaced call cannot be taken back — and
          backing out is just picking something else. */}
      <div className="px-3 pt-2 pb-3">
        <button
          type="button"
          className="w-full rounded-xl bg-white px-4 py-3.5 text-base font-semibold text-stone-900 disabled:bg-white/10 disabled:text-white/50"
          disabled={!myTurn || chosen === null}
          onClick={() => {
            if (chosen !== null) {
              onCall(chosen);
            }
          }}
        >
          {!myTurn ? (
            "Opponent is bidding…"
          ) : chosen === null ? (
            "Choose a call"
          ) : (
            <>
              Confirm <CallText call={chosen} on="light" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
