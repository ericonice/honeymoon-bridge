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
npm run deploy  --workspace @hb/web   # Cloudflare Pages; live at honeymoon-bridge.ericonice.com

# A single test file or test
npx vitest run test/scoring.test.ts --workspace @hb/engine
npx vitest run -t "pays 700 for a rubber won two games to none"

# Measuring the bot. Not tests — slow, and they print numbers rather than pass.
# All from the repo root. Everything after `--` is passed to the bench.
npm run bench:rubber    --workspace @hb/web -- 500      # two bidders over full rubbers
npm run bench:par       --workspace @hb/web -- 300 sampling   # tricks lost against perfect play
npm run bench:head      --workspace @hb/web -- 120 25   # two card-play policies, in points
npm run bench:calibrate --workspace @hb/web -- 400      # refit the estimates against par
npm run bench:auction   --workspace @hb/web -- 12       # why the bidder bid that
npm run bench:strain    --workspace @hb/web -- "S:AK4 H:AK4 D:A43 C:AK32"
npm run bench:draw      --workspace @hb/web -- 300 open # draw policies; `open` runs the variant

# Deals a person actually played, from the hand log. Not generated — pass the file.
npx vite-node bench/hands.ts hands.json         # from apps/web; add v=2 for one version
```

`bench/hands.ts` reports **per bot version and never pools**, which is the whole reason
`bot/release.ts` exists and is exactly what this bench did wrong at first. The version is
only the coarse axis, though — strength, boldness and the disguise change the play too,
and the shipped boldness changed with v2 — so each block prints its own configuration
census whenever it holds more than one. Its replay section is the exception and is
deliberately not split: it asks what *today's* bidder would say, so who bid at the time
has no bearing on the answer.

`bench/rubber.ts` takes flags after the counts: `nodouble` restores the old
five-level-only reference, `equity=N` sets what the challenger prices a game at, and
`vs=N` replaces the reference with **this same bidder** at a different trust weight.
That last one is not a variant, it is the answer to a question the legacy reference
cannot answer — see "the instrument decided this one" below.

`par` and `head` take minutes and report every 25 deals; `rubber`, `calibrate` and `auction` finish
in seconds. **Piping any of them through `grep` or `tail` re-buffers stdout and hides the progress
until the end**, which makes a working run and a wedged one look identical.

**The reference bidder must be able to hurt you, and for a long time it could not.**
`bench/rubber.ts`'s reference doubled only from the five level. Recorded games showed
the bot's eight worst deals were doubled contracts, **six of them at the four level**,
carrying 78% of a 205-point-a-deal deficit — and every one of those six was invisible
to the bench. The reference now doubles off the *solver*, from down two, because a
heuristic doubler shares the estimator's blind spots and so fails to punish exactly
the hands the estimator misreads. It is a bench-level intercept rather than a `Bot`,
and it is handed the `DealState`: no bot may ever reach the solver for a seat that is
thinking, so an oracle structurally cannot be one.

**Bidding can only be measured by `bench/rubber.ts`.** Everything else plays deals at love all,
where a bidder has no part-score to protect, no game to stretch for and nothing to sacrifice
against — the change that turned out to be worth 464 points a rubber looked like a wash by every
other bench in the list.

npm workspaces, not pnpm — pnpm is not installed on this machine. Node 24, npm 11.

## Layout

```
packages/engine/     @hb/engine — headless rules engine. No UI, no I/O, no network.
packages/protocol/   @hb/protocol — what crosses the wire, and the tests that it is only that.
apps/web/            @hb/web — Vite + React PWA.
apps/web/src/bot/    the computer opponent, and the double-dummy solver it plays with.
apps/web/bench/      how the bot is measured. Not tests: slow, and they print numbers.
apps/server/         @hb/server — Cloudflare Worker + one Durable Object per table.
```

`bench/` is not shipped and not run by `npm test`. It exists because almost every claim about the
bot in this file was wrong the first time it was measured, and several were wrong in the direction
that felt most obviously right.

**Before measuring what a setting is worth, measure that it does anything.** Two psych settings once
came back six points apart with *identical* win-loss counts, which read as a clean null and was
nothing of the kind: the credit being tested produced two psychs in four hundred deals, so both
runs were the same bot playing itself. Two hundred rubbers of the slowest bench in here, spent
comparing nothing against nothing. `bench/auction.ts` reports how often the behavior actually
fires; a knob whose effect on behavior has never been observed is not yet a knob.

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
the table, the rubber behind it and the deals already scored into it; `summarize` derives the
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
it.** The test walks the serialized snapshot for anything card-shaped and checks it against what
the seat may not see: the opponent's hand, the undrawn stock, their card 1, their discards, and
every one of this seat's own discards bar the card its own last turn threw — and that one only
while that turn is the one that just resolved, since `lastDraw` names it so §1.3's reveal can show
the card being thrown away as it goes. The moment the opponent draws, it is forbidden too. It is
deliberately blind to the snapshot's shape, so a field added later is walked without anyone
remembering to update it. There is also an anti-vacuity test asserting the seat *does* get its own
hand — a leak test that passes by sending nothing is worse than none.

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
- **There is one optional house rule, and `DealRules` is where variants live.** The open discard
  (`REQUIREMENTS.md` §3.6b, "Draw style" in Settings, which offers two cards or three) lays the top of
  the discard pile face up and lets a turn take it instead of either of its own two cards — so the same turn throws both of them, and the pile still nets one
  card a turn. Off by default: §1 is the game and every number in this file was measured under it.
  Rules travel on `DealState` and are carried forward by `nextDeal`, so the reducer can answer "is
  this legal" from the state alone and a rubber is played under one game. The property that makes it
  legible: turns alternate and every turn covers the pile with a card the acting player threw, so the
  card on offer is *always* the opponent's last discard.
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

The whole app is capped at a phone's width and centered, since every screen is laid out for a hand
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

**The bot is versioned, from v1 Angela James; v2 Bobby Orr is current.** `bot/release.ts` holds it; versions are numbered from
one and named alphabetically after hockey players, so a list of them reads in the order they
existed — Angela James, Bobby Orr, Cammi Granato, Doug Harvey, Eddie Shore, Frank Mahovlich,
Gordie Howe, Hayley Wickenheiser, Igor Larionov, Jean Béliveau. **The name appears
in Settings and nowhere else.** Across the table the opponent stays the computer: a first name in
the seat opposite promises a personality that is not there.

Bump it whenever the play changes enough that results either side of the change are not measuring
the same opponent — which is the whole reason it exists. `records.ts` sends the version, the server
validates it, and `0006_bot_version.sql` stores it. Two things that will read as bugs later and are
not: the column is **nullable, and null means "before versions" rather than "unknown version"** —
nothing recorded which bot those games were against and nothing can. And a report *without* a
version is accepted rather than refused, because the service worker keeps old builds in circulation
and a rubber somebody played is worth recording whether or not their client knew the question.

**Found on a real device, and fixed.** A sign-in link cannot reach an installed PWA on iOS. The
home-screen app has its own storage, Mail opens links in Safari, and a link works once — so tapping
it signs Safari in, leaves the app untouched, and burns the credential. Sign-in is therefore a
**typed code** now, with the link demoted to a convenience and omitted entirely when the request
comes from a standalone app. The code is six characters of the invite alphabet, looked up by
address *and* code, with five attempts before the outstanding codes for that address are burned.

The general lesson is worth more than the bug: anything that leaves the app and comes back cannot
be assumed to come back to the same app, and desktop Chrome will insist that it does.

**There is a walkthrough now, and it covers the draw and nothing else** (`REQUIREMENTS.md` §1.3a).
A four-step spotlight **tour** on the first turn, then two **notes** on the second and third, because
the auction and the play are ordinary bridge while the draw exists nowhere else.

The tour and the notes do different jobs, and it was built as notes alone first, which was wrong: the
notes explain the *rules* while the tour names the *screen*, and roughly half the draw screen carries
no label — the opponent's hand row does not say whose it is, and the turn-track dots say nothing at
all. The counter-argument, that a tour would restate the labels the three cards already have, is true
of those three cards and false of everything else on the board. The notes stay notes because there is
nothing for them to point at: "the card you threw is gone" is a fact about a place that deliberately
does not exist.

Not a scripted deal either — every deal teaches the mechanic identically, and a hand-picked seed is
only needed to teach strategy. Robot game only, since at a table the other seat would be watching
somebody read with no idea why. `walkthrough.ts` holds the copy; `Spotlight` does the cutout with one
element and a 9999px `box-shadow` spread rather than four bands agreeing on a rect. `DrawPhase` keys
the notes off `handSizes[me] + 1`, and a gap in the numbering would mean a walkthrough that never
completes and so restarts every deal — there is a test for that. Done is stored when the *tour*
finishes rather than the last note, so walking it and then leaving does not earn a second tour.

**The bot bids, draws and plays.** What each part does is written up in `REQUIREMENTS.md` §2.1.

**There is a double-dummy solver now, and it changed how everything here is measured.**
`bot/solver.ts` returns the tricks each side takes with both hands face up and both playing
perfectly. Two hands rather than four, and a trick decided by its second card, make this a far
smaller search than in ordinary bridge — bitmask hands, a transposition table, and collapsing
adjacent cards to one move bring a full 13-trick solve to about 7ms, falling to under 1ms by the
third trick.

It is the yardstick before it is anything else. Self-play numbers like "contracts made" are not
strength metrics — a bot that underbids everything makes all of them — and head-to-head needs
thousands of deals to separate two similar bots because the deal is most of the variance. Par
cancels the deal, and says *which card* was the mistake. `bench/par.ts` reports it.

The one number to keep: `test/solver.test.ts` cross-checks the solver against a brute-force
minimax on small positions. That test immediately caught the collapsing treating the *led* card as
out of play, which silently made a queen and an ace interchangeable behind a led king. Anything
touching the search needs that cross-check to stay.

**`bot/samplingBot.ts` is what the solver bought.** It guesses the hand it cannot see — everything
unaccounted for, minus any suit the opponent has shown out of — 25 times over, solves each guess,
and plays the card that does best on average. Measured against the heuristic card play it replaces:
defense went from giving away 1.03 tricks a deal to 0.55, the bot stopped beating double-dummy as
declarer (it was taking 0.57 tricks a deal more than par purely on gifts from the defense), and
head-to-head it wins by **+37 points a deal** over 240 deals, near four standard errors. Because
both bots bid and draw identically, every one of those points comes from card play alone.

That margin has been measured three times and moved a long way each time — +34, then +22, then
+37 — without the card play changing at all. What moved was the bidder underneath it. The first
refit made it timid and the margin fell; settling the intercept so it bids the hand's value
restored it and then some. **How much a card-play improvement is worth depends on how much is
being bid**, because a contract nobody stretched for is a smaller target to defend or to make.
Quote either number on its own and it misleads; the pair only means something measured together.

**The sampler reads the auction, and it is worth 15% of everything the bot throws away.** A suit
they bid is a suit they are long in, so guessed hands are drawn with a weighted race off the seeded
generator rather than a uniform shuffle — cards in a strain they named are twice as likely to be
theirs. Tricks lost against par fall from 1.23 a deal to 1.05, improving declarer and defense by
almost exactly the same amount.

That change was nearly deleted. Measured in **points** it reads as slightly *harmful* — +47.8 a
deal against +50.1 — and it is not: points per deal cannot resolve an effect this size at any
sample count worth waiting for. **Measure card play against par, never in points.** This is the
third instrument failure of the same kind here: the bidder looked like a wash until the bench played
whole rubbers, this looked harmful until it was measured in tricks, and both were real all along.
When a change that should obviously work measures as nothing, suspect the instrument before the
idea.

Sampling count is the cost *and* the difficulty lever, which is a better lever than heuristic
weakness: it makes an opponent that is unsure rather than one that is wrong on purpose.

**This is what the game against the computer now plays.** `localSession.ts` builds it with
`SAMPLES = 25`, and that has been **checked on a real phone: no stutter.** The concern was that the
action is computed synchronously on the main thread inside the pause before the bot moves, so the
180ms at the opening lead eats into an animation rather than delaying the move — it turns out to
fit inside the pause. If a future change makes it show, turning `SAMPLES` down is the first
response and a worker is the real fix; neither is needed now. `cardPlay.ts` and
`createHeuristicBot` stay — the sampling bot delegates bidding and the draw to the second, and the
first is what the benches measure against.

**The calibration in `evaluate.ts` couples all of this together**, and it is now fitted against par
rather than against the bot's own play. The three earlier fits were circular twice over: the
contracts in the sample were the ones the previous constants chose, and the tricks were whatever
the previous card play managed. Par is computable for every hand in every strain whether or not
anything would bid it, so the sample is the hands rather than the auctions. `bench/calibrate.ts`
does this in about 30 seconds.

That refit moved the constants a long way — the old ones over-predicted by 1.2 tricks — and the bot
now makes 77% of its contracts against 79% that were makeable. It is still slightly under-bidding
(over- and undertricks 0.75 against 0.36).

Anything that changes how well the bot plays still invalidates the fit. And the second rule, which
cost a whole afternoon to learn: **the fit cannot rescue a bad feature.** No affine map improves on
what it is given, so when accuracy stalls the thing to change is `rawTricks`, not the constants.

**`rawTricks` was where the accuracy actually was.** It scored a suit contract on trump *length*
alone, so AKQ and 8765 were worth the same as trumps — trump honors registered nowhere at all,
because the no-trump branch was the only place honors were read and there they are not trumps.

Fixing that alone does not work, and the way it fails is worth knowing. Once trump honors count, a
trump contract scores its own suit at least as highly as no-trump scores it, so **no hand can ever
prefer no-trump** — measured over 800 hands, no-trump stopped being the best strain even once. The
`prefers no-trump when the strength is spread` test caught it, and the test was right: paired
measurement over 800 shared opponent hands gives that hand no-trump 8.98 against clubs 8.86.

So both halves land together, and both come from the same fact — **the opponent holds only a third
of what you cannot see.** `THEIRS`, and the odds table built from it, are the whole model:

- *Trumps* concede the trumps left in the other hand once the run down from the ace has dragged out
  what it can. AKQ concedes only a fourth trump if they have one; 8765 concedes about three.
- *No-trump* adds, to each suit's winners, the cards underneath them for the share of deals in
  which the opponent has already run out. AK4 is worth about 2.3 rather than 2.
- *Side suits under a trump contract* get winners and no length credit at all, because length only
  cashes if nobody ruffs it. That asymmetry is the entire reason a balanced hand can prefer
  no-trump, and removing it is how the trump-only fix killed no-trump.

The distribution, not its mean, is the point. They hold 3.3 of the ten cards missing from a
three-card suit *on average*, so on average the third card is dead — but they hold two or fewer
about three times in ten, and then it wins. Averaging first loses that tail, and the whole
undervaluation of no-trump traced back to it.

r-squared went from 0.42 to 0.50 and average error from 1.55 tricks to 1.14. `RUNOUT` is the one
fitted knob and it is touchy: at 1.0 no-trump is over-valued by 1.3 tricks, at 0.45 it is never
bid at all. **`bench/calibrate.ts` reports bias per strain, and that is the number to watch** — a
bias that differs by strain is one a single affine calibration structurally cannot remove, and it
is what catches this class of mistake. `bench/strain.ts` settles arguments about a single hand.

**The first recorded games found the bot losing badly, and the cause was one bug.** Fifty logged
robot deals, analyzed by `bench/hands.ts` — the pass the hand logging was built for. The bot was
**205 ± 65 points a deal down**, 32 deals to 18. Card play was not the problem: it threw away 0.46
tricks a deal against the person's 0.22, which is worth tens of points, not hundreds. Eight deals
were, all of them contracts it declared and got doubled in, carrying 8,000 of the 10,250-point
deficit. The other 42 were roughly level.

The bug: **`estimateFor` blended the level they claimed into the value of *their* contract and threw
it away when pricing its own.** On a hand where the person had bid 4♥, the bot simultaneously
believed they took ten tricks and that it took eight and a half in 4NT — and bid on the flattering
half of a contradiction. `bidValue.ts` then priced that as down two, a cheap sacrifice against
conceding a game. **The pricing was never wrong; the estimate was six tricks too high.** One
function now answers "how many tricks does the declarer of this contract take" for both halves of
the decision, which is what stops the two diverging again.

**And the instrument decided this one, against the idea.** The obvious fix — trust their bid
symmetrically, at the same 0.75 — fixed all eight recorded disasters and *lost* 200 points a rubber.
That looked like the reference overclaiming, so the bench grew a `vs=` mode that plays the bidder
against **itself** at a different weight. Against a bidder as honest as its own, trusting their bid
is actively harmful: −47 at 0.25, −248 at 0.5, −354 at 0.75. The margin loss was real, not an
artifact. The reason is that trick counts are **not additive across strains** — a hand pair can be
11 tricks in hearts for one seat and 10 in clubs for the other — so "they claim ten, therefore I
hold three" is sound arithmetic only inside their own strain, and the cross-strain step is
guesswork. The weight ships at **0.25**, a wash in points that still avoids one more real disaster,
and gated to level three and up: a one-level bid is a floor rather than an estimate, and reading it
as a claim about seven tricks is what turned a bidder that competed into one that folded.

**What actually fixed the disasters was upstream, in `rawTricks`.** No-trump was over-valued by
**+1.22 tricks over 800 hands** — the largest per-strain bias in the model, against +0.06 to +0.15
for the suits. The missing term: with no dummy and no partner, **a suit this hand cannot stop is run
to the end, and every trick of it forces a discard from exactly the winners the model has just
finished counting.** A winner is only worth counting if the hand gets to cash it. `RACE_COST` prices
that, and the trend it was fitted to is about as clean as this file gets — bias against par ran
+0.31, +0.86, +1.25, +1.98, +3.07 as the unstopped length went from two or fewer up to six or more.
The race term alone cut the bot's doubled disasters by **56%** and fixed four of the eight recorded
hands on its own; r² went 0.401 to 0.448 and average error 1.57 to 1.51.

Charging the *whole* race was the mistake, and it failed exactly the way the trump-honor fix once
did: no-trump went from best strain on 41 hands in 800 to **one**, while every bias column stayed
healthy. `RACE_FREE` fixes it — every hand has a shortest suit, a flat 4-3-3-3 already expects about
0.9 cards of race, and that much is inside the fitted intercept because the intercept was fitted
over hands that all had it. **Only the excess over an ordinary hand's race is a reason to prefer a
trump contract.** Which is the same discovery the rest of the model keeps making: never the level of
a quantity, always the departure from what an average hand holds.

`bench/calibrate.ts` now also reports **what the strain choice costs against par**, because
over-debiting a denomination does not show up as bias — it shows up as a denomination that stops
being bid, and the handful that survive look fine. Reported as a trick shortfall rather than an
agreement rate, since par ties constantly and "did it pick *the* best strain" is mostly a question
about an arbitrary tie-break.

**Two knobs were revisited once the reference could punish, and only one moved.** `bold` maps to a
game equity of 550 and was the fresh-install default, chosen above the measured optimum precisely
because the old reference barely doubled. Against one that does, bold is worth nothing in points
(+612 a rubber against +635) and walks into 45% more doubled disasters, so **the default is now
normal** — the setting stays for anyone who wants a bolder opponent. `DOUBLED_FROM_DOWN` is the
opposite outcome and worth recording as such: it was flagged here as unmeasurable, it is measurable
now, and measurement says it barely matters (+633 against +635, wrecks 71 against 80, both inside
noise). **Left at 2.** A constant changed on noise is worse than one left alone on judgement.

**What the log was missing, and now records.** Vulnerability and the rubber standing the deal was
*bid* at — without it every point figure above is a love-all approximation and the bot's actual call
cannot be replayed at all, since `bidValue` prices everything against the standing. And the seed,
the starter and the draw turns, which make the deal exactly reproducible: `initialHands` is what the
draw *produced*, so 26 of a deal's 52 decisions were unmeasurable. The seed is kept in a ref in
`localSession` rather than on `DealState`, because a field holding one inside the deal is a leak
waiting for somebody to forget to strip it from `viewFor`; it is safe to send only because the deal
is over. All four are **optional** server-side, for the same reason `botVersion` is: the service
worker keeps old builds in circulation, and a deal somebody played is worth recording whether or not
their client knew to send them.

Deliberately *not* logged: what the bot thought. It is version-specific, it bloats the record, and
it is recomputable from a replayable deal. Log the deal, replay the bidder.

### Open threads

- **The growing-hand thresholds were tried and left alone, which is not the same as untouched.**
  `rawTricks` counts the opponent's holding against a full thirteen — a finished-hand assumption,
  and on turn one it says a lone card wins nothing, so every card without an honor scores zero and
  the bot cannot tell a card in the suit it is building from one in a suit it is not. That is the
  same shape of mistake `potentialTricks` exists to fix for honors, and it looked like an oversight.

  Scaling the opponent's holding by how full the hand is measured **0.39 tricks a deal worse**
  (`bench/draw.ts`, about two and a half standard errors). Early in the draw the scarce thing is
  honors, not length: twelve turns remain to build a suit and no turn at all can manufacture an
  ace. Crediting early length made the bot keep filler over honors. A test asserting it keeps a
  queen on turn one failed first and was right; overriding it would have shipped the regression.

- **The open discard is built, off by default, and entirely unmeasured.** It exists because the draw
  phase has no interaction in it: a turn spends two stock cards whichever card is taken, so nothing
  either player does changes what the other is offered, and 26 of a deal's 52 decisions are two games
  of solitaire side by side. `bench/draw.ts open` plays the whole bench under it and reports how often
  the third option is actually taken — 25% of the challenger's turns — which per the rule above is the
  first thing to establish and the *only* thing established so far. What is not: whether it reduces
  luck, which is the whole reason it was built. The metric that would say so is not the existing
  margin against a deliberately poor reference; it is how much of the outcome survives holding the
  policy fixed, and no bench here measures that yet.

  Two things it needs before it can be judged. **`chooseTake` does not price the gift** — rejecting a
  card now hands it to the opponent, and only that one of the three choices has a priceable cost, since
  the other two give away a card 2 the decision has not seen. Weighting it would be a constant nothing
  has measured, so it is left alone. And **the bot sees the pile but is told to forget it**: under this
  rule a seat with perfect recall ends the deal knowing the other hand exactly, so forgetting stops
  being a difficulty lever that is merely *available* and becomes one that has to be built. It is
  handed its own discards and nothing it only watched cross the pile.

- **`DEFENSE_SHARE` is why the draw stopped passing up aces, and it was found by watching rather than
  by measuring.** Playing the three-card draw turned up the bot declining a visible ace. The cause was
  not the new rule: `rawHandValue` valued a growing hand purely as *declarer in its best strain*, and
  by that measure a low card added to an already-long suit beats an ace — an extra trump is a winner
  **and** one fewer trump left in the other hand, which `trumpTricks` prices at about 1.33 against an
  ace's flat 1.00. Right about a spade contract, silent about the deal somebody else plays, where the
  sixth spade is worth nothing and the ace is still a trick. So a growing hand is now valued as a blend
  of declaring and defending, and an ace scores in both terms where a low trump scores in one.

  **Fitted to the behavior, not to the metric, and the doc comment carries the table.** Over ~3,700
  part-built hands offered an ace, refusals ran 5.25% at weight 0 and 0.97% at 0.3 — and the column
  that decided it is *how many of those refusals had an honor as card 1*, which goes 24% → 100% between
  0.2 and 0.3. At 0.3 no low card ever beats an ace and every remaining refusal is a king or queen
  filling out a holding the hand already has, which was right all along. Above 0.3 nothing improves.

  **In hand quality it is worth nothing: +0.04 ± 0.10 tricks against the same policy at weight 0.**
  Expected, and the reason is now familiar — it flips 1.3% of draw decisions, which are by construction
  the ones already on a knife edge, the same shape as the recall finding. It ships because passing up a
  visible ace looks broken to somebody watching, which is a reason no trick metric can see. Do not
  quote the margin as evidence for it; the fit is the two-column table.

  **One card crosses the hidden-information line for this, and only one.** `drawRevealFor` now names
  the card the *opponent* took when they lifted it off the open pile — it was face up when they took
  it, `viewFor` had been sending it to that seat as `discardTop` the turn before, so declining to name
  it would be hiding a card the player had been staring at. Their card 1 and card 2 stay theirs. The
  protocol walker caught the widening the moment it landed, which is what it is for, and permits it on
  exactly the terms this seat's own last discard is permitted: only while that turn is the one that
  just resolved. There is a test asserting it stops being sent once the seat draws again — a
  permission that outlived its reveal would be a running list of cards in the other hand.

  **The three choices ended up in one row, and that is where they should have started.** The pile is
  the third slot of the choice row on a three-card draw — the pile *itself*, not a copy of its top
  card, because a copy has to fly back to the pile whenever it goes untaken and so has to lie about a
  card that never moved. All three share one `ChoiceSlot` shell, which is what makes them line up:
  the pile carrying its own wrapper sat higher and narrower than the cards beside it, and three things
  that nearly line up say less than two that do. Labels name the card rather than the action — "Face
  up", "Unseen", "Theirs" — since the row already says *take one*. This overrules §1.3 on where the
  discard pile sits, on that section's own stated reason: it sat beside the stock because neither was a
  tap target, and that stopped being true. It goes back there on a two-card draw.

  **Two layout things that were tried and rejected, so they are not tried again.** Shrinking both piles
  to a small stack with the count beside them buys back about 120px of phone height for the third
  choice, and the deck's count really is derivable from the `TurnTrack` and the opponent's hand row —
  but the count *printed across the card* is what a player actually looks at, and at a third the size
  there is nowhere to print it. The piles stay full size. What did survive from that pass is merging the
  opponent's seat label into the commentary line: their name had been on screen twice in adjacent
  bands, and the label now carries only what a sentence cannot say.

  **Three UI bugs from that reveal, and the second is the one worth remembering.** The amber mark on a
  takeable card was a single pale ring, invisible against the one ground it has to work on — the
  near-white card face — so it is two layers now, a translucent-black gap and then the amber, which
  needs to know nothing about the per-theme table color or its sheen. The commentary line lost the
  space before its emphasized phrase and read "took theunseen card", because the `p` holding it is a
  **flex container**: every child is a flex item and whitespace at an item's edge is trimmed like a
  block's, so the sentence has to be one inline `span` for its own spaces to survive — `{" "}` does not
  help, since a whitespace-only node between two items is discarded outright. And the pile-lift
  animation reported `animated` correctly and still drew nothing, because the flight guard demanded
  endpoints from `TheirPair`, which is only mounted with the computer's cards showing: the flight was
  dropped in exactly the configuration anybody plays in and worked in the one used to develop it.
  `test/drawPlayout.test.ts` pins the pure half; the guard now resolves points per leg.

  `bench/draw.ts` grew `vs=N` for this — the same policy at a different weight, because against
  `alwaysKeep` both weights win hugely and the difference between them drowns. Its disagreement counter
  now compares against **the reference actually in play**; hardwired to `alwaysKeep` it reported 70% of
  decisions changed when the real answer was 1.3%, which is the same instrument failure this file keeps
  recording, in the read-out rather than in the experiment. Note `rawHandValue` is used by the draw
  decision and nothing else, so none of this touches the bidder, the card play or the calibration.

- **Draw-phase pacing is unsettled.** The layout and the animation are now specified
  (`REQUIREMENTS.md` §1.3) and built, but the durations in `game/timing.ts` are first guesses. A
  turn costs roughly 0.6s to 1.5s of animation depending on the choice, times 26. Whether that
  reads as deliberate or as waiting is the open question, and it is the whole reason the thing
  went onto a phone this early.
- **How much should the bot remember?** Discards are not shown, so recall is part of the game and a
  perfect-memory bot has a real edge. The `Bot` interface must therefore take "what this bot
  remembers seeing" as explicit state handed to it, never read from engine state directly — which
  keeps lossy memory available as a difficulty lever. Whether v1's bot forgets is undecided.
- **The bot bids in points now, and the auction is the last thing it cannot read.** Contracts are
  priced by `bidValue.ts`: play the deal out at each plausible number of tricks, hand it to the
  engine's own `scoreDeal`, fold it in with `applyDealScore`, and read how far the standing moved.
  Nothing there restates a scoring rule, so game bonuses, the 500 and 700, doubled vulnerable
  penalties and honors are all priced without anyone remembering to price them.

  Measured over 1000 rubbers against the old "can I make it" bidder, seats exchanged:
  **+464 points a rubber, 775 rubbers to 225.** Three things stopped being rules and became
  consequences of that one comparison — stretching for game, sacrificing, and not jumping to the
  top of what the hand can make. Doubling too: it was a pair of hand-picked thresholds and is now
  the same contract priced the same way.

  **The measurement is the lesson here.** Every bench played deals at love all, and by those
  numbers this change looked like a wash — 64% of contracts made against the old bidder's 68%. Of
  course it did: part-scores, game stretches, vulnerability and sacrifice are its entire point and
  a love-all bench has none of them. `bench/rubber.ts` plays full rubbers and the same change is
  worth 464 points. **A bidder measured on deals in isolation is being marked on the one part of
  its job it does not do.**

  Two things bit hard enough to be worth naming. Pricing a pass as "they make exactly what they
  bid" sounds neutral and is not — it makes defending look hopeless, so every sacrifice beats
  passing and both bots climb to the seven level; the fix was a defense calibration, fitted the
  same way against par from the defending seat. And that fit has to be taken **against the strain
  the declarer would actually pick**, not across all five: the strain that gets bid is the one they
  are long in, which is disproportionately one this hand is short in, so an unconditional fit is
  optimistic about defending by 1.47 tricks.

  **It reads the auction now, and the surprise was where the information lives.** The obvious
  inference — a suit they bid is a suit they are long in, so this hand is worth less in it — is
  correct, threads neatly into `THEIRS_BID` because the model already keeps an assumption about how
  much of a suit they hold, and is worth **nothing measurable**: +467 against +464, on a standard
  error of 30. It fires too rarely, because the bot is usually bidding its own suit rather than
  theirs.

  What pays is the *level*. Their bid says how many tricks they think they hold, and blending that
  with what this hand can see is worth **+651 a rubber against +467**, weight fitted at 0.75 on a
  plateau from 0.6 to 0.9. Their claim is better evidence than the bot's own thirteen cards — which
  is obvious in hindsight, since it is the only thing in the deal chosen by somebody who could see
  the cards being described.

  And the postscript worth keeping: trusting the bid *completely* is no longer a disaster. At 1.0
  the margin only slides back to where 0.6 sits. Taking the bid as fact was what drove both bots
  into doubled contracts at the five level earlier — but that needed a trick of optimism in the
  estimate and no price on being doubled as well. **Two bad numbers made the spiral; none of them
  did it alone**, which is worth remembering before blaming the next regression on whatever changed
  last.

- **What used to be called psyching is built, measured once under that shape, and now floored.**
  The original version let the bot name a suit it did not hold at all — a real psych, in the
  bridge sense, priced by a single `PSYCH_CREDIT`. Measured, it worked exactly as a lie should: at
  200 (about one in six deals) the other seat, playing against a sampler that reads the auction and
  can therefore be fooled, threw away 0.02 more tricks a deal in both roles. It just cost far more
  than it returned — contracts makeable at par fell from 53% to 49%, an order of magnitude the
  wrong way — because one pass closes the auction and a suit named from nothing is sometimes a suit
  the bot is stuck playing.

  That version shipped switched off and stayed switched off, but a session with it turned on for
  testing surfaced the actual failure mode: the bot opened **2 of a suit** it barely held. Not a
  bigger lie — the credit only ever touched the opening bid — but the honest, undiscounted
  consequence of one: having named a three-card suit for the credit, a normal sacrifice calculation
  later in the same auction can honestly prefer competing in it again over letting the contract go,
  and a person watching sees a computer that named and then re-raised a suit it plainly does not
  have. A credit that cannot tell "claims nothing" from "claims three cards" apart was pricing both
  as the same lie.

  **The mechanic is now a disguise rather than a lie, and it is floored rather than priced flat.**
  `DISGUISE_MIN_LENGTH` in `heuristicBot.ts` means the credit never fires under three cards, at any
  price — a suit that thin is not a real alternative, so there is nothing left to switch on that
  could produce the void-suit case above. What the credit buys instead is not naming this hand's
  objectively best suit every time, so the auction alone cannot be read as an exact map of its
  shape; every suit it can still pick this way is one it could honestly have opened. Three cards is
  kept rare rather than forbidden — `DISGUISE_THIN_FACTOR` scales the credit down hard at exactly
  three, checked against `bench/auction.ts`: 0.25 produced no three-card disguises at all in 400
  deals, 0.5 produced one, which is the "very infrequently" this was asked for rather than "never."
  Four or more cards gets the full credit and is the common case: 91 of 1000 deals in the same
  bench, against zero, ever, below the floor.

  **None of the old cost/benefit numbers describe this version.** They were measured against a
  mechanic that could bid a void; this one structurally cannot, and the floor removes what made
  those psychs the cheapest and most damaging kind. It has not been refitted against par or against
  a rubber since, and stayed off by default for a while on that basis — until a session playing
  against it live found the gap the floor did not close: the credit is flat, so on a hand strong
  enough that its own honest bidding wanted to jump, the credit could still win the comparison and
  talk it down to a one-level opening anyway. Found on a 19-count with a six-card AKT-high suit that
  opened 1♥. `honestlyWeak` in `heuristicBot.ts` closes that: the credit now only applies when the
  hand's own undisguised bidding would already stop at the cheapest level, so it is a real
  alternative for a hand that was bidding minimally regardless and never a lever on one that wants
  to climb. **On by default now** — the computer should be allowed to bid unpredictably; off is
  still there in Settings for anyone who would rather it bid exactly what it holds. What was never
  settled either way carries over unchanged: whether the disguise pays against a *person*, who forms
  a much stronger belief from an auction than a weighted sampler does and holds it far longer, is
  not measurable here — the same category as `DOUBLED_FROM_DOWN`, behavior aimed at a human that
  only a human can judge.

- **The bot remembers what it discarded, and it matters in one place rather than two.** Recall is
  handed to `chooseDraw` and `choosePlay` as explicit state by `botActionFor`, never read out of
  engine state — which is what the `Bot` interface always said it would be, and what keeps a
  forgetful opponent a matter of passing less rather than a rewrite.

  **In the draw it is worth nothing measurable**, and the argument for it was better than the
  result. Its own discards are precisely the cards it judged worse than an unknown card, so leaving
  them in the pool does bias the expected unknown card downward and does make it keep too often.
  Measured: it changes **0.6% of decisions** and moves hand quality by **+0.00 ± 0.10 tricks**.
  Removing a handful of below-average cards from a forty-card pool barely shifts a mean, and only a
  decision already on a knife edge flips. True, and irrelevant.

  **In the sampler it is not a bias at all but an impossibility, and it is worth 13%.** A card this
  seat threw away cannot be in the opponent's hand, and without recall the sampler deals them cards
  it watched itself put face down — by the last tricks roughly half of everything unaccounted for
  is exactly those thirteen. Tricks lost against par fall from 1.07 a deal to 0.93, and most of
  that lands on *defense*, which does more guessing about what declarer holds.

  Worth holding onto: the same recall, threaded into two decisions on the same afternoon, was worth
  nothing in one and 13% in the other. What separated them was not how good the reasoning sounded
  but whether the correction was to an average or to a set of possibilities. **Shifting a mean by a
  little changes almost no decisions; removing impossible cards changes what the solver is
  answering.**

- **Two-suited hands were underbid, traced to two separate bugs in `rawTricks`, both fixed and
  measured.** Found from two real games where the bot opened a 6-4 and a 5-4-2-2 monster at the one
  level instead of jumping toward game. The first diagnostic — bucketing `bench/calibrate.ts`'s bias
  by second-suit length — showed a real trend a strain-only breakdown could not see, but it turned
  out to be a noisy proxy for two different, more specific conditions underneath it.

  The first bug: a side suit's winners were counted the same way a *defender's* are, capped at two
  regardless of honors held. That cap is correct for defense — a defender's third-round winner needs
  the first two rounds gone first, and by then the lead is often elsewhere — but a declaring side
  suit headed by an unbroken AKQ cashes all three, guaranteed, nothing outranks them. Reusing the
  defensive cap silently priced every such side suit as if it were AK. Fixed by crediting the third
  card of a run beyond what the cap already gives (`runOutTricks`'s `extraRun`), gated to declaring
  only and discounted by the same "has the trump suit cleared them" probability that already gated
  the run-out credit, since a side suit's third round *can* still be ruffed under a trump contract
  even though nothing outranks it — only no-trump gets it undiscounted. Checked against a purpose-
  built bucket (does a side suit hold an unbroken run of three or more): bias went from a large
  systematic miss to +0.03 over the population that actually has this shape.

  The second, smaller bug: a void side suit got zero credit, full stop. `trumpTricks` already prices
  every one of this hand's own trump cards regardless of which trick each ends up winning — cashed
  in its own suit or spent ruffing elsewhere is the same one trick to that count, so there was nothing
  to double-charge. What was missing is the *other* side: the opponent's own cards in a suit this
  hand holds none of, which simply win for them uncontested unless something ruffs them away. Fixed
  with a flat credit (`voidRuffTricks`, fitted to `bench/calibrate.ts`'s own `shortest side` bucket),
  scaled down for a short trump suit that runs out too soon to ruff much of anything. Bias on that
  bucket went from -0.47 to -0.12 over 79 hands.

  Together: r² on "declaring, best strain only" moved from 0.498 to 0.511, and the two real hands
  that started this improved 0.68 and 0.79 tricks respectively against measured par. Both fixes are
  declaring-only by design — `bench/calibrate.ts`'s defending buckets never showed either pattern,
  and `rawHandValue`'s draw-phase valuation (a different question, covered by the open thread below)
  is untouched. This is the same part of the model that produced the "no hand can ever prefer
  no-trump" regression once before; both fixes were checked against that test and against the full
  bucketed bias, not just the overall number, on the way in.

- **Three of the eight recorded disasters survive, and they are a different bug.** Deals 31, 33 and
  39 in the log: the bot bids 4♦ on `D:AJ987543` and 4♥ on `H:A1096532`, both estimated near nine
  tricks against a par of six and seven. Neither is an auction-reading failure — the trust weight
  only just tips them either way — it is `trumpTricks` over-valuing a long suit with thin honors.
  Eight diamonds to the AJ is not eight tricks when the opponent holds KQ10, and nothing in the
  model asks. Same shape as the no-trump race gap, and it wants the same treatment: a bucket in
  `bench/calibrate.ts` keyed on trump length against trump top-run, measured before anything is
  changed.

- **No-trump is chosen on 13 hands in 800 where par ranks it joint-best on 169.** The race term is
  not costing tricks — the strain choice's shortfall against par *improved*, 0.15 to 0.12 — but it
  may be costing points, and the trick metric structurally cannot see that: 3NT is worth game where
  4♣ at the same nine tricks is not. `bidValue.ts` prices in points and should catch it, but the
  estimate it is handed is now about 0.6 tricks lower for no-trump, so the comparison starts behind.
  Worth a bench that scores strain choice in points rather than in tricks before touching
  `RACE_FREE`.

- **Turn clock.** None in v1. Revisit if the 26-turn draw phase drags.

### Testing on a phone

Development is Windows + desktop Chrome with the DevTools device toolbar; two-player testing uses a
normal window plus an incognito window, since separate `localStorage` means separate seats. Chrome
cannot verify WebKit behavior (safe-area insets, `dvh` viewport, PWA install, background socket
drops) — `REQUIREMENTS.md` §3.6 covers what needs a real iPhone and when.
