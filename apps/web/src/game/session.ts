import type {
  Card,
  CompletedTrick,
  DealAction,
  DealScore,
  MatchFormat,
  Pair,
  PlayerView,
  Unlock,
} from "@hb/engine";

// These describe what one seat is entitled to see and how a rubber is recorded,
// so they belong with the rules rather than with the screens that show them —
// the server has to produce exactly these shapes too.
export type { DealRecord, DrawReveal, DrawSpend } from "@hb/engine";
import type { DealRecord, DrawReveal, DrawSpend, MatchStanding, PlayerId } from "@hb/engine";

/**
 * Everything the game screens need, and the only thing they are given.
 *
 * Deliberately independent of where the game is actually running. Against the
 * computer a hook holds the whole `DealState` locally; over a network the same
 * shape arrives from a Durable Object that holds it instead, and the screens
 * cannot tell the difference because none of them ever sees more than this.
 *
 * That is what makes the server's authority checkable rather than hoped for:
 * strip the three methods and what remains is exactly the snapshot the server
 * sends, so there is one shape to test for leaks instead of a whole UI to audit.
 */

export interface GameSession {
  /** Deals finished in this match, the one just completed included. */
  readonly dealsPlayed: number;
  readonly format: MatchFormat;
  /**
   * The card most recently added to your hand, while the draw is running.
   *
   * Your hand is shown sorted, so a card taken sight-unseen lands in the middle
   * of twelve others and is genuinely hard to pick out. Marking it answers
   * "what did I just gain?" and shows nothing that is not already on screen.
   */
  readonly justTaken: Card | null;
  /**
   * Achievements unlocked since the last `clearUnlocks`, oldest first.
   *
   * Not part of what the server calls a snapshot — a reconnect resending the
   * same state must not replay an old unlock as a new one — so this is kept
   * beside the session rather than inside it: computed live, deal by deal, in
   * the robot game, and accumulated from the server's own pushes over a
   * network, where it is already decided.
   */
  readonly justUnlocked: readonly Unlock[];
  /** The draw turn that just resolved, or null before the first one. */
  readonly lastDraw: DrawReveal | null;
  /** The resolved trick still lying on the table, until the next card is played. */
  readonly lastTrick: CompletedTrick | null;
  /** What to call the other player. */
  readonly opponentName: string;
  /**
   * The opponent's actual cards. Null in any build that ships, and null over a
   * network in every build, because the server never sends them.
   *
   * This is the one thing the rest of the app is built to make impossible, so
   * it is deliberately *not* part of `PlayerView` — that shape is what crosses
   * the wire and what a bot is given, and there are tests asserting this is
   * absent from it.
   */
  readonly opponentHand: readonly Card[] | null;
  /** The two cards of the opponent's last draw turn. Null in anything that ships. */
  readonly opponentLastDraw: DrawSpend | null;
  /** Card 1 of the opponent's draw turn. Null in anything that ships. */
  readonly opponentPending: Card | null;
  /**
   * True once the other player has asked to move on and you have not.
   *
   * The mirror of `waitingToContinue`, and the half that was missing: without
   * it a finished deal looks the same whether or not somebody is sitting there
   * waiting on you. Always false against the computer, which never asks.
   */
  readonly opponentWaitingToContinue: boolean;
  /**
   * The standing, in whichever shape the format keeps it.
   *
   * A tagged union rather than a rubber with duplicate bolted on, because the two
   * are different machines: a rubber accumulates toward games and a session is a
   * list of boards each settled where it was played. Every question that is the
   * same in both formats — is it over, how many deals, who is vulnerable — is a
   * field of its own above, so this is read only by the two displays that
   * genuinely differ.
   */
  readonly standing: MatchStanding;
  /** True once the match is decided, whatever deciding it means in this format. */
  readonly matchComplete: boolean;
  /**
   * The first game of a two-game match is over and the match is not. False everywhere
   * else.
   *
   * Read by the hands reveal, which must stop offering a tap straight into the next
   * deal, and by `DealComplete`, which shows the half-time screen instead. Both from
   * this one value: computed separately they drift, and the failure is a screen nobody
   * can reach.
   */
  readonly halfComplete: boolean;
  /**
   * The opponent is working out its move right now.
   *
   * Distinct from "it is their turn", which already has an indicator and which covers
   * the deliberate pause before they move as well as the thinking. This is only the
   * stretch where the app is unresponsive — the solver runs on the main thread — and
   * that is the part a player needs told, because it is the part that looks broken.
   *
   * Always false over a network, where the other seat's thinking is somebody else's
   * device and this one stays responsive throughout.
   */
  readonly thinking: boolean;
  /**
   * Who won the match, once it is over. Null while it runs, and null for a draw.
   *
   * **Never derive this from the standing.** For a two-game match the standing is the
   * *current game's*, so its winner is whoever won that game — which is not the result,
   * and saying so to somebody who won on the total is how this was reported.
   */
  readonly winner: PlayerId | null;
  /**
   * The bonus the finished deal earned beyond its trick score, in a format that
   * pays one per deal. Always zero in a rubber, where a game is banked instead.
   */
  readonly dealBonus: number;
  /** Present once the deal is complete and was not passed out. */
  readonly score: DealScore | null;
  /**
   * A trick has resolved and is waiting on `dismissTrick` before either side
   * may lead the next one.
   *
   * The engine hands the winner `toAct` the instant a trick resolves, with no
   * regard for whether either seat has actually seen it yet — without this, a
   * fast tap (yours, or the computer's own next lead) could start a new trick
   * before the last one had finished arriving on screen, and there is nothing
   * left to show the old one *as* once that happens. Always false over a
   * network: nothing there paces a real opponent's move on your behalf, so
   * holding your own side of it would only ever be a screen with no effect on
   * the game underneath.
   */
  readonly trickAwaitingDismissal: boolean;
  readonly view: PlayerView;
  /** Vulnerability as it stood for the deal in progress or just finished. */
  readonly vulnerable: Pair<boolean>;
  /** True whenever the deal is waiting on the other player rather than on you. */
  readonly waitingOnOpponent: boolean;
  act(action: DealAction): void;
  /** Dismisses whatever is in `justUnlocked`, once it has been shown. */
  clearUnlocks(): void;
  /** Clears `trickAwaitingDismissal`, once the resolved trick has been seen. */
  dismissTrick(): void;
  /**
   * True once you have asked to move on and the other player has not.
   *
   * Always false against the computer, which has nothing to read and nobody to
   * keep waiting.
   */
  readonly waitingToContinue: boolean;
  /** Deals again — a fresh rubber if the last was won, or the next board of a session. */
  nextDeal(): void;
  /**
   * Plays the finished match's boards back, with the right to draw first swapped.
   *
   * Null when there is nothing to return — a match still in progress, a session,
   * which already plays every board twice, or a return match, since a third run of
   * the same cards is not a game. Null rather than a no-op so the screen has one
   * thing to test rather than a boolean beside a method that might do nothing.
   *
   * Null over a network for now as well. Nothing about the mechanic needs one
   * device; it is the same argument duplicate shipped under — a format lands
   * against the computer first, where there is nobody to agree with.
   */
  readonly playSameBoards: (() => void) | null;
  /**
   * This match is being played on an earlier match's boards.
   *
   * Read where a result is recorded rather than where it is drawn: a match on
   * repeated boards stays out of the rating walk, for the reason a session does.
   */
  readonly repeated: boolean;
  /**
   * Plays whatever phase is in progress out at once. Null when it is not on
   * offer — which is always, over a network, where the server decides what a
   * seat may do and would simply refuse it.
   */
  readonly skipPhase: (() => void) | null;
}
