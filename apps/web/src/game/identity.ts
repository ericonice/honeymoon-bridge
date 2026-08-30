import type { DuplicateSchedule, MatchFormat } from "@hb/engine";
import { DIFFICULTIES } from "../bot/difficulty.js";
import type { Difficulty } from "../bot/difficulty.js";
import { LATEST_RELEASE, releaseFor } from "../bot/release.js";
import type { BotRelease } from "../bot/release.js";
import { readStored, writeStored } from "./storage.js";

const FORMAT_KEY = "hb.format";
const QUEUE_FORMAT_KEY = "hb.queueFormat";
const RUBBER_GAMES_KEY = "hb.rubberGames";
const MIRROR_GAMES_KEY = "hb.mirrorGames";
const SESSION_DEALS_KEY = "hb.sessionDeals";
const SESSION_ORDER_KEY = "hb.sessionOrder";
const OPPONENT_KEY = "hb.opponent";
const DIFFICULTY_KEY = "hb.difficulty";
const DISGUISE_KEY = "hb.disguise";
const BOLDNESS_KEY = "hb.boldness";
const DENSITY_KEY = "hb.density";
const PACE_KEY = "hb.pace";
const PEEK_KEY = "hb.peek";
const SOUND_KEY = "hb.sound";
const TAP_TO_SELECT_KEY = "hb.tapToSelect";
const TRICK_COUNT_KEY = "hb.trickCount";
const NICKNAME_KEY = "hb.nickname";
const TOKEN_KEY = "hb.token";

/**
 * The opaque value that reclaims a seat after a dropped socket.
 *
 * A seat is *held* by this and permitted by an account (§3.7): signing in is
 * what lets somebody sit down opposite a person, and this is what gets them
 * back into the same chair afterwards. Keeping the two apart is what lets a
 * reconnection work when a session has expired underneath a rubber.
 *
 * An account *claims* this token rather than replacing it — see
 * `redeemSignInToken`. The cost that remains is that a rubber in progress is
 * still bound to the device that started it, because nothing yet moves one.
 */
export function playerToken(): string {
  const existing = readStored(TOKEN_KEY);
  if (existing !== null && existing !== "") {
    return existing;
  }
  const token = crypto.randomUUID();
  writeStored(TOKEN_KEY, token);
  return token;
}

/**
 * Forgets this device's token, so the next thing to ask for one gets a new one.
 *
 * Called when signing out. The account that just left has claimed this token,
 * and leaving it in place would hand the next person to sign in on this device
 * the previous one's anonymous history — harmless when an account was optional
 * and sharing a device was unusual, and neither once every game against a
 * person is attributed and the device is the one the family passes around.
 */
export function resetPlayerToken(): void {
  writeStored(TOKEN_KEY, crypto.randomUUID());
}

/**
 * How long this player likes a sitting to be.
 *
 * A preference rather than a decision: at a table with somebody else it is one
 * of two, and the shorter one wins — see `formatFor` on the server. Rubber is
 * the default because it is the game this was built to play.
 *
 * Rubber is the default because it is the game this was built to play, and
 * anything unrecognised reads as a rubber for the same reason — the service
 * worker keeps old builds in circulation, and a stored value from a future one
 * should fall back to the game rather than to nothing.
 */
export function preferredFormat(): MatchFormat {
  const stored = readStored(FORMAT_KEY);
  // **Widen this whenever `MatchFormat` widens.** It is a validating reader, so a
  // format it has not been told about is silently read back as a rubber — which is
  // exactly what happened when Mirror shipped: choosing it stored `"mirror"`, this
  // returned `"rubber"`, and the match played was a rubber that would not end at a
  // hundred below the line because a rubber takes two games. The row said Mirror and
  // the game was not one.
  if (stored === "game" || stored === "duplicate" || stored === "mirror") {
    return stored;
  }
  return "rubber";
}

export function setPreferredFormat(format: MatchFormat): void {
  writeStored(FORMAT_KEY, format);
  // A rubber's length is remembered separately, so choosing Duplicate and coming back
  // does not silently promote a single game to a full rubber — see `rubberGames`.
  if (format === "game" || format === "rubber") {
    writeStored(RUBBER_GAMES_KEY, format === "game" ? "1" : "2");
  }
}

