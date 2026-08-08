# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

Honeymoon Bridge — a two-player contract bridge variant, played in a phone browser.
Personal project, built to play with family. Two versions: a single-player game against a
computer opponent, and a live two-device game over a network.

**`REQUIREMENTS.md` is the source of truth for the rules and the product decisions.** Read it
before changing engine behavior. It records not just what was decided but why, and several
decisions are deliberate and counter-intuitive (see "Rules that surprise people" below). If a
change contradicts it, either the change is wrong or the document needs updating first — do not
let the code and the document drift.

## Commands

```bash
npm install              # workspace install from the repo root

npm test                 # all workspaces
npm run typecheck        # tsc --noEmit, all workspaces
npm run build            # all workspaces (nothing to build yet)

# Engine only
npm test    --workspace @hb/engine
npm run test:watch --workspace @hb/engine

# Web app
npm run dev     --workspace @hb/web   # localhost only
npm run dev:lan --workspace @hb/web   # also on the LAN, for testing on the phone
npm run build   --workspace @hb/web

# A single test file or test
npx vitest run test/scoring.test.ts --workspace @hb/engine
npx vitest run -t "pays 700 for a rubber won two games to none"
```

npm workspaces, not pnpm — pnpm is not installed on this machine. Node 24, npm 11.

## Layout

```
packages/engine/     @hb/engine — headless rules engine. No UI, no I/O, no network.
packages/protocol/   @hb/protocol — what crosses the wire, and the tests that it is only that.
apps/web/            @hb/web — Vite + React PWA.
apps/server/         @hb/server — Cloudflare Worker + one Durable Object per table.
```

The engine is consumed as TypeScript source (`main` points at `src/index.ts`), not as a build
artifact. Vite and Wrangler both bundle it directly, so there is no build step to keep in sync.

## Architecture

**One engine, two hosts.** The rules exist exactly once and run in two places: in the browser for
the robot game, and on the server as the authority for network play. This is the reason the stack
is TypeScript end to end. Never reimplement a rule in the UI or in the server — if the UI needs to
know something about legality, the engine should expose it.

**The engine is a pure reducer.** `startDeal` → `applyAction(state, player, action)` → new state.
No mutation, no clocks, no randomness outside a seeded `Rng`. This is what makes the server able
to reconstruct a table after a restart and makes every rule testable headlessly.

**A deal is not the whole game — `table.ts` covers the sitting.** `TableState` holds the deal on
the table, the rubber behind it and the deals already scored into it; `summarise` derives the
standing, the scorepad and vulnerability. It lives in the engine because *two* hosts need it: the
browser runs it for the game against the computer and the server runs it for a game between two
people. A rubber that advanced differently in the two would be the same class of bug as a rule
that did. Note `rubberBefore` — the rubber as it stood when the current deal *began*, since
vulnerability is fixed for a deal and deriving the current score means it cannot be applied twice.

**Randomness is always seeded.** The engine never calls `Math.random` — `createRng(seed)` is the
only source. `randomSeed()` exists for callers to own that boundary. Once networking lands, deal
seeds must be generated server-side and never sent to a client: a leaked seed reconstructs the
entire stock order.

### Hidden information — the part most likely to be broken by accident

`DealState` is the *privileged* view. It contains both hands, the undrawn stock and every discard.
**It must never be serialized to a client.** `viewFor(state, player)` in `view.ts` produces the
only shape allowed to cross the wire, and the only shape a bot may be given.

`PlayerView` deliberately omits three things:

1. The opponent's hand and the undrawn stock — otherwise the game is cheatable from devtools.
2. The opponent's discards — face down and permanently gone.
3. **The player's own discards** — because the app does not show them back. A player has seen 13
   cards they threw away, and remembering them is intentionally part of the game. This is enforced
   by the data that crosses the wire, not by the UI declining to render something it was sent.

When adding a field to `PlayerView`, ask what it leaks. There are tests asserting these omissions;
if one starts failing, the fix is almost certainly the code, not the test.

In the web app, `useLocalSession` is the only thing that holds a `TableState`. Every component
takes a `GameSession`, and every bot a `PlayerView`, so the UI is already written against the shape
the server will send. Keep it that way — a component reaching for `DealState` would work fine in
the robot game and be a hole in the networked one.

