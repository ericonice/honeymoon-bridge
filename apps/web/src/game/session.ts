import type {
  Card,
  CompletedTrick,
  DealAction,
  DealScore,
  Pair,
  PlayerView,
  RubberState,
  Unlock,
} from "@hb/engine";

// These describe what one seat is entitled to see and how a rubber is recorded,
// so they belong with the rules rather than with the screens that show them —
// the server has to produce exactly these shapes too.
export type { DealRecord, DrawPair, DrawReveal } from "@hb/engine";

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
import type { DealRecord, DrawPair, DrawReveal } from "@hb/engine";

export interface GameSession {
  /**
   * Every deal of the current rubber, oldest first, including the one just
   * finished. Cleared when a new rubber starts.
   */
  readonly history: readonly DealRecord[];
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
  readonly opponentLastDraw: DrawPair | null;
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
  /** The rubber including the deal just finished. */
  readonly rubber: RubberState;
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
  /** Deals again, starting a fresh rubber if the last one has been won. */
  nextDeal(): void;
  /**
   * Plays whatever phase is in progress out at once. Null when it is not on
   * offer — which is always, over a network, where the server decides what a
   * seat may do and would simply refuse it.
   */
  readonly skipPhase: (() => void) | null;
}
