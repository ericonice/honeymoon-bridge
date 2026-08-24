import type { DealRules, MatchFormat } from "@hb/engine";
import { DIFFICULTIES } from "../bot/difficulty.js";
import type { Difficulty } from "../bot/difficulty.js";
import { LATEST_RELEASE, releaseFor } from "../bot/release.js";
import type { BotRelease } from "../bot/release.js";
import { readStored, writeStored } from "./storage.js";

const FORMAT_KEY = "hb.format";
const OPPONENT_KEY = "hb.opponent";
const DIFFICULTY_KEY = "hb.difficulty";
const DRAW_STYLE_KEY = "hb.drawStyle";
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
 */
export function preferredFormat(): MatchFormat {
  return readStored(FORMAT_KEY) === "game" ? "game" : "rubber";
}

export function setPreferredFormat(format: MatchFormat): void {
  writeStored(FORMAT_KEY, format);
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
 * How many cards a draw turn offers, which is the house variant in §3.6b.
 *
 * Named for what the player sees rather than for the rule underneath it. The
 * engine's flag is `openDiscard` — the top of the discard pile lies face up and
 * may be taken — and that is the precise statement of the rule; "three cards" is
 * the precise statement of the *choice*, which is what a settings row is for. The
 * same split the match format already uses, where `MatchFormat` is "rubber" and
 * the row says "Match length".
 *
 * **Two cards by default: three is a house variant, not the game.** §1 is the
 * game, and a setting that quietly changed it for everyone would make every number
 * ever measured against the base rules describe something else.
 *
 * It exists because the draw phase has no interaction in it. A turn spends two
 * stock cards whichever card is taken, so nothing either player does changes what
 * the other is offered — 26 of a deal's 52 decisions are two games of solitaire
 * side by side, and the only lever is a keep-or-reject against a pool of 26 cards
 * nobody has seen. On three cards, the card you throw away is a card they may pick
 * up, and rejecting a good card stops being free.
 *
 * What it costs, which is not yet settled: you now see the opponent's discards as
 * they cross the top of the pile, so a player who remembers all thirteen ends the
 * deal knowing their hand. That is a memory the game already wanted to reward and
 * a human will not manage it — the bot would, trivially, which is what finally
 * makes the forgetting lever in §2.1 something that has to be built rather than
 * merely left available. It is handed no more recall than before for now.
 */
export type DrawStyle = "three-card" | "two-card";

export function drawStyle(): DrawStyle {
  return readStored(DRAW_STYLE_KEY) === "three-card" ? "three-card" : "two-card";
}

export function setDrawStyle(next: DrawStyle): void {
  writeStored(DRAW_STYLE_KEY, next);
}

/** The engine's own statement of the same choice. */
export function rulesFor(style: DrawStyle): DealRules {
  return { openDiscard: style === "three-card" };
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