`GameSession` (`game/session.ts`) is deliberately silent about *where* the game runs, so the
networked mode is a second implementation rather than a second UI. Strip its three methods and
what remains is exactly `SessionSnapshot` — which is what makes §2.2's "explicit, tested boundary"
one shape to test rather than a whole UI to audit.

**`snapshotFor` is that boundary, and `packages/protocol/test/snapshot.test.ts` is what enforces
it.** The test walks the serialised snapshot for anything card-shaped and checks it against what
the seat may not see: the opponent's hand, the undrawn stock, their card 1, their discards, and
all of this seat's own discards bar the most recent. It is deliberately blind to the snapshot's
shape, so a field added later is walked without anyone remembering to update it. There is also an
anti-vacuity test asserting the seat *does* get its own hand — a leak test that passes by sending
nothing is worse than none.

Per-seat derivations live beside `viewFor` in `view.ts` — `drawRevealFor`, `ownDrawPairFor` — for
the same reason: they answer "what may this seat be told", and the server has to get them right
per seat or it hands over a card nobody should see.

`legalActions(state, player)` needs the privileged state; `legalActionsForView(view)` answers the
same question for anyone who only has a view. Both call the same rules. Use the second in the UI
and in bots.

## Rules that surprise people

Read `REQUIREMENTS.md` §1 for the full statement. The ones that trip up an assumption borrowed
from ordinary bridge:

- **The draw phase is two-step by design.** `DealState.pending` holds card 1, visible only to the
  player on turn; their decision then consumes card 2. Rejecting card 1 takes card 2 *sight-unseen*.
  The engine structurally cannot reveal card 2 before the decision — do not "simplify" this into a
  single draw-two-pick-one action, which is a different and lesser game.
- **Sight-unseen means before the decision, not ever.** A player looks at *both* cards on every
  turn, so on a keep they must be shown card 2 as it is thrown away — see `REQUIREMENTS.md` §1.3.
  Each player has therefore seen 26 cards by the end of the phase, and those 13 discards are half
  of what makes recall a skill. A UI that quietly skips card 2 deletes that half; this was wrong
  in the first build of the draw screen, so check it if you touch the animation.
- **A turn always spends two cards and yields one.** 26 turns, 13 cards each, deck exactly
  exhausted, 26 cards never in play. Invariant tests cover this; treat them as load-bearing.
- **One pass closes the auction.** The three-pass rule is a four-player artifact. Two opening
  passes pass the deal out. Declarer is simply whoever made the final bid.
- **No dummy, no partner.** Both hands stay concealed. There are therefore no bidding conventions
  and no carding signals — the auction is pure competitive negotiation. Do not add Stayman.
- **Every deal is played to all 13 tricks.** No claim, no concede, no undo.
- **Honors are in**, awarded automatically to whichever player holds them, defender included.
- Rubber scoring, not Chicago or duplicate. Vulnerability comes from having won a game.

## Conventions

### TypeScript

