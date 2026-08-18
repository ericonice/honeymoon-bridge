import { useEffect, useRef } from "react";
import type { GameSession } from "./session.js";
import {
  playCall,
  playCardPlayed,
  playContractResult,
  playDrawResolve,
  playRubberWon,
} from "./soundEffects.js";

/**
 * Sound effects for the events a deal produces, wired once here so the game
 * against the computer and a table over the network get the same cues —
 * `GameBoard` is the one component both sessions render through.
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
   * The two look like the same moment and are not. `rubber.complete` flips the
   * instant the last deal is scored, while the board is still holding the last
   * trick and revealing both hands — so the horn used to sound over the end of
   * the play rather than over the result, several seconds before anything said
   * who had won. The board decides when that screen appears (`useShownPhase`
   * holds the phase open for a beat, or until a tap), so it has to be the board
   * that says when, rather than this hook guessing at the same delay.
   */
  readonly showingFinalScore: boolean;
}

export function useGameSounds({ enabled, session, showingFinalScore }: GameSounds): void {
  const { lastDraw, rubber, score, view } = session;
  const auction = view.auction;

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

  const hadScore = useRef(score !== null);
  useEffect(() => {
    if (enabled && score !== null && !hadScore.current) {
      playContractResult(score.detail.made);
    }
    hadScore.current = score !== null;
  }, [enabled, score]);

  // Keyed on the screen rather than on the rubber, so the horn lands with the
  // headline that says who won. `rubber.complete` is still what makes it a
  // *rubber* horn — `showingFinalScore` is only ever true alongside it — but it
  // is no longer what decides the moment.
  const hadFinalScore = useRef(showingFinalScore);
  useEffect(() => {
    if (enabled && showingFinalScore && !hadFinalScore.current) {
      playRubberWon();
    }
    hadFinalScore.current = showingFinalScore;
  }, [enabled, showingFinalScore]);
}
