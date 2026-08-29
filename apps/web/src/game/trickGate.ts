import type { SessionSnapshot } from "@hb/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { trickStageTime } from "./timing.js";

/**
 * What the screen is entitled to be looking at, which is not always the latest
 * thing the server has said.
 *
 * **The pacing of a resolved trick has to be enforced by the seat that is
 * watching it, because the seat that ends it is on another device.** Against the
 * computer this never came up: `localSession` sets `trickAwaitingDismissal` the
 * instant a trick resolves and the bot's own scheduling effect refuses to run
 * while it is set, so nothing can land on top of a trick nobody has seen. Over a
 * socket the next card is chosen by a person, whose own screen is holding their
 * copy of that trick and whose hand is not gated by it — so a tap through the
 * hold sends a lead that arrives here while the trick it is leading past is still
 * being read. `PlayPhase` shows `view.currentTrick` the moment it is non-empty,
 * so the resolved trick was not merely rushed: it was replaced outright, with no
 * sweep and no sight of who took it.
 *
 * Gating the *sender* was the other candidate and does not work, for the reason
 * this comment opens with. A player who taps straight through their own hold
 * still sends straight away, and a card that has arrived cannot be unseen. So the
 * card is held here, and the hold is only ever as long as this screen still needs
 * — see `useTrickGate`.
 */
export interface TrickGate {
  /** A trick has resolved on this screen and has not yet been seen. */
  readonly awaitingDismissal: boolean;
  /** The resolved trick has had its moment: show anything held back. */
  dismiss(): void;
  /**
   * Hands the gate what the server just sent, which is null until both seats are
   * filled and there is a deal to describe.
   */
  receive(next: SessionSnapshot | null): void;
  /** Null until the first snapshot arrives, as `useNetworkSession`'s always was. */
  readonly snapshot: SessionSnapshot | null;
}

/**
 * Whether showing `next` would drop the first card of a new trick on top of a
 * resolved one still lying on the table.
 *
 * Exactly the shape that has to wait, and nothing else:
 *
 *  - Both ends are in the play phase, so a deal ending — the thirteenth trick,
 *    where the reveal is the next thing due — is never delayed.
 *  - The completed-trick counts match, so the card genuinely opens a new trick
 *    rather than closing the one on the table. A card that *completes* a trick
 *    has to land: it is what resolves it.
 *  - There is a resolved trick to protect. An opening lead has nothing under it.
 *  - It is the opponent's card. This seat's own play must never be held: it flies
 *    from the hand that was just tapped, and a tap that does nothing for two
 *    seconds reads as a dead screen.
 */
export function landsOnResolvedTrick(shown: SessionSnapshot, next: SessionSnapshot): boolean {
  const before = shown.view;
  const after = next.view;
  return (
    before.phase === "play" &&
    after.phase === "play" &&
    before.currentTrick.length === 0 &&
    before.completedTricks.length > 0 &&
    after.currentTrick.length === 1 &&
    after.completedTricks.length === before.completedTricks.length &&
    after.currentTrick[0]?.by !== after.me
  );
}

/**
 * The snapshot the screen is shown, held back over a resolved trick.
 *
 * **The hold costs nothing when the other player is not rushing, and that is the
 * whole design.** It runs until `dismiss` — which `PlayPhase` calls when its own
 * sweep finishes, and a tap on the table calls early — so it is measured from
 * when the trick landed *here* rather than from when the next card arrived. An
 * opponent who waits out their own hold has already spent it, `dismiss` has
 * already run, and nothing is held at all. Only a lead that beats this screen's
 * own choreography waits, and only for the remainder.
 *
 * The failsafe exists because a held snapshot must never be strandable: if
 * `PlayPhase` is unmounted before its sweep fires there is nothing left to call
 * `dismiss`, and the game would simply stop. `trickStageTime` is the ceiling
 * rather than the mechanism.
 *
 * Nothing is held except a play — see `landsOnResolvedTrick` — so a reconnect, a
 * new deal and the end of a match all arrive at once, and a held snapshot is
 * dropped the moment anything else does.
 */
export function useTrickGate(): TrickGate {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [awaitingDismissal, setAwaitingDismissal] = useState(false);
  const shown = useRef<SessionSnapshot | null>(null);
  const held = useRef<SessionSnapshot | null>(null);
  const failsafe = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The same flag as the state beside it, readable from the socket's own message
  // handler — which is registered once per connection and so closes over whatever
  // the state was then.
  const awaiting = useRef(false);

  const clearFailsafe = useCallback((): void => {
    if (failsafe.current !== null) {
      clearTimeout(failsafe.current);
      failsafe.current = null;
    }
  }, []);

  const show = useCallback((next: SessionSnapshot | null): void => {
    const previous = shown.current;
    shown.current = next;
    // A trick lying on the table, resolved, with nothing played to the next one.
    const lying =
      next !== null &&
      next.view.phase === "play" &&
      next.view.currentTrick.length === 0 &&
      next.view.completedTricks.length > 0;
    if (!lying) {
      // Forced rather than left alone, so the flag cannot survive a deal ending
      // into the next deal, where it would gate a trick it was never about.
      awaiting.current = false;
      setAwaitingDismissal(false);
    } else if (
      next !== null &&
      previous !== null &&
      next.view.completedTricks.length > previous.view.completedTricks.length
    ) {
      // Set on the transition rather than derived from `lying`, because a tap has
      // to be able to clear it while the trick is still on the table. Compared
      // against the previous count for the reason `localSession` compares against
      // it too: a new deal resets it to zero, and that is not a trick anyone needs
      // to be shown. A snapshot arriving with no previous one is a resume rather
      // than a trick being taken, and gets no beat.
      awaiting.current = true;
      setAwaitingDismissal(true);
    }
    setSnapshot(next);
  }, []);

  const release = useCallback((): void => {
    clearFailsafe();
    const next = held.current;
    held.current = null;
    if (next !== null) {
      show(next);
    }
  }, [clearFailsafe, show]);

  const dismiss = useCallback((): void => {
    awaiting.current = false;
    setAwaitingDismissal(false);
    release();
  }, [release]);

  const receive = useCallback(
    (next: SessionSnapshot | null): void => {
      if (
        next !== null &&
        awaiting.current &&
        shown.current !== null &&
        landsOnResolvedTrick(shown.current, next)
      ) {
        held.current = next;
        failsafe.current ??= setTimeout(release, trickStageTime());
        return;
      }
      held.current = null;
      clearFailsafe();
      show(next);
    },
    [clearFailsafe, release, show],
  );

  useEffect(() => clearFailsafe, [clearFailsafe]);

  return { awaitingDismissal, dismiss, receive, snapshot };
}