/**
 * What format the queue should look for, or null for anyone — the default, and
 * what asking to be matched always meant before this existed.
 *
 * **Its own preference rather than `preferredFormat`**, because the two answer
 * different questions. `preferredFormat` governs Invite and Play the computer,
 * where a real format is always wanted; a stranger in the queue may genuinely
 * have no preference, and forcing one onto them here would mean two people who
 * would happily have played each other no longer pair, because their unrelated
 * "what I'd play if I had to name something" preferences happened to differ.
 *
 * Anything unrecognised reads as no preference rather than as a guess, the same
 * conservatism `preferredFormat` takes in the other direction — a stored value
 * from a future client naming a format this build does not know is safer read
 * as "anything" than silently narrowed to the wrong thing.
 */
export function queueFormat(): MatchFormat | null {
  const stored = readStored(QUEUE_FORMAT_KEY);
  return stored === "game" || stored === "duplicate" || stored === "mirror" || stored === "rubber"
    ? stored
    : null;
}

export function setQueueFormat(format: MatchFormat | null): void {
  writeStored(QUEUE_FORMAT_KEY, format ?? "");
}

/**
 * How long a rubber was last set to run: one game or two.
 *
 * **A second key, and the reason is a real bug rather than tidiness.** The format
 * itself is stored and perfectly sticky — but it can only hold *one* of `"game"`,
 * `"rubber"` and `"duplicate"`, so choosing Duplicate overwrites which of the two
 * rubber lengths was wanted. Coming back to Rubber then had nothing to go on and
 * defaulted to two, quietly turning somebody's single game into a full rubber.
 *
 * It is deliberately **not** a second answer to "what am I playing" — the format key
 * stays authoritative for that, and this is only read when the Rubber cell is picked,
 * to decide which rubber it means. That is what keeps the two from disagreeing.
 */
export function rubberGames(): 1 | 2 {
  return readStored(RUBBER_GAMES_KEY) === "1" ? 1 : 2;
}

/** The rubber format that length means, which is the only thing the row stores. */
export function rubberFormatFor(games: 1 | 2): MatchFormat {
  return games === 1 ? "game" : "rubber";
}

/**
 * How long each half of a mirror runs: one game, or a rubber.
 *
 * **Its own value rather than sharing the rubber's**, because they are answers to two
 * different questions. A rubber's length is how long you want a rubber; a mirror's is
 * how long you want each side of a comparison to be, and somebody may well want a full
 * rubber of one and a single game of the other. Sharing would make changing either
 * silently change the other, which is the fault `preferredFormat` already had.
 *
 * Defaults to one game, which is what the format is for: the pair is then about six
 * deals and duplicating them cancels most of the shuffle.
 */
export function mirrorGames(): 1 | 2 {
  return readStored(MIRROR_GAMES_KEY) === "2" ? 2 : 1;
}

export function setMirrorGames(games: 1 | 2): void {
  writeStored(MIRROR_GAMES_KEY, String(games));
}

/** What each half of a mirror is, in the narrow vocabulary the rubber machinery keeps. */
export function mirrorHalfFormat(): "game" | "rubber" {
  return mirrorGames() === 1 ? "game" : "rubber";
}

/**
 * How long a duplicate session runs, in deals.
 *
 * **In deals rather than boards**, because that is the question a player answers —
 * how long is this game — and it is how a rubber is experienced too. Boards are the
 * engine's unit, and `boardsForDeals` is the one place the two meet.
 *
 * **A range with a step rather than a list of choices**, which is the third shape
 * this took and the one that holds. A fixed list of five was a row of five tap
 * targets that had to fit a phone, so it could not reach a longer session at all —
 * and the row it lived on appeared and disappeared with the format, shifting the
 * primary button out from under the thumb reaching for it. A stepper is two targets,
 * one line, always the same height, and every length is reachable.
 *
 * Even throughout, and that is a rule rather than a tidy choice: a board is worth
 * the difference between its two runs, so an odd count would leave one board played
 * once — a score with nothing to compare against.
 *
 * Ten is the default because it is the length of a rubber, so everything that
 * assumes a match is about that long still holds, and because five intervening deals
 * is the working guess at how long it takes to forget a board. **That guess is why
 * this is a control at all**: it is the one thing no bench can settle.
 *
 * Two deals is the shortest and it is a real session — one board played twice, the
 * replay immediately after, so recall is complete and the board turns purely on what
 * each side did with the same stock. The clearest demonstration of what the format
 * is, and the least interesting test of memory.
 */
