import { STRAINS, legalActionsForView } from "@hb/engine";
import type { Call, Level, Pair, PlayerView, Strain } from "@hb/engine";
import { useEffect, useState } from "react";
import { callLabel, strainIsRed, strainSymbol } from "../game/labels.js";
import { CallText, ContractText, redTone } from "./CardText.js";
import { SeatLabel } from "./SeatLabel.js";

const LEVELS: readonly Level[] = [1, 2, 3, 4, 5, 6, 7];

export interface AuctionPhaseProps {
  readonly opponentName: string;
  readonly view: PlayerView;
  readonly vulnerable: Pair<boolean>;
  onCall(call: Call): void;
  /**
   * Non-null only once the auction has closed and this screen is being held
   * open over a deal that has already moved on. Calling it gives the play
   * screen up to the deal.
   */
  onStartPlay: (() => void) | null;
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
 * The strain buttons are printed on card stock, and they are the one row in the
 * app that had to be.
 *
 * A suit symbol on the table has to be drawn white to be seen, and these five
 * sit inches below thirteen real cards where the identical glyph is black. That
 * mismatch is visible, and it is visible *here* rather than in prose because
 * these are tap targets standing for suits — objects amongst objects, not a
 * sentence about one.
 *
 * So the row borrows `card-face`, the class the cards themselves use, picking up
 * whichever paper and pattern the theme is on, and takes the cards' inks with
 * it: `text-ink-black`, or `redTone("light")` for a red suit. Selection stays
 * amber, which is also a light ground, so the ink no longer changes value
 * between the two states as it had to while one of them was dark.
 *
 * **This does not generalise, and trying to cost a long detour.** See
 * `CardText`'s own note: a suit's colour carries one bit, red or black, and
 * white carries it perfectly well in running text. Paper belongs where a glyph
 * stands amongst cards, which is here and nowhere else.
 */
function strainTone(selected: boolean): string {
  return `text-ink-black ${selected ? "bg-amber-400" : "card-face"}`;
}

/**
 * The auction so far, written onto a scorecard.
 *
 * Two columns, because calls strictly alternate: each one belongs to a fixed
 * column and the rows line up without any bookkeeping.
 *
 * **The surface is what makes a spade black here** (§1.5). A black suit cannot
 * be printed black on the table, and giving each call its own little chip of
 * paper was tried and reads as a row of specks — so the record gets *one*
 * surface instead of six, and every call on it takes the cards' own inks. A
 * spade in the auction record is then the same black as the spade in your hand.
 *
 * Paper at 55% rather than solid, so it composites with whatever table is
 * behind it: it reads as a ruled area the auction is written into rather than a
 * white card laid on top of one, and it needs no per-theme value of its own.
 * That figure is the only dial here — lower melds further and costs contrast.
 */
function History({
  opponentName,
  view,
}: {
  readonly opponentName: string;
  readonly view: PlayerView;
}): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
      <div className="scorecard rounded-xl px-3 py-2">
        <div className="grid grid-cols-2 gap-x-6 text-sm">
          <p className="pb-1 text-xs text-ink-black/55">You</p>
          <p className="pb-1 text-xs text-ink-black/55">{opponentName}</p>
          {view.auction.map((entry, index) => (
            // The auction is append-only, so the index is a stable identity.
            <p key={index} className={entry.by === view.me ? "col-start-1" : "col-start-2"}>
              <CallText call={entry.call} on="light" />
            </p>
          ))}
        </div>
        {view.auction.length === 0 ? (
          <p className="text-sm text-ink-black/50">No calls yet.</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * What the auction settled on, in place of the calls once there are none left
 * to make.
 *
 * Who leads is stated rather than left to be worked out: the lead is the
 * *non-declarer's*, which is the rule here people most reliably have backwards,
 * and it is the very next thing that happens.
 */
function Settled({
  opponentName,
  view,
}: {
  readonly opponentName: string;
  readonly view: PlayerView;
}): React.JSX.Element | null {
  const { contract } = view;
  if (contract === null) {
    return null;
  }

  const declared = contract.declarer === view.me;
  return (
    <div className="flex flex-col items-center gap-1 py-3">
      <p className="text-xs tracking-widest text-white/40 uppercase">Contract</p>
      <p className="text-3xl font-semibold">
        <ContractText contract={contract} on="dark" />
      </p>
      <p className="text-sm text-white/60">
        by {declared ? "you" : opponentName} — {declared ? opponentName : "you"} to lead
      </p>
    </div>
  );
}

export function AuctionPhase({
  onCall,
  onStartPlay,
  opponentName,
  view,
  vulnerable,
}: AuctionPhaseProps): React.JSX.Element {
  const [level, setLevel] = useState<Level | null>(null);
  const [chosen, setChosen] = useState<Call | null>(null);

  const myTurn = view.toAct === view.me;
  const legal = legalCallKeys(view);
  // The deal has already moved to the play; this screen is only still up
  // because §1.6 holds it there until it is dismissed.
  const closed = onStartPlay !== null;

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
      {/* The auction has no cards on the table for a label to sit beside, so
          the two seats go above the record of what each of them has said. */}
      <div className="flex items-center justify-between px-4 pt-2">
        <SeatLabel active={!myTurn} name={opponentName} vulnerable={vulnerable[view.opponent]} />
        <SeatLabel active={myTurn} name="You" vulnerable={vulnerable[view.me]} />
      </div>

      <History opponentName={opponentName} view={view} />

      {/* Once the auction has closed there are no calls left to make, so the
          three grids give their room to what they settled on. Leaving them
          there disabled would fill the screen with dead buttons at the one
          moment the record above them is the thing worth reading. */}
      {closed ? (
        <Settled opponentName={opponentName} view={view} />
      ) : (
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
                  className={`${BUTTON} ${strainTone(selected)}`}
                  disabled={!myTurn || !open}
                  onClick={() => {
                    if (activeLevel !== null) {
                      setChosen({ type: "bid", bid: { level: activeLevel, strain } });
                    }
                  }}
                >
                  {/* Both grounds this button has are light, so this is the
                      printed red in either state — it no longer changes value
                      when the tile turns amber. A black suit and NT inherit
                      `text-ink-black` from the button — see `strainTone`. */}
                  <span className={strainIsRed(strain) ? redTone("light") : ""}>
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
      )}

      {/* Always present rather than appearing once a call is picked, so the
          layout does not jump and no space is reserved for a hint. It is still
          a second, deliberate tap — a misplaced call cannot be taken back — and
          backing out is just picking something else. */}
      <div className="px-3 pt-2 pb-3">
        <button
          type="button"
          className="w-full rounded-xl bg-white px-4 py-3.5 text-base font-semibold text-stone-900 disabled:bg-white/10 disabled:text-white/50"
          disabled={!closed && (!myTurn || chosen === null)}
          onClick={() => {
            if (onStartPlay !== null) {
              onStartPlay();
            } else if (chosen !== null) {
              onCall(chosen);
            }
          }}
        >
          {closed ? (
            // Not "close" or "continue": what it does is hand the deal to the
            // play screen, and the opening lead is the next thing to happen.
            "Start play"
          ) : !myTurn ? (
            // The seat labels say whose turn it is; this says what to do.
            "Their bid"
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
