import { useEffect, useRef } from "react";
import { hapticDealWon, hapticGameWon, hapticMatchWon } from "./haptics.js";
import { declaringIn, outlookFor } from "./outlook.js";
import type { GameSession } from "./session.js";
import {
  playAchievement,
  playCall,
  playCardPlayed,
  playDealOutcome,
  playDrawResolve,
  playRubberWon,
} from "./soundEffects.js";

/**
 * Sound and haptic feedback for the events a deal produces, wired once here so
 * the game against the computer and a table over the network get the same
 * cues — `GameBoard` is the one component both sessions render through.
 *
 * Haptics are a three-tier, positive-only ladder — winning a deal, winning a
 * game inside a rubber, winning the match itself — each felt more strongly
 * than the last (`haptics.ts`). Positive-only on purpose: the sound marks
 * either outcome, since a loss is news too, but the ladder is meant to be felt
 * as encouragement climbing toward the match rather than as a running
 * commentary on every result either way. A tap on every card play or every
 * draw turn was tried and cut before this shape was settled on — each of
 * those is either an action this seat's own finger already felt land, or an
 * opponent's move the screen already shows, so it read as noise rather than
 * as one of these three milestones.
 *
 * The haptics share these effects rather than getting a hook of their own, on
 * purpose: a second hook re-deriving the same rising edges is two accounts of
 * the same event with no way to keep them agreeing — exactly the shape of bug
 * this file's own history (the fog horn, the unlock chime) keeps recording.
 * They fire unconditionally rather than gated on `enabled`: they are inert
 * off-device already (see `haptics.ts`), and there is no existing "vibration"
 * setting for them to respect the way sound has one to mute.
 *
 * Every ref below is kept current regardless of `enabled`, so a match played
 * with sound off and then turned on mid-way does not fire a catch-up burst for
 * everything that happened while it was muted, and mounting mid-match (a
 * network reconnect) does not fire one either.
 */
export interface GameSounds {
  readonly enabled: boolean;
  readonly session: GameSession;
  /**
   * True once the final score screen is actually on screen, which is later than
   * the rubber being won.
   *
   * The two look like the same moment and are not. `matchComplete` flips the
   * instant the last deal is scored, while the board is still holding the last
   * trick and revealing both hands — so the horn used to sound over the end of
   * the play rather than over the result, several seconds before anything said
   * who had won. The board decides when that screen appears (`useShownPhase`
   * holds the phase open for a beat, or until a tap), so it has to be the board
   * that says when, rather than this hook guessing at the same delay.
   */
  readonly showingFinalScore: boolean;
}