export const MIN_SESSION_DEALS = 2;
export const MAX_SESSION_DEALS = 30;
export const SESSION_DEALS_STEP = 2;
const DEFAULT_SESSION_DEALS = 10;

/** Rounded to an even count inside the range. Anything unreadable reads as the default. */
export function cleanSessionDeals(deals: number): number {
  if (!Number.isFinite(deals)) {
    return DEFAULT_SESSION_DEALS;
  }
  const even = Math.round(deals / SESSION_DEALS_STEP) * SESSION_DEALS_STEP;
  return Math.min(MAX_SESSION_DEALS, Math.max(MIN_SESSION_DEALS, even));
}

export function sessionDeals(): number {
  const stored = readStored(SESSION_DEALS_KEY);
  return stored === null ? DEFAULT_SESSION_DEALS : cleanSessionDeals(Number(stored));
}

export function setSessionDeals(deals: number): void {
  writeStored(SESSION_DEALS_KEY, String(cleanSessionDeals(deals)));
}

/**
 * How a session orders its deals — see `DuplicateSchedule` for what each one is.
 *
 * A real setting rather than a constant because the three are different *games*
 * rather than three arrangements of one, and which is the better game is not
 * something a bench has an opinion about. Playing a board's two halves back to back
 * makes the comparison immediate and the strategy about beating a line you have just
 * seen; shuffling makes recognising the board part of it. Both are wanted.
 *
 * `halves` is the default because it is what a duplicate evening is: everybody plays
 * every board once, then they come round again.
 */
export const SESSION_ORDERS: readonly DuplicateSchedule[] = ["adjacent", "halves", "random"];

/** What each order is called wherever one is offered. */
export const ORDER_LABEL: Record<DuplicateSchedule, string> = {
  adjacent: "Back to back",
  halves: "Halves",
  random: "Shuffled",
};

export function sessionOrder(): DuplicateSchedule {
  const stored = readStored(SESSION_ORDER_KEY);
  return SESSION_ORDERS.find((one) => one === stored) ?? "halves";
}

export function setSessionOrder(order: DuplicateSchedule): void {
  writeStored(SESSION_ORDER_KEY, order);
}

/**
 * Which computer opponent to play, by version.
 *
 * The newest unless something older is stored, and unrecognised storage means the
 * newest too — a version this build has never heard of is what a service worker
 * serving an older bundle looks like, and the right answer there is the best
 * opponent this build actually has rather than nothing.
 *
 * A superseded release is the best difficulty lever in here, which is why this is
 * an ordinary setting and not a testing dial. Turning the sampler down makes an
 * opponent that is *unsure*; an older release is one that was once the best there
 * was, which is a coherent weaker opponent rather than a crippled one.
 */
export function preferredRelease(): BotRelease {
  const stored = Number(readStored(OPPONENT_KEY));
  return (Number.isFinite(stored) ? releaseFor(stored) : null) ?? LATEST_RELEASE;
}

export function setPreferredRelease(version: number): void {
  writeStored(OPPONENT_KEY, String(version));
}

/**
 * How hard the computer plays — the one setting that replaces four.
 *
 * `strength`, `boldness`, the disguise and the opponent picker all changed how
 * hard the game was, none of them said so, and using them meant knowing what a
 * sample count is. This says it, and the rungs below it are measured rather than
 * asserted — see `bot/difficulty.ts`.
 *
 * **Hardest by default.** The alternative is a first game against a deliberately
 * weakened opponent, which is a poor introduction to a game whose whole appeal is
 * that the computer is worth playing; anyone who wants it gentler can say so, and
 * the row explains what each rung means.
 */
export function difficulty(): Difficulty {
  const stored = readStored(DIFFICULTY_KEY);
  return DIFFICULTIES.find((one) => one === stored) ?? "championship";
}

export function setDifficulty(next: Difficulty): void {
  writeStored(DIFFICULTY_KEY, next);
}