- `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Indexing an array
  yields `T | undefined` — handle it or use `!` where an invariant genuinely guarantees presence.
- `verbatimModuleSyntax` is on: use `import type` for type-only imports.
- ESM with explicit `.js` extensions on relative imports, even from `.ts` files.
- Prefer `readonly` on interface members and `readonly T[]` for collections that are not mutated.
- Per-player data is a fixed two-element tuple `Pair<T>`, indexed by `PlayerId` (`0 | 1`).

### Style

- Always use braces, even for single-line bodies.
- Alphabetical members on interfaces, type literals and object literals. Renaming a property may
  require moving it.
- Avoid an `Is` prefix on booleans — `made`, not `isMade`.
- Numeric suffixes over letter suffixes — `client1`/`client2`, never `clientA`/`clientB`.
- Prefer an options object over three or more positional parameters.
- Extract logic into named functions; a top-level function should orchestrate, not mix branching,
  data building and execution.
- Comments explain *why*, in plain language. No ticket references or "Decision 3"-style pointers.

### Tests

- Vitest, in `test/`, named `*.test.ts`.
- Test names read as sentences describing behavior: `"rejecting card 1 takes card 2 sight-unseen"`.
- No section-header banner comments. `describe` blocks are the structure.
- Prefer seeded deals and deterministic assertions over anything probabilistic. When a test needs a
  specific hand, construct it directly rather than searching seeds for one.

## Working agreements

- **Do not stage or commit.** The user handles all git operations. Do not run `git stash`, `git
  reset`, or `git checkout` against uncommitted work.
- Discuss design decisions conversationally, one at a time, in prose — not as multiple-choice.

## Status

**Done.** The rules engine: draw phase, auction, trick play, deal and rubber scoring, and the
player-view projection. Fully playable headlessly.

**Done, deliberately rough.** `apps/web` plays a full rubber against a bot that picks uniformly at
random from the legal actions — draw phase, auction, 13 tricks, deal scoring, part-scores and
vulnerability carried deal to deal, rubber bonus, new rubber, and a scorepad showing every deal of
the rubber. The play screen is plain on purpose. 161 tests across the four workspaces, typecheck
clean.

The rubber is *derived*, not accumulated: `useGameSession` holds the rubber as it stood before the
current deal and computes the standing including it, so re-rendering cannot score a deal twice.
`nextDeal` is what commits it.

The whole app is capped at a phone's width and centred, since every screen is laid out for a hand
holding a phone — on a desktop monitor a full-bleed layout makes rows of buttons absurdly wide
rather than usefully bigger.

**Done, and the part that got real attention.** The draw screen, specified in `REQUIREMENTS.md`
§1.3 and animated with Framer Motion. Each turn plays out as two cards leaving the stock, one
landing in a hand and one in the discard. This is not decoration: the destinations *are* the
keep-or-reject choice, and the animation is what shows you your own card 2, which the rules
require and the first build silently omitted. All draw-phase pacing lives in `game/timing.ts` —
tune there first if the 26 turns drag.

**Done, unwired.** `packages/protocol` and `apps/server`. A Worker mints invite codes and routes
a socket to one Durable Object per table; the object owns the `TableState`, deals the seeds,
validates every action through the engine and sends each seat a `snapshotFor` projection. Sockets
go through the Hibernation API, state is persisted so a rubber survives a deploy, and a token
reclaims a seat after a drop.

Verified against a real `wrangler dev` — two seats, 26 draw turns, an out-of-turn action refused
by the server, and a reconnect resuming mid-auction with the hand intact. `npm run dev --workspace
@hb/server`, then drive it over a WebSocket.

**Done.** `useNetworkSession` — the second implementation of `GameSession`, so the same `GameBoard`
serves a reducer in the tab and a Durable Object on Cloudflare. Invite links, a matchmaking queue
(one Durable Object holding no state; the socket *is* the place in the queue), the "waiting for X"
countdown, and reconnection on backoff, on `online`, and on the tab becoming visible.

**Done, and it reversed a rule.** Playing a person requires an account (§3.7). The gate is on
*sitting down*, not on staying seated: a reconnect whose device token matches a seat resumes it
whatever the session says, so a rotated secret or a deploy cannot take a rubber off somebody
mid-game. The seat's name comes from the account and no longer travels in `join` at all — the
server reads it off the session it just verified, which deleted the several scattered decisions
about what to call a nameless player. Where somebody was going survives the sign-in round trip in
two places at once, stashed locally *and* encoded in the mailed link, because the browser that
opens the mail is often not the one that asked.

Two things this made load-bearing that were not before. Mail is now on the critical path, so a
per-IP limit guards the send quota and the per-address limit is loose enough to absorb an impatient
person. And two-player testing would otherwise cost an email per window per run, so `npm run dev
--workspace @hb/server` passes `DEV_SIGNIN`, which is the one dev control that is compiled out of
the client *and* refused by any server the dev script did not start — §3.6 explains why this one
cannot ship when the others can.

**Not started.** The dev control that force-drops the socket, which §3.6 calls the only way to
exercise reconnection deliberately rather than hoping. Nothing persists a rubber across a refresh
in the robot game. And the play screen still has none of the polish the draw screen got.

**Found on a real device, and fixed.** A sign-in link cannot reach an installed PWA on iOS. The
home-screen app has its own storage, Mail opens links in Safari, and a link works once — so tapping
it signs Safari in, leaves the app untouched, and burns the credential. Sign-in is therefore a
**typed code** now, with the link demoted to a convenience and omitted entirely when the request
comes from a standalone app. The code is six characters of the invite alphabet, looked up by
address *and* code, with five attempts before the outstanding codes for that address are burned.

The general lesson is worth more than the bug: anything that leaves the app and comes back cannot
be assumed to come back to the same app, and desktop Chrome will insist that it does.

**The bot bids, draws and plays.** What each part does is written up in `REQUIREMENTS.md` §2.1.
Measured over 1000+ bot-vs-bot deals at each stage:

| | random | + bidding | + drawing | + card play |
|---|---|---|---|---|
| contracts made | 1.1% | 71% | 68% | **67%** |
| average level | ~4 | 1.7 | 2.7 | **3.5** |
| deals per rubber | median 356 | median 14 | median 9 | **median 6** |

The make rate barely moves after the first step because the bidder is re-tuned to match: each
improvement makes the hand worth more, and the point is to bid it, not to make the same contract
more comfortably. Over- and undertricks are balanced (0.67 / 0.57), which is the real target.

**The calibration in `evaluate.ts` couples all of this together.** It maps counted winners to
tricks actually taken, and it was fitted by measurement, not derived. Anything that changes how
well the bot plays invalidates it — this has been refit twice already, once after drawing and once
after card play, and both times outcome measurement disagreed with the raw regression. Re-measure
rather than reason about it.

### Open threads

- **Git identity is not yet configured.** The machine's global git identity is the user's company
  account, and `gh` is logged in as the company GitHub user. The plan is a conditional include in
  the global config (`includeIf gitdir:C:/Users/EricNewman/personal/`) pointing at a personal
  identity, plus an SSH host alias with a dedicated key so the account is determined per repo by
  the remote URL rather than by global state. Awaiting the user's personal GitHub username and
  preferred commit email. `git init` has not been run.
- **Draw-phase pacing is unsettled.** The layout and the animation are now specified
  (`REQUIREMENTS.md` §1.3) and built, but the durations in `game/timing.ts` are first guesses. A
  turn costs roughly 0.6s to 1.5s of animation depending on the choice, times 26. Whether that
  reads as deliberate or as waiting is the open question, and it is the whole reason the thing
  went onto a phone this early.
- **How much should the bot remember?** Discards are not shown, so recall is part of the game and a
  perfect-memory bot has a real edge. The `Bot` interface must therefore take "what this bot
  remembers seeing" as explicit state handed to it, never read from engine state directly — which
  keeps lossy memory available as a difficulty lever. Whether v1's bot forgets is undecided.
- **The bot bids as though the auction were silent.** Observed: a human 1♣ answered with 3♣.
  Nothing is strictly wrong — 3♣ was legal and within what the hand was worth — but two things
  behind it are worth fixing together.

  First, `bestAffordableBid` values every strain against its own thirteen cards and never reads
  the opponent's calls. It uses the auction only for legality, and `standingLevel` feeds the
  double decision alone. So a 1♣ opening tells it nothing, when in a two-player game it is the
  strongest evidence available: if they have clubs, the bot's own clubs are worth less as trumps
  and more as defence. §1.5 calls the auction "pure competitive negotiation", and a negotiator
  that ignores what the other side says is not negotiating.

  Second, it always bids the *most* it thinks it can make rather than the least that takes the
  contract, so it jumps rather than competing a step at a time and leaves itself no room to be
  pushed. Below-the-line points do reward bidding your value, so this is a trade rather than a
  plain bug — but jumping to the maximum on the first opportunity gets both halves wrong at once.

  Beware the standing coupling: changing how the bot bids changes what it makes, which invalidates
  the calibration in `evaluate.ts`. Re-measure.
- **The bot has no memory.** `drawDecision.ts` weighs card 1 against the average unknown card,
  where "unknown" means everything not in its hand — including the cards it drew and threw away
  itself. That is exactly a player with no recall. Memory belongs in that pool and nowhere else:
  shrinking it by what the bot remembers discarding is the whole difficulty lever, and it is a few
  lines rather than a rewrite.
- **Turn clock.** None in v1. Revisit if the 26-turn draw phase drags.

### Testing on a phone

Development is Windows + desktop Chrome with the DevTools device toolbar; two-player testing uses a
normal window plus an incognito window, since separate `localStorage` means separate seats. Chrome
cannot verify WebKit behavior (safe-area insets, `dvh` viewport, PWA install, background socket
drops) — `REQUIREMENTS.md` §3.6 covers what needs a real iPhone and when.