export function useGameFeedback({ enabled, session, showingFinalScore }: GameSounds): void {
  const { justUnlocked, lastDraw, matchComplete, score, standing, view, winner } = session;
  const auction = view.auction;

  // Only a rubber standing (or a mirror's own half, which is a rubber
  // standing too) has games at all — duplicate has no such concept, so this
  // stays zero for it and the effect below never fires. This seat's own count
  // specifically, not both sides' total, since the tap marks *this seat*
  // winning a game rather than either side reaching one.
  const myGames = standing.kind === "rubber" ? standing.rubber.gamesWon[view.me] : 0;
  const gamesSeen = useRef(myGames);
  useEffect(() => {
    // This seat's own games won only ever climbs within one continuous
    // rubber, so a count lower than what was last seen cannot be a game just
    // won — it can only mean a new rubber started, or a mirror moved into its
    // second half, neither of which is itself a game won.
    if (myGames > gamesSeen.current && !matchComplete) {
      hapticGameWon();
    }
    gamesSeen.current = myGames;
  }, [myGames, matchComplete]);

  const drawTurn = useRef(lastDraw?.turn ?? null);
  useEffect(() => {
    const turn = lastDraw?.turn ?? null;
    if (enabled && turn !== null && turn !== drawTurn.current) {
      playDrawResolve();
    }
    drawTurn.current = turn;
  }, [enabled, lastDraw]);

  const callCount = useRef(auction.length);
  useEffect(() => {
    const last = auction[auction.length - 1];
    if (enabled && auction.length > callCount.current && last !== undefined) {
      playCall(last.call);
    }
    callCount.current = auction.length;
  }, [enabled, auction]);

  // Counted rather than read off `currentTrick`, which resets to empty the
  // instant the second card completes a trick — a card play that happens to
  // be the last of a trick would otherwise vanish between one render and the
  // next without ever being seen at length 2.
  const cardsPlayed = view.completedTricks.length * 2 + view.currentTrick.length;
  const playedCount = useRef(cardsPlayed);
  useEffect(() => {
    if (enabled && cardsPlayed > playedCount.current) {
      playCardPlayed();
    }
    playedCount.current = cardsPlayed;
  }, [cardsPlayed, enabled]);

  // How the deal turned out, announced at the moment it is actually decided.
  //
  // A deal is very often over several tricks before its last card — a contract
  // that cannot be made cannot be made, whatever the remaining tricks do — and
  // this used to say nothing until the score appeared, by which time the screen
  // had already stated the result and the sound was announcing old news.
  // `trickOutlook` is what makes the earlier moment nameable.
  //
  // Two sources, in that order. `settled` is the deciding trick, which is the one
  // to prefer. `fromScore` is the fallback for the deals that never have one — a
  // pass-out has no contract at all, and a claim can end a deal with neither
  // target reached — where being scored is the first moment there is any news.
  //
  // A latch rather than a rising edge, because both sources describe the same
  // event: whichever arrives first is the announcement, and the other is then the
  // same verdict a second time. That is the shape of bug this file has now been
  // bitten by three times, so it is a latch on purpose.
  const outlook = outlookFor(view);
  const settled =
    outlook === null || (outlook.state !== "reached" && outlook.state !== "gone")
      ? null
      : outlook.state === "reached";
  const fromScore = score === null ? null : declaringIn(view) === score.detail.made;
  const decided = settled ?? fromScore;

  const announced = useRef(decided !== null);
  useEffect(() => {
    // Every deal opens with the draw, so that is the one place this resets. It
    // has to reset somewhere: the latch outlives a deal otherwise, and the next
    // one would be played out in silence.
    if (view.phase === "draw") {
      announced.current = false;
      return;
    }
    if (decided === null || announced.current) {
      return;
    }
    announced.current = true;
    if (enabled) {
      playDealOutcome(decided);
    }
    // The sound announces either outcome, since a set contract is news too —
    // the haptic ladder is positive-only, so a loss stays silent here the same
    // way it does at the game and match tiers above and below this one.
    if (decided) {
      hapticDealWon();
    }
  }, [decided, enabled, view.phase]);

  // A title unlocked, keyed on the toast having something to show rather than on
  // the deal that earned it: the two are the same instant against the computer
  // and are not over a network, where the server decides and pushes separately.
  // Rising rather than "is non-empty", because the list accumulates — a second
  // unlock arriving while the first is still on screen is not a second fanfare.
  const hadUnlocks = useRef(justUnlocked.length > 0);
  useEffect(() => {
    const has = justUnlocked.length > 0;
    if (enabled && has && !hadUnlocks.current) {
      playAchievement();
    }
    hadUnlocks.current = has;
  }, [enabled, justUnlocked]);

  // Keyed on the screen rather than on the match, so the horn lands with the
  // headline that says who won. `matchComplete` is still what makes it a
  // *match* horn — `showingFinalScore` is only ever true alongside it — but it
  // is no longer what decides the moment.
  //
  // Once per match, not once per rising edge of that screen. The two are not
  // the same: a match's final score can be reached, left and reached again
  // without a second match having been won — the board holds the last trick
  // and only then releases the phase, effects run either side of that, and a
  // remount re-arms anything keyed on a transition. A won match is a single
  // event, so the horn is armed by a match that is *not* finished and spent by
  // the first screen that shows one that is.
  const horned = useRef(false);
  useEffect(() => {
    if (!matchComplete) {
      horned.current = false;
      return;
    }
    if (!showingFinalScore || horned.current) {
      return;
    }
    horned.current = true;
    if (enabled) {
      playRubberWon();
    }
    // The horn sounds either way, since losing a match is still news worth a
    // sound — the haptic stays positive-only, the same as the tiers below it,
    // and a drawn match (`winner === null`) is not a win either.
    if (winner === view.me) {
      hapticMatchWon();
    }
  }, [enabled, matchComplete, showingFinalScore, winner, view.me]);
}