/**
 * Whether the computer is allowed to name a suit that isn't necessarily its
 * best one, to avoid always giving its shape away.
 *
 * **On by default: the computer should be allowed to bid unpredictably.**
 * This used to let the bot claim a suit it did not hold at all — measured
 * against itself, that lie cost about ten times what it earned. It is now
 * floored at three cards, so it can no longer manufacture a suit from
 * nothing, and gated in `heuristicBot.ts` so the credit only ever applies to
 * a hand that was bidding minimally anyway — found on a hand where the
 * un-gated version was talking a 19-count with a six-card suit down to a
 * one-level opening, which is the failure a flat, unconditional credit
 * cannot tell apart from the ordinary case it is meant for.
 *
 * The older question is still open underneath it: none of this settles
 * whether the ambiguity works on a *person*, who forms a far stronger belief
 * from an auction than a weighted sampler does and holds it much longer. That
 * is not measurable from here, so it stays a switch — off is still there for
 * anyone who would rather play a bot that bids exactly what it holds.
 */
export function disguiseEnabled(): boolean {
  return readStored(DISGUISE_KEY) !== "off";
}

export function setDisguiseEnabled(enabled: boolean): void {
  writeStored(DISGUISE_KEY, enabled ? "on" : "off");
}

/**
 * The one setting left that exists to answer a question rather than to be preferred.
 *
 * It is a number the benches cannot choose. What a game in hand is worth was
 * fitted against a reference bidder that barely doubles, so its measured optimum
 * flatters overbidding in a way that will not transfer to a person. Temporary:
 * when it has an answer it belongs in the code as a constant, and the row goes.
 *
 * There were three. The pace of the game got its answer — see `Pace` below — and
 * how strong the computer is got a better one than a row could give: it is a rung
 * on the difficulty ladder now, chosen by whoever is playing rather than settled
 * once for everybody. `difficulty.ts` owns the sample count, so a separate
 * strength control would have been a second lever on the same number, and the
 * question it was asking ("is more sampling worth sitting down to") turned out to
 * be the player's to answer rather than a constant to find.
 */
export type Boldness = "bold" | "cautious" | "normal";

/**
 * How fast the game runs, and the one of those three questions that is settled.
 *
 * It was in the testing panel because whether twenty-six turns of the same
 * decision read as deliberate or as waiting is not something a bench has an
 * opinion about — only playing it could say. Playing it said **fast**, which is
 * what it already defaulted to, so there is nothing left to decide.
 *
 * The row stays and moves into the ordinary settings, which is not a
 * contradiction: the *question* is answered, and what remains is an ordinary
 * preference. It matters more now than it did, because the game is being shared
 * outside the family and the fastest pace is not the right one for somebody
 * meeting the draw phase for the first time — the walkthrough now runs against
 * exactly that person, and they should be able to slow the board down while they
 * read it. Behind the playtester flag they could not.
 */
export type Density = "compact" | "normal";

/**
 * How much room the chrome around the board is allowed.
 *
 * The app is a fixed frame with no scrolling anywhere (§1.5), so a screen that
 * does not fit is simply cut off and there is nothing to scroll to reach it. On a
 * 667px phone — an iPhone SE or 8, and smaller Androids — it does not fit. The
 * standing in the contract bar is five stacked rows costing about 82px of that,
 * on every screen, for the whole game.
 *
 * **The default is the viewport rather than a stored value**, which is the whole
 * point: somebody whose phone cannot afford the room should not have to know a
 * setting exists, and somebody whose phone can should not have their layout
 * traded away for a phone they do not own. Only an explicit choice is stored, so
 * an untouched install re-decides on every launch and follows the device it is
 * actually running on.
 *
 * 700 rather than 667: the frame is `dvh`, so a phone whose browser toolbars are
 * showing has less than its nominal height, and the boundary wants to sit above
 * the size it is protecting rather than exactly on it.
 */
const COMPACT_BELOW = 700;

/** What the device asks for, before any choice of the player's. */
function densityForViewport(): Density {
  if (typeof window === "undefined") {
    return "normal";
  }
  return window.innerHeight < COMPACT_BELOW ? "compact" : "normal";
}

export function density(): Density {
  const stored = readStored(DENSITY_KEY);
  if (stored === "compact" || stored === "normal") {
    return stored;
  }
  return densityForViewport();
}

export function setDensity(next: Density): void {
  writeStored(DENSITY_KEY, next);
}

export type Pace = "fast" | "normal" | "slow";

/**
 * Normal by default, where this used to be bold.
 *
 * Bold exists because a reference bidder that barely doubles rewards
 * overbidding, so the bench's measured optimum sat above what would survive a
 * person. The reference doubles off the solver now, and against it bold is worth
 * nothing in points (+612 a rubber against +635) while walking into 45% more of
 * the doubled disasters that recorded play showed were the whole of the deficit.
 * The setting stays — somebody may want a bolder opponent — but it is no longer
 * what a fresh install gets.
 */
export function boldness(): Boldness {
  const stored = readStored(BOLDNESS_KEY);
  return stored === "cautious" || stored === "bold" ? stored : "normal";
}

export function setBoldness(next: Boldness): void {
  writeStored(BOLDNESS_KEY, next);
}

/**
 * Whether to show the computer's cards.
 *
 * Stored, like every other row in Settings. It was component state while it was
 * a development affordance — nothing that vanished on reload, because a reload
 * meant a rebuild anyway. As a setting somebody can actually turn on that made
 * it the one row that forgot itself, which reads exactly like a control that
 * does not work.
 *
 * **On by default on the dev server, off by default anywhere else.** It shows
 * what the computer is up to and changes nothing about what it does, so locally
 * it is wanted on nearly every run — and a stored choice still wins, which is
 * what leaves the shipped experience reachable by turning it off rather than by
 * building without it.
 */
export function peeking(): boolean {
  const stored = readStored(PEEK_KEY);
  return stored === null ? import.meta.env.DEV : stored === "on";
}

export function setPeeking(enabled: boolean): void {
  writeStored(PEEK_KEY, enabled ? "on" : "off");
}

/**
 * Whether the game plays sound effects.
 *
 * On by default: unlike the testing settings above, this is an ordinary
 * preference rather than an answer still being worked out, so it defaults to
 * the experience most people would want rather than to off.
 */
export function soundEnabled(): boolean {
  return readStored(SOUND_KEY) !== "off";
}

export function setSoundEnabled(enabled: boolean): void {
  writeStored(SOUND_KEY, enabled ? "on" : "off");
}

/**
 * Whether playing a card takes two taps (raise, then play) instead of one.
 *
 * Off by default: the one-tap gesture — press, aim, release — is the original
 * behavior and stays it unless somebody asks for the other one. On, a tap
 * raises a card instead of playing it; tapping the same, already-raised card
 * plays it, and tapping a different card just moves the raise there.
 */
export function tapToSelectEnabled(): boolean {
  return readStored(TAP_TO_SELECT_KEY) === "on";
}

export function setTapToSelectEnabled(enabled: boolean): void {
  writeStored(TAP_TO_SELECT_KEY, enabled ? "on" : "off");
}

/**
 * Whether the play screen shows each side's trick countdown — see `TrickRing`.
 *
 * On by default, because the question it answers ("how many tricks do I need?")
 * is asked out loud at the table every deal and nothing else on the screen
 * answers it. Off is here because it is a genuine matter of taste rather than an
 * open question: somebody who keeps the count in their head does not want it kept
 * for them, and part of this game is what you can hold.
 */
export function trickCountEnabled(): boolean {
  return readStored(TRICK_COUNT_KEY) !== "off";
}

export function setTrickCountEnabled(enabled: boolean): void {
  writeStored(TRICK_COUNT_KEY, enabled ? "on" : "off");
}

export function pace(): Pace {
  const stored = readStored(PACE_KEY);
  // Anything unrecognized is fast, which also carries the old "brisk" spelling of
  // this same setting across without a migration: it named the same speed.
  return stored === "normal" || stored === "slow" ? stored : "fast";
}

export function setPace(next: Pace): void {
  writeStored(PACE_KEY, next);
}

/**
 * What this device calls the player when there is no account to ask.
 *
 * Since §3.7 that is only the game against the computer, which needs no server
 * and so has nothing to look a name up in. At a table the name comes from the
 * account, and the server reads it there rather than believing this. It is also
 * what the name prompt starts from, so somebody who has been playing the
 * computer as "Eric" is not asked the question from scratch.
 */
export function nickname(): string {
  return readStored(NICKNAME_KEY) ?? "";
}

export function setNickname(value: string): void {
  writeStored(NICKNAME_KEY, value.trim().slice(0, 20));
}
