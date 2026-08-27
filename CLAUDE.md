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

# A single test file or test. Run these from the workspace directory, not the repo root:
# `vitest --workspace` takes a *config file* path, so `--workspace @hb/engine` resolves to the
# package's `main` and fails with "must export a default array of project paths".
cd packages/engine && npx vitest run test/scoring.test.ts
cd apps/web      && npx vitest run -t "the ring counts down this seat's own target"

# Measuring the bot. Not tests — slow, and they print numbers rather than pass.
# All from the repo root. Everything after `--` is passed to the bench.
npm run bench:rubber    --workspace @hb/web -- 500      # two bidders over full rubbers
npm run bench:par       --workspace @hb/web -- 300 sampling   # tricks lost against perfect play
npm run bench:head      --workspace @hb/web -- 120 25   # two card-play policies, in points
npm run bench:calibrate --workspace @hb/web -- 400      # refit the estimates against par
npm run bench:auction   --workspace @hb/web -- 12       # why the bidder bid that
npm run bench:bidcost   --workspace @hb/web -- 25       # what bidding by search would cost
npm run bench:strain    --workspace @hb/web -- "S:AK4 H:AK4 D:A43 C:AK32"
npm run bench:draw      --workspace @hb/web -- 300      # draw policies against each other
npm run bench:equity    --workspace @hb/web -- 1500      # what a standing is worth, as a win chance
# What remembering a board is worth. Ten minutes; needs a sample count to do anything.
npm run bench:rubber --workspace @hb/web -- 60 8 format=duplicate control nodouble memory

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

**What `bench/hands.ts` found once it could see the score, and it is not doubling.** Stripping every
doubled deal leaves the person **+52 ± 20** a deal over 204 deals, and it splits in opposite
directions: the computer **gains 66 a deal on contracts it declares** and loses **135 a deal on the
ones it lets the other seat buy**. Cut by vulnerability instead and almost all of it sits in one
cell — **person vulnerable and declaring, +255 a deal over 63 deals**, against **+22** for the
computer in the mirror-image position. At neither-vulnerable it is level.

**The cause is not any of the estimates, all three of which were checked and are sound.** Declaring:
bias **+0.07** tricks over 2,380 hand-strain pairs, regression slope 1.08. Defending, the blend the
bidder actually uses: bias **+0.13**, and **+0.11** at the four level. Card play: 0.49 tricks thrown
away a deal against the person's 0.53. Every component is individually calibrated and the bot still
loses, which is the signature of a wrong objective rather than a wrong number.

**What it is doing instead is settling for part-scores.** A game was cold at double dummy for the
computer in **59** of 238 deals and it bid and made one **7** times; the person had **68** and
converted **36**. Half of its own undoubled contracts — 42 of 84 — are at the one or two level on
hands worth **8.8 to 9.0 tricks at par**. That is the correct play for what `bidValue.ts` is asked
to maximize, which is expected points on *this deal* with a game in hand priced as a flat
`DEFAULT_GAME_EQUITY`. Part-scores are worth more expected points than a game that risks 200; they
just do not win rubbers, and the side that never wins a game is never the vulnerable one, which is
why the person's vulnerable contracts are where the whole deficit lives.

So the open thread is the objective, not a constant: **price calls in the probability of winning the
rubber rather than in points**, replacing `positionalValue`'s linear `equity × (games + part)` with a
lookup of P(win | standing) fitted from `bench/rubber.ts`'s own self-play. Three things fall out of
it — the contract that finishes a game gets its real worth, vulnerability gets priced because it is
part of the standing rather than a future cost nobody charges for (the gap
`DEFAULT_GAME_EQUITY`'s own comment names and leaves open), and risk posture becomes a consequence of
the probability curve rather than the `boldness` constant. Two warnings attached: the fit is circular
in the way the calibration was circular twice before, so it wants fitting, swapping in and refitting
until the coefficients stop moving; and **`bench/rubber.ts`'s headline has to become rubbers won
rather than points per rubber in the same commit**, because a bidder maximizing win probability will
trade points for wins and would otherwise measure as a regression. This file has recorded three
instrument failures of that exact shape already.

**`bench/equity.ts` measures what a standing is worth.** 3000 rubbers, 36,000 deal-start standings
recorded from both seats, fitted per games state as a logistic in the part-score and the points
margin. Three checks that do not depend on the model hold exactly: a level standing wins 0.500, one
game each wins 0.500, and a game down fits the exact negative of a game up with identical
coefficients — which is what licences imposing the antisymmetry in `equity.ts` rather than storing
four independent states.

| | worth, in chance of taking the rubber |
| --- | --- |
| holding a game to none | 0.500 → 0.670, **+0.170** |
| a 60 part-score at no games each | 0.500 → 0.564, **+0.064** |
| a 60 part-score at one game each | 0.500 → 0.650, **+0.150** |
| `DEFAULT_GAME_EQUITY`'s 400 points, at no games each | **+0.079** |

So the flat constant is worth **about half a game**, and a part-score is worth **2.3 times as much at
one game each as at love all** while `positionalValue` prices it as the same fraction of the same
constant in both. A flat term structurally cannot say the second thing at all.

**One claim here was wrong and the error bars are why it is not still wrong.** An earlier fit off 1500
rubbers put the margin coefficient at the level standing at +0.01 per hundred points, and that got
written down as a finding — "points that are not progress toward a game do not bring the rubber
closer". It was **+0.01 ± 0.02**, a number whose error bar contained everything; at 3000 rubbers it is
**+0.08 ± 0.01**, in line with every other state. `Fit` carries standard errors now for exactly that
reason, and they are documented as optimistic, since every standing inside one rubber shares that
rubber's outcome and the effective sample is nearer the rubber count than the row count. The real
check is agreement between two sample sizes.

**One thing I had backwards, and the fit corrected it.** I expected the *second* game to be worth more
than the first, and in the transition that is measurable it is not: equalising when they hold one is
+0.170, the same as winning the first from level, and that equality is *forced* by the symmetry of the
two states rather than discovered. The real non-linearity is at the end — one game up to two finishes
the rubber, worth +0.330 from 0.670, and from one game each it is worth +0.500. A constant pricing "a
game" as one number is wrong by a factor of three across those.

Calibration is monotone and close across six bands (predicted 0.20–0.35 won 0.293, 0.65–0.80 won
0.707), though in-sample.

**The objective is built, measured, and shipped as v3 Bobby Orr.** `bidValue.ts` takes an `Objective` — `"points"`
is the existing pricing untouched, `"equity"` returns the change in the chance of taking the rubber —
and `heuristicBot.ts` threads it from `BotTuning`. Against the same bidder pricing in points, with
everything else held identical, the equity objective wins **631 rubbers to 169, 78.9% ± 1.4**, twenty
standard errors from even, and +237 points a rubber as well. For scale, the change that made the
bidder price in points at all was 77.5%.

**Re-fitted under solver card play, which fixed the overreaching and nothing else.** The table was
first fitted from rubbers played with the fast heuristic, where contracts fail more often than they do
in a real game — so v3 learned to stretch in a world where stretching was safe. Re-fitting with the
solver on, 300 rubbers, and measuring against v2 at eight samples a card under identical conditions:

| | shipped table | re-fit |
| --- | --- | --- |
| rubbers won | 65.7% ± 4.0 | **65.0% ± 4.0** |
| down 2+ in its own contracts | 18% of deals | **13%** |
| what those cost | 508 a rubber | **325** |

**A third fewer disasters for the same result.** The prediction was half right and the half that
failed is worth recording: those contracts were costing points without costing games, so the win rate
did not move. `gameLead` fell 0.71 to 0.61 as expected; `level.part` went *negative*, which is not
understood and is flagged in `equity.ts` rather than trusted — that cell has taken four values across
four fits because it overlaps with the margin term.

The anchor stays at 1250, since the win rate against v2 did not change. Kept as a correction to v3
rather than a v4: with the records disposable there is no accumulated history for a version to
protect, and a permanent near-empty rung costs more than it buys. **The threshold worth stating: a
release with almost no recorded games can be corrected in place; one with a real history cannot,
because the history is the thing a version exists to protect.**

**But that number is measured under heuristic card play, and it does not survive the sampler
intact.** With eight-sample solver card play on both sides it wins 92 rubbers to 48 — 65.7% ± 4.0,
still 3.9 standard errors from even — while the points margin turns *negative* at -235 ± 128, which is
not significant but is the opposite sign. Its overreach roughly doubles, down two or more in 18% of
its own contracts against 11%, costing 508 a rubber, and rubbers stretch from 7.8 deals to 10.9.

The reading: the table learned what a standing is worth in a world where contracts fail more often
than they do under real card play, so v3 stretches too far. It is still the better bidder by the metric
it optimises, which is why it ships — but the gap narrows at every step toward better card play, and
the shipped strength is sixty samples, which is further along that road than anything measured here.
**Anything quoting 78.9% as v3's strength is quoting the heuristic-card-play number.** The rating
anchor uses the sampler one.

**The table is an opponent model, not a fixed point, and iterating the fit made it worse.** The
shipped numbers come from rubbers played by the *points* bidder. Refitting from rubbers the *equity*
bidder played moves them a long way — `gameLead` 0.71 to 0.20, the part-score term at level to
nothing — which reads like the circularity warning coming true. It is not: installing the refit drops
the bidder to **66.6% from 78.9%** and turns the points margin negative. What a standing is worth
depends on who is opposite, and a table fitted where both sides fight equally hard for games describes
a world this bidder is not in. So the open question is not convergence, it is **which population to
fit against** — and the answer is neither bot. The 293 recorded deals in the hand log are the
population that matters and nothing has fitted against them yet.

**`bench/rubber.ts` leads on rubbers won now, and that had to land in the same change.** A bidder
maximising the chance of taking the rubber will trade points for wins, so a bench headlined on points
per rubber would report exactly that as a regression. Predicted in advance this time rather than
discovered afterwards.

**And the control run found a real fault in that bench.** The same bidder against an exact copy of
itself must be 50%, and with the oracle doubler on it came out **61.8% ± 2.0 to the challenger, six
standard errors** — two identical bidders, one of them winning. With `nodouble` it is exactly **300 to
300 and a margin of exactly zero**, so the harness itself is sound and the asymmetry is entirely the
oracle. The cause: `oracleDouble` doubles off *double-dummy par*, and with `samples=0` the cards are
then played by a heuristic bot that cannot realise par, so contracts that are "down two" get made and
the double pays declarer. **Applying the oracle to a seat costs that seat about twelve points of win
rate.** It was added to make the reference able to hurt the challenger and it does the opposite under
heuristic card play. Every margin recorded against the oracle default at `samples=0` is affected;
`nodouble` is the symmetric harness and the equity result above was measured on it. Whether the oracle
is sound with a sample count is untested.

**Fitting the equity table against the recorded human deals was tried, and there is not enough of
it.** `bench/equity.ts hands=<path>` rebuilds rubbers out of the hand log — sort by when they were
played, start at an untouched standing, fold each deal in with the engine, close the rubber when that
completes it — and the chain is *checked* rather than trusted, since a run of deals that merely looks
continuous is how a table would get fitted against standings that never happened. Of 29 candidate
rubbers in 238 logged deals, **11 chain cleanly and 18 are dropped**, which gives 184 rows. Three of
the four games states have too few rows to fit at all, and the one that does returns a part-score
coefficient of **-5.31 ± 2.31** — the wrong sign, with an error bar containing everything.

The reason is structural rather than bad luck: **the table is indexed by rubber outcomes, and 293
deals is a large number of deals and a tiny number of rubbers.** Self-play needs 3000 rubbers to pin
these coefficients; the recorded games have eleven.

The fit does need one thing self-play does not, and it is worth keeping for whenever there is enough
data: a **strength term**, +1 for the person's row and -1 for the computer's, antisymmetric like
everything else so the two seats' chances still sum to one. Between two copies of one bidder a standing
is all there is to explain the result. Between a person winning 24 rubbers in 27 and a bot, most of the
result is *who is playing*, and a table without that term reads the skill gap into the value of a
part-score — which is exactly what the -5.31 is. It fits at **+3.63 ± 0.86** log-odds, the only number
in that run with a sign worth believing.

So the table stays fitted from points-bidder self-play, and the honest description of it is in
`equity.ts`: it is an opponent model of *the points bidder*, which is a real limitation and not one
this log can currently remove.

**Shipping v3 took four pieces, and one of them was the mistake this file already warned about.**
`release.ts` is a registry of two entries now, each carrying the `tuning` that makes it itself — which
is what finally justified that field. `identity.ts` gains `preferredRelease`, read once per match in
`localSession.ts` for the same reason the format is, and the chosen version travels on every record
and hand log the match produces. Settings gains a **Which computer you play** row.

That row went in next to "How boldly it bids" first, which is *inside the playtester block* — the
exact mistake the trick-count toggle made, in the same file, for the same reason: the neighbouring
rows happened to be there. `test/settingsRows.test.ts` failed on it, which is what that test is for.
It sits with Match length now, because choosing the opponent is a decision taken before sitting down,
and it is on the list of rows everyone must be able to reach. **A superseded release is the best
difficulty lever here** — turning the sampler down makes an opponent that is unsure, where an older
release is one that was once the best there was.

**Both releases are pinned, and a release with no transcripts fails the test.** `botRelease.test.ts`
loops the registry rather than naming v2, so adding a version without recording what it does is a
failure rather than an omission. v3's transcripts are visibly different — 4H where v2 said 3H, and a
5C sacrifice over 4S.

**The rating anchor goes on the server before the client that plays it.** `botRating` falls back to
the unversioned rating for a version it does not recognise, so a client deployed first would have
every v3 match rated as beating the weakest bot in the table and quietly inflate everybody. v3 sits at
1300, from the sampler measurement rather than the heuristic one, and `ratings.ts` says why.

**Two tests in this change were vacuous first, and both were caught by reverting the fix rather than
by reading them.** The record-freshness one is above. The other was `creditIn`, the one constant that
has to exist in both currencies: the first version drove the whole bidder over sixty deals and passed
with the conversion removed *altogether*, because `honestlyWeak` only lets the credit apply to a hand
whose honest bidding stops at the one level, and under the equity objective that is rare. It tests the
function directly now, which is why `creditIn` is exported at all.

**v3 was only v3 in the long format for a while, and the short format now has its own fit.** The
equity table is over rubbers, so a one-game match originally fell back to the points objective — which
meant somebody playing single games got v2's bidder recorded and *rated* as v3, and `ratings.ts` pools
the formats. The fix is `bench/equity.ts format=game`: a short match has exactly one standing to be in,
since winning a game is winning the match, so nobody is ever a game up and nobody is ever vulnerable,
and the whole table for it is two coefficients.

**Borrowing the rubber's numbers would have been inventing them, and the fit says so.** A part-score is
worth **+0.95 ± 0.04** in a single game against **+0.35** at the same nothing-to-nothing standing in a
rubber — nearly three times — because here it is progress toward the whole match rather than toward the
first of three. It lands close to the rubber's one-game-each cell (+0.92), which is the same fact from
the other side: what makes a part-score valuable is how near it is to deciding things. `equityApplies`
is gone and `bidValue.ts` has no format branch left.

`bench/rubber.ts` takes flags after the counts: `nodouble` restores the old
five-level-only reference, `equity=N` sets what the challenger prices a game at, and
`vs=N` replaces the reference with **this same bidder** at a different trust weight.
`releases=3:2` plays one release against another, challenger first, reading both
tunings out of the registry — **prefer that to `objective=equity`**, which compares
one pricing against another and only happens to name v3 against v2 for as long as
that is the only thing separating them. `format=duplicate` plays sessions, `control`
puts the challenger's exact tuning on both seats, and `memory` gives the challenger a
board's pairs on its replay (`memory=both` gives them to both, which is a symmetry
check rather than a measurement — see below). **`memory` needs a sample count to do
anything**, since it only reaches the game through the sampler and the bid search;
run at `0` samples with no search it is two identical bots, and the recognition census
in the read-out is there to say so.

**Release-versus-release is what makes releases comparable, and it is the reason they
do not need freezing.** Card play is shared, so a fix there moves both sides of any
recorded margin — but a margin that can be *re-measured on demand* needs no frozen
artefact. That is the trade this project has taken: v2's behavior may change, and
any number quoted about it is re-derivable rather than preserved. It only works
because superseded releases stay playable, which is what v1 was not.
That last one is not a variant, it is the answer to a question the legacy reference
cannot answer — see "the instrument decided this one" below.

`par` and `head` take minutes and report every 25 deals; `equity` takes about a minute for 1500
rubbers; `rubber`, `calibrate` and `auction` finish in seconds. **Piping any of them through `grep` or `tail` re-buffers stdout and hides the progress
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

**Bidding is measured by `bench/rubber.ts` and by `bench/hands.ts`, and by nothing else.** Every
other bench plays deals at love all, where a bidder has no part-score to protect, no game to stretch
for and nothing to sacrifice against — the change that turned out to be worth 464 points a rubber
looked like a wash by every other bench in the list. `bench/hands.ts` used to be in that group and
is not any more: it scores each logged deal at the standing the deal was actually bid at, which the
log records now.

**That correction is worth stating as a number, because it hid the bot losing.** The same 238
recorded deals read **+6 ± 19 a deal** to the person at love all and **+62 ± 27** at the score they
were played at, while `results` says the account is **24 rubbers to 3** against v2 — about +106 a
deal. A bench reporting a dead heat over a period when the bot lost eight rubbers in nine was not
being unlucky, it was being asked the wrong question.

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
- **There are no house rules and no variants — §1 is the whole game.** There was one, the open
  discard, and it is withdrawn: `REQUIREMENTS.md` §3.6b keeps the record of what it was, why it was
  built and why it went. `DealRules` and `DealState.rules` are gone with it, so a deal is described by
  its seed and its starter and nothing else. Deals in the hand log may still carry
  `rules: { openDiscard: true }`, which means what it says — that deal really was played that way, and
  `bench/hands.ts` keeps them separable rather than pooling them with the game as specified.
- **Rubber scoring, and duplicate as a second format.** A rubber earns vulnerability by winning a
  game; a duplicate session prescribes it by board and pays for a game on the spot. Not Chicago.
  `MatchFormat` is the wide vocabulary and `RubberFormat` is the narrow one the rubber machinery
  keeps, so nothing has to invent a meaning for a rubber that is a duplicate.

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
- **`suitInk.test.ts` is the second blind walker in the repo, and it is blind for the same reason
  `packages/protocol/test/snapshot.test.ts` is.** §1.5 keeps two reds, one per ground, and both are
  red — so a swap is invisible to a person and catchable only by walking the rendered text of a whole
  deal, working out what ground each glyph stands on, and checking the red against it. No component
  is asked anything, so a new screen that names a card is covered without anyone updating this.

  **It passed vacuously twice, and catching that is the reason it counts what it found.** Once
  because it did not know a new wash class was a light ground; once because the auction it drives bid
  clubs, so it never put a red suit on the region under test at all. Both fixes are in it: the walk
  deliberately bids a red strain, and the paper check names classes rather than opacities so the one
  number that tunes them can move without breaking the test. A walker is only as good as what you
  march past it.

  It is also the smaller half of what it once asserted. The rule it was written for — every suit on
  paper, everywhere — is gone; §1.5 has the four mechanisms tried, and why a white spade in prose was
  right all along.

- **The board itself is testable now, and `apps/web/test/support/board.ts` is how.** jsdom plus
  Testing Library, `renderBoard` for a `GameBoard` fed a `GameSession` built exactly as
  `networkSession.ts` builds one, over a `TableState` the test advances as the Durable Object would.
  Files that use it carry `// @vitest-environment jsdom` and use `createElement` rather than JSX,
  since `vitest.config.ts` collects only `*.test.ts` and has no React plugin.

  It exists because "the last card cannot be played" was a report that no headless test could either
  confirm or deny — the rules said the card was legal and the question was whether the screen would
  take it. What it covers now: every card of several consecutive deals, from either seat, by real
  pointer gestures as well as by click, with tap-to-select on and off, and with the seat opposite
  moving before any animation has finished. Use it for anything phrased as "the UI will not let me",
  and reach for the real `wrangler dev` above for anything phrased as "nothing happens".

  Two things it deliberately does *not* model, so do not read a pass as covering them: React
  `StrictMode`, which the real app runs under and which diverges enough in this harness to be
  misleading, and the local session's bot, whose solver makes a whole rubber too slow to drive.

## Working agreements

- Discuss design decisions conversationally, one at a time, in prose — not as multiple-choice.

## Status

**Done.** The rules engine: draw phase, auction, trick play, deal and rubber scoring, and the
player-view projection. Fully playable headlessly.

**Done, deliberately rough.** `apps/web` plays a full rubber against a bot that picks uniformly at
random from the legal actions — draw phase, auction, 13 tricks, deal scoring, part-scores and
vulnerability carried deal to deal, rubber bonus, new rubber, and a scorepad showing every deal of
the rubber. The play screen is plain on purpose. 208 tests across the four workspaces, typecheck
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

**`useShownPhase` decides during render, and the reason is worth keeping.** It holds the outgoing
phase so the last thing that happened in one gets the same ending as everything before it, and it
used to set that hold in a layout effect. A layout effect runs before *paint*, which is what it was
chosen for — but after *commit*, and that is a real difference: for one committed render the hook
reported the phase the engine had reached rather than the one still on screen. Nobody saw it. Every
passive effect reading it did, and the victory horn was keyed on exactly that — it sounded once on a
"complete" that was never a screen, and again when the screen arrived. **A phase that has to be held
is a pure function of the transition, so it belongs in the render, not in an effect after it.** The
same change fixes it in the other direction too: a stale `held` was a frame of the last phase at the
start of the next one.

The horn is also armed once per *match* rather than on the rising edge of that screen, which is
belt-and-braces on purpose: a final score can be reached, left and reached again — a remount, an
effect either side of the release — without a second match having been won.

**Done, unwired.** `packages/protocol` and `apps/server`. A Worker mints invite codes and routes
a socket to one Durable Object per table; the object owns the `TableState`, deals the seeds,
validates every action through the engine and sends each seat a `snapshotFor` projection. Sockets
go through the Hibernation API, state is persisted so a rubber survives a deploy, and a token
reclaims a seat after a drop.

**Nothing after `applyTableAction` in `Table#act` may cost the move, and one thing did.** The
achievements write was the only database work in a whole deal, it sat on the one action that
completes one, and it was not wrapped — so a database that was slow, unreachable or a migration
behind would take out exactly the last card of every deal, with the client shown nothing at all,
because the state it was waiting for was never saved and never broadcast. `#recordIfWon` had said
why this is wrong since it was written ("a rubber is a real thing that happened whether or not the
database was reachable"); the rule just had not been applied to the neighbour added later. A failed
run leaves `dealAchievementsApplied` false so a resent action retries — the flag is there to stop
double-counting, not to record an attempt.

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

**Card size is allocated by how badly a mis-tap would hurt — §1.5 — and getting there cost two
reverts of the same mistake.** Both were "draw the opponent's hand at your hand's size", first on the
play screen and then on the draw screen, justified as symmetry and then as "their hand growing is the
subject of that screen". Both shipped and both came back. The rule that replaced the reasoning:
**nothing you cannot touch should compete with something you can.**

Two things worth keeping from it. A change about two hands matching has to cover both screens that
draw two hands — `DrawPhase` keeps its own opponent row rather than sharing `PlayPhase`'s, so grep
`CardBack size` before believing that kind of change is done. And the size jump at the reveal, which
I cited as evidence the rows were inconsistent, is actually what marks the moment their cards stop
being a number and become information; I read a meaningful transition as an accident.

What survived is the hairline on both screens and one spacing rule for every row of cards
(`spreadStep`).

**The hairline itself took three placements, and the test that finally settled it is worth reusing:
read each player's side outward from the middle of the table and compare the two as sequences.** Every
wrong version looked defensible on its own screen — below their whole side, then between their dots
and their label — and the disagreement only showed up written out side by side, where one side read
label/dots/rule/hand and the other did not. Settling it moved their seat label below their hand, so
there is no seat asymmetry left to chase.

**Not started.** The dev control that force-drops the socket, which §3.6 calls the only way to
exercise reconnection deliberately rather than hoping. Nothing persists a rubber across a refresh
in the robot game. And the play screen has one considered thing on it now — the ring below — and
otherwise still none of the polish the draw screen got.

**The play screen counts down the tricks each side needs, and the design took seven passes to get
small.** §1.6 has the rule and the several rejected versions; what belongs here is the engineering.

**The arithmetic is `trickOutlook` in the engine, not in the component** — declarer needs level + 6
and the defender 8 − level, which is a rule, and `scoreDeal` now reads its own requirement from the
same function so the rings and the score cannot disagree. `packages/engine/test/outlook.test.ts`
pins exactly that across every level and every possible trick split, which is the test to keep.

**Both rings hang off the trick slots, in `PlayPhase`, and that is the third placement.** Each sits
eight pixels off its own seat's played card, so which is whose is answered by position and needs no
label or colour. The two rejected placements are in §1.6; the one worth knowing here is that they were
at the right edge of the two hand rows first, in two different files — `PlayPhase` and `GameBoard`'s
footer — which was both harder to change and wrong on screen. A ring changes only when a trick
resolves, and that is exactly the moment nobody is looking at the edges.

They are `absolute` inside `Slot` rather than items in the row, which is what keeps them off
`spreadStep`: in the flow they would be one more thing thirteen cards have to make room for, and §1.5
does not trade the size of the cards you tap for anything.

**Neither ring is keyed on `view.phase`, and a version that was shipped broken.** The engine
completes a deal the instant its thirteenth card lands, so `view.phase === "play"` unmounted both
rings in the same render that would have drawn the check — every deal settled on the last trick, which
is most of them, showed nothing. `PlayPhase` only renders while the *shown* phase is "play", and that
window stays open for the last trick's hold and sweep, so the condition is just "is there a contract".
What ends the rings is the slots unmounting at the reveal.

**The reveal is one event, and the result headline used to jump the queue.** `revealedHands` goes
non-null the instant the thirteenth card lands, and the headline branch was gated on that alone where
the opponent's hand, both slots and the seat label all wait for `swept`. So a headline and its score
columns arrived in a band that had been holding one line, and everything below — the played cards and
the hand under them — visibly shifted down while the last trick was still sitting there. Gated on
`swept` now, so the hands turning face up, the slots clearing and the headline are one moment.

Worth noting what it cost to leave: nothing was *missing* during the hold, since the phase is over and
no lead or claim line is due either, and `min-h-10` already holds the height. The band is simply empty
for a beat, which is what it should have been all along.

**The test that missed it had explicitly skipped it** — it walked until a deal was decided and then
bailed if the deal was over, which is exactly the case. There is now a test for the last trick that
was checked against the bug: restore `view.phase === "play"` and it fails. Note it has to settle
*inside* the hold, since a full `settle` runs the sweep and the reveal that follows removes the rings.

**Both rings are computed in one expression rather than two.** They were two
expressions in two files briefly, and the divergence that caused is worth keeping: this seat's read
the *shown* phase, which stays "play" through the last-trick hold and the reveal, so it outlived
theirs and the two sides of the table disagreed about whether the deal was still being counted. One
expression for the pair is the fix, not a matching pair of conditions.

**A preference in the "Testing only" panel is unreachable, and this happened.** The trick-count
toggle shipped inside the `playtester` block, which is gated on an account flag — so the only people
who could switch it off were the ones who had volunteered for unfinished behavior. §3.6 has always
said what that panel is for; the mistake was putting an ordinary matter of taste in it because that
is where the neighbouring rows happened to be. `test/settingsRows.test.ts` now renders the screen
with the flag off and walks a list of the rows everyone must be able to reach, with the panel's own
heading asserted *absent* so it cannot pass by rendering the gated version.

That test also needed `vitest.config.ts` to carry `define` values for `__APP_VERSION__`,
`__BUILD_ID__` and `__BUILD_TIME__`. They are Vite `define` substitutions rather than real globals,
so any component that prints one throws a bare `ReferenceError` under the runner — which is why no
test had rendered this screen before.

**The ring has one live colour, and two escalating ramps were built and deleted to get there.**
White resting with amber at the edge, then amber resting with orange one trick out and white at the
edge itself. Both were a colour on one ring restating what the *other* ring was already saying in
tricks, and tricks are the clearer channel — so `TrickOutlook` lost a `jeopardy` state, a `tight`
state and the `slack` field they were cut from on the way back out. **If a third ramp gets proposed,
this is the argument against it**: with both seats' counts on screen, "you are in trouble" is already
drawn.

**Only one ring ever wears the check**, because a seat being out of reach and its opponent arriving
are the same event: the targets sum to fourteen against thirteen tricks. It is green on either ring —
it marks that side reaching its own target, the same mark for a contract made and a contract set —
which is why `TrickRing` does not know whose ring it is at all. `trickRingLabel` still takes `mine`,
because a sentence has to name somebody where a shape does not.

**The outcome sound moved from scoring to the deciding trick, and that gave the verdict two possible
sources.** So it is a latch, not a rising edge — whichever of the deciding trick and the score
arrives first is the announcement and the other is silent. This file has now recorded the same
double-announcement bug three times (the fog horn, the unlock chime, and this), which is why
`test/trickRing.test.ts` asserts the count rather than merely that it fired. It also stopped being a
fact about the *contract*: it used to be handed `score.detail.made`, so a defender who had just
broken a contract heard the triumphant chime for it.

**The bot is versioned, from v1 Angela James; v3 Bobby Orr is current.** `bot/release.ts` holds a *registry*
of the releases a person can sit down against, with `LATEST_RELEASE` derived from the end of it; versions are numbered from
one and named alphabetically after hockey players, so a list of them reads in the order they
existed — Angela James, Bobby Hull, Bobby Orr, Doug Harvey, Eddie Shore, Frank Mahovlich,
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

**A superseded release stays playable, and it is pinned by a test rather than by a copy.** The reason is a cost
already paid: v1's code is gone, so `bench/rubber.ts` cannot play it and the 200-point gap between the v1 and v2
rating anchors rests on a measurement nobody can repeat. Keeping a superseded release playable makes the gap to
its successor measurable on demand instead of historical. v1 is therefore *not* in the registry — it is still a
rating anchor on the server, since rubbers were recorded against it, but it cannot be played and listing it
would offer a choice that does not exist.

Freezing a release's *tuning* would not preserve it. The bot calls the shared engine, the solver and
`evaluate.ts`'s calibration, so a refit or a scoring change alters how an old release plays while it goes on
claiming to be that release — a label that lies, which is worse than not keeping it. So
`test/botRelease.test.ts` pins what it *does*: eight seeded deals, both seats' draw choices and every call, at
love all and at a part-score and a game to either side. Any change to those transcripts is a change of opponent
— either the version needs bumping or the change was not meant to reach that release. Checked against a real
drift on the way in: moving `DEFAULT_GAME_EQUITY` by 100 fails it.

**What the transcripts cannot pin is the bidder people actually play, and that is structural.** The
bid search lives on the difficulty rung rather than on the release, and the default rung turns it on —
so the shipped bidder searches and the pinned transcripts do not. Moving the setting would not fix it:
the search is an *anytime* one bounded by wall-clock time, so it returns whatever it managed on that
machine at that moment, and a deadline-bounded search is structurally unpinnable. Pinning it by sample
count instead would pin something nobody plays. So the guarantee is narrower than it looks — the
transcripts pin a release's *own* bidding, the objective and estimates and disguise that distinguish
one release from another, while how hard that bidder may think is the rung's business, measured rather
than pinned, and worth about 108 rating points.

Deliberately the auction and the draw and not the card play. Those are what a bidding change moves, they are
decided by the heuristic bot with no solver in the loop, and they run in 60ms — where `strength: "strong"` is 60
samples a card and would make a pinned deal too slow to keep in `npm test`.

**What a release covers is its bidding and its draw, not its card play — and that is now a decision
rather than an accident.** `sample.ts` and `solver.ts` have no per-release tuning, so a fix there
changes every release at once. That happened the day `KEEP_STRENGTH` corrected a sampler which had
been imagining an opponent five high-card points too weak, and `test/botRelease.test.ts` did not
notice, because it pins only the auction and the draw.

Scoping it would be cheap — `BotTuning` already carries per-release values, so it is about twenty
lines across four call sites — and it was chosen against on the grounds that one person is playing and
the records are disposable. **The thing given up is worth naming: a superseded release is most useful
as a fixed reference, and a reference whose value is being unchanged is exactly what this trades
away.** So a cross-release margin measured before a card-play change cannot be quoted after one — v3
beating v2 65.7% of rubbers is history rather than a fact about the pair, and the way to have it again
is to re-run the bench, which is possible only because both releases are still playable. Reverse this
if more than one person plays, or if a release has to stay comparable across a change nobody wants to
re-measure.

**There is no per-release tuning field yet, and that is deliberate.** Two releases that differ have somewhere to
say so — `BotTuning`, which `createHeuristicBot` already takes — and one release has nothing to say. A field
with exactly one possible value is not yet a field, for the same reason a knob whose effect on behavior has
never been observed is not yet a knob. It lands with the release that needs it, and so does the Settings row
that picks between them: a picker offering one choice is not a choice.

**Found on a real device, and fixed.** A sign-in link cannot reach an installed PWA on iOS. The
home-screen app has its own storage, Mail opens links in Safari, and a link works once — so tapping
it signs Safari in, leaves the app untouched, and burns the credential. Sign-in is therefore a
**typed code** now, with the link demoted to a convenience and omitted entirely when the request
comes from a standalone app. The code is six characters of the invite alphabet, looked up by
address *and* code, with five attempts before the outstanding codes for that address are burned.

The general lesson is worth more than the bug: anything that leaves the app and comes back cannot
be assumed to come back to the same app, and desktop Chrome will insist that it does.

**Help now has a scoring page, and it exists against an argument that was right.** `HelpOverlay`
deliberately said nothing about scoring, on the grounds that a scoring table written out by hand is
a second account of the rules with no way to stay honest as the first one changes — "the one kind of
help worth less than none". That objection is not waved away, it is **answered**: every figure on
the page is asked of the engine's own scoring functions through `game/scoringFacts.ts`, so nothing
is typed out. 3NT, 4♥ and 5♣ are *searched* for as the cheapest level reaching `GAME_THRESHOLD`
rather than stated; the doubled penalties come from `undertrickPoints`; honors come from
`honorsFor` handed a constructed holding. `GAME_THRESHOLD`, `GAME_BONUS` and `matchBonusFor` were
exported from the engine for exactly this and nothing else.

**`test/scoringPage.test.ts` is what makes the page allowed to exist**, and it computes its
expectations from `@hb/engine` directly rather than from `scoringFacts.ts` — comparing the page
against the module feeding it would pass whatever either said. Checked against a real drift on the
way in: hardcoding one figure in the table fails it.

**Its own destination rather than a section, for two reasons that are not about length.** The help
screen states at the top that it assumes you play bridge and covers only the differences — and
scoring is the first thing in this app written for somebody who does not. And it is what a person
opens *during* an auction, which is not a moment for scrolling past four collapsed headings.

**The one opinion on it is the last block, and the trap it avoids is worth recording.** The obvious
beginner rule — "bid what you are sure you can make" — is literally `simpleBidder`, which is what
Kitchen plays and what measured **−464 points a rubber** against pricing contracts properly. So the
page teaches the *scoring* and lets the consequence follow: the worked example shows eleven tricks
in hearts scoring 90 below and 60 above at 3♥ against 120 and 30 at 4♥, same tricks, and only one of
them a game. Both rows are computed, so if overtricks ever counted below the line the argument would
change with them.

**The tables are real `<table>` markup rather than a grid of spans**, which is the same lesson the
record screen's row test taught from the other side: a test that selects on a padding class breaks
when a second control shares it, where `caption` and `tbody tr` are what the thing actually is.

**There is a walkthrough now, and it covers the draw and nothing else** (`REQUIREMENTS.md` §1.3a).
A four-step spotlight **tour** on the first turn, then two **notes** on the second and third, because
the auction and the play are ordinary bridge while the draw exists nowhere else.

The tour and the notes do different jobs, and it was built as notes alone first, which was wrong: the
notes explain the *rules* while the tour names the *screen*, and roughly half the draw screen carries
no label — the opponent's hand row does not say whose it is, and the turn-track dots say nothing at
all. The counter-argument, that a tour would restate the labels the two cards already have, is true
of those two cards and false of everything else on the board. The notes stay notes because there is
nothing for them to point at: "the card you threw is gone" is a fact about a place that deliberately
does not exist.

Not a scripted deal either — every deal teaches the mechanic identically, and a hand-picked seed is
only needed to teach strategy. Robot game only, since at a table the other seat would be watching
somebody read with no idea why. **What a tour step may describe is decided by what its cutout frames**, which is a real constraint
and caught the dots. The `opponent` step anchors on their row of card backs only, so their turn
track is outside the highlight and the tour says nothing about it — that fact lives on the rules
screen instead, which is where a fact with nothing to point at belongs. The `you` step does take in
the turn track along with the hand, so that is where the dot colours are named. Grep the anchors in
`DrawPhase` before writing copy about a part of the screen.

`walkthrough.ts` holds the copy; `Spotlight` does the cutout with one
element and a 9999px `box-shadow` spread rather than four bands agreeing on a rect. `DrawPhase` keys
the notes off `handSizes[me] + 1`, and a gap in the numbering would mean a walkthrough that never
completes and so restarts every deal — there is a test for that. Done is stored when the *tour*
finishes rather than the last note, so walking it and then leaving does not earn a second tour.

**Achievements have three tiers and for a long time drew them all in one amber.** Bronze, silver and
gold *is* the ranking, and both places that show it — the unlock notification and the Achievements
screen you go to afterwards — rendered a held tier as `bg-amber-200/15 text-amber-100` regardless of
which tier it was. So earning a gold looked exactly like earning a bronze, which is why the
notification did not land as a reward: the one fact it was announcing was the one fact it did not
draw. `--color-tier-*` are the metals, per theme, and `ui/tiers.ts` is the single vocabulary both
screens read so they cannot drift apart again. Warm/cool/warm is deliberate — two warm metals are
hard to separate at badge size, and silver sitting cool between them is what makes three colours read
as a ranking.

The toast is built around the badge rather than as a row, and has one control instead of three. What
was *not* changed, having been argued for and then dropped: an unread mark on Home, moving the
announcement inline into the hands reveal, and reserving ceremony for the rare tiers. All three were
a redesign of the notification's architecture off a complaint about how it looked — and the premise
was wrong anyway. Unlocks are rare (the counter families cross at 50, 250 and 1000; most of the rest
are once-ever), so a modal every few sessions is a moment rather than an interruption.

**An unlock has a sound now, and a way to be looked at without waiting for one.** The cue is four
bells up a major triad with a shimmer over it, and the hard constraint was *not sounding like a made
contract* — that one is a rising three-note triangle chime at 523/659/784 and an unlock lands seconds
after it on the deal that earned it, so two rising chimes in a row would read as one event
stuttering. This starts where that one ends, climbs an octave above it, and is sine rather than
triangle, which reads as a bell where the other reads as a beep. The whole figure is offset a quarter
second so it arrives *after* whatever the deal had to say.

It fires on the rising edge of `justUnlocked`, not on "is non-empty" — the list accumulates, and over
a network the server pushes deal unlocks and rubber unlocks as separate messages, both of which can
land before anybody taps the notification away. That is one announcement. `test/unlockSound.test.ts`
pins it, and it is the same bug shape as the double fog horn, which is why it has a test at all.

**"Preview an unlock" in the testing panel** shows the notification with a bronze, a silver and a
gold at once and plays the cue, because unlocks are far too rare to check by playing — and it is the
only way to compare the three metals side by side. What it does *not* exercise is the detection:
whether a real unlock reaches `justUnlocked` is `useAchievementTracker`'s business against the
computer and the server's at a table, and nothing in the preview stands in for either.

**Every family has its own glyph now, and the trophy stood for all thirteen before.** A Grand Slam
and Hands Played were the same icon on both screens that show one, so the notification announced a
title without saying what kind of thing it was. `FamilyIcon` in `icons.tsx` holds them; the trophy
stays on Home, where it stands for the idea rather than for a family, and on Take the Rubber, which
is the one achievement that actually is a trophy. Played/Won/Lost share a base — the same three cards
with a chevron up, down, or absent — because they *are* one family of three and played is the
superset. All thirteen are built from rectangles, straight lines and simple polygons rather than
fitted curves: at badge size a bezier suit pip is a smudge, and a shape assembled from primitives is
one whose result can be predicted from reading the source, which matters when there are thirteen of
them and no way to see them from here.

**Resetting achievements is a checkbox on the record reset, not a button of its own.** The argument
for taking them automatically is real and is about the *counters*: Hands Played is a running tally of
exactly the matches being deleted, so leaving it behind leaves a count of 257 outliving the 257 hands
it counted. The argument against is about everything else — a record is relative and ongoing, so
clearing it is a fresh start against the people you play, while a collection of titles has no fresh
start and a new season is no reason to give up a Grand Slam made in March. Two different wishes, so
the caller says which; off by default, since it is the less destructive reading.

Server-side it is `{ achievements: boolean }` on `POST /api/results/reset`, and **absent means no** —
which is both the safe reading of a body the route did not used to take and what an older client
still in circulation via the service worker gets. Deletes are scoped to the verified account and
nothing else can reach them: there is no admin path, and the three branches (off, on, no body at all)
were each checked against real local D1 rather than read.

**A held tier implies every tier below it, and nothing used to say so.** Each tier was awarded from
the single highest threshold a deal reached, so setting a contract by seven awarded the Axe in gold and
never in silver or bronze — the screen showed a gold badge above two locked rows, and the only way to
fill them in was to set another contract by exactly five. Reported from real play, and it reads as
broken because it is: the tiers are a ladder.

`withImpliedTiers` in the engine is the rule, and it is a rule rather than a table of exceptions
because every tiered family here is a ladder — a redouble cannot happen without a double, a grand slam
takes the twelve tricks a small one needed, a thousand hands contains fifty. A family whose tiers are
genuinely not a ladder would have to opt out and would owe an explanation.

**Applied on read as well as on write, which is what repairs the accounts that already hold a bare
gold.** No migration: the stored rows stay short and the answer comes out right anyway, which is the
same reasoning `ratings.ts` recomputes ratings for. It is idempotent, and it is applied where the badge
list *enters* the client as well as on the server's way out, so a phone running an older bundle against
a new server — or the reverse — still draws the ladder correctly.

**`REQUIREMENTS.md` has no section on achievements at all** — the feature was built without one, so
what each family is for and why it exists lives only in `labels.ts`. Worth writing before the next
change to them, since the code is currently its own source of truth here.

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

**The sampler imagined an opponent five points too weak, for as long as it has existed.** The unknown
cards are not exchangeable. Twenty-six cards are dead in this game — their discards and the undrawn
stock — so the pool `sampleOpponentHand` draws from holds thirteen the opponent *kept* and thirteen
they *threw away*, and they were choosing. Measured over 300 deals: they hold **15.4** high-card
points, a uniform sample guesses **9.9**, and their discards average 4.5. Nine-nine is almost exactly
half of the twenty points they saw, which is what a coin flip per card produces.

`KEEP_STRENGTH` corrects it — one knob, weighting the draw by rank, fitted against that observable
rather than reasoned about. Paired against the uniform sampler on the same 398 deals:

| tricks thrown away per deal | uniform | fixed | |
| --- | --- | --- | --- |
| as declarer | 0.46 | **0.36** | −22% |
| as defender | 0.44 | **0.35** | −20% |
| total | 0.90 | **0.71** | **−21%** |
| contracts made | 60% | **63%** | par allows 63% |

**A fifth of everything the bot throws away, and it now makes essentially every contract that was
makeable.** It also fixed the bidder's search, which was *worse* than counting until this landed —
mean absolute error against par 1.56 with the biased sampler, 1.14 with it fixed.

**The prediction that failed is the useful part.** I expected the gain to fall on *defence*, since that
is where the bot does most of its guessing about the missing hand, and it came out even — 22% declaring
against 20% defending. Imagining a weaker opponent does not specifically damage defence; it damages
every decision that depends on where the missing cards are, and declarer choosing a line is the same
mistake as defender choosing a card.

**The constant corrects the average and leaves the per-deal error alone, and `drawTurns` says how to
fix that.** How often a seat kept card 1 is public, and it predicts their strength strongly: over 400
deals both seats, mean points run **11.0 at nought keeps, 14.5 at three, 18.2 at six, 19.8 at seven** —
a slope of **1.09 points per keep**, correlation 0.39. So a global constant fitted to the mean of 15.4
is wrong by around four points at each end. `bench/keepsignal.ts` is that measurement.

The mechanism that gets it for free is to **simulate the draw** rather than weight by rank: the
twenty-six unknown cards are exactly the twenty-six the opponent was offered, so shuffling them into
thirteen pairs and running a draw policy over them produces a hand that is selected the way theirs was
— and conditioning on the recorded keep-or-reject choices makes it selected *by the same amount*. A
hand built from turns where they chose the card is strong; one built from sight-unseen takes is close
to random. That replaces a fitted knob with a mechanism, which is the pattern that has won every time
here, and `0.71` is now the number it has to beat. The wrinkle: mid-deal the simulation has to produce
a hand containing the cards they have already played, which means constraining the draw rather than
rejecting afterwards — so it is clean for bidding, where nothing has been played, and needs work for
card play.

**Replaying the opponent's draw beats weighting for it, and the reason is not the one I claimed.**
`drawSimulation.ts` builds the guessed hand by replaying the draw they actually had. Two facts make it
possible and both are peculiar to this game: each seat's thirteen turns consume twenty-six cards, so
the cards this seat cannot place are *exactly* the twenty-six the opponent was offered; and
`drawTurns` records publicly whether they kept the card they were shown or took the unseen one.

**It is shape, not points.** Over 300 deals, both seats:

| | real hands | replayed draw | `KEEP_STRENGTH` alone |
| --- | --- | --- | --- |
| longest suit | 5.64 | **5.65** | 4.90 |
| voids | 0.10 | **0.10** | 0.05 |

The rank weight gets the points right and the distribution wrong — hands three quarters of a suit
flatter than real ones and half the voids — because a hand assembled by a draw policy is a hand that
was *building suits*. That is why it improved the searched trick estimate where the point count showed
nothing: mean absolute error against par went 1.14 to **1.04** and r² 0.659 to **0.699**, against a
counted estimate's 1.54 and 0.434.

**Two corrections to what I first wrote, both found by testing a result that already looked good.**

The claim that this reproduced the keep-count spread — 11 points at no keeps to 20 at seven — was a
**confound**. A pool rich in honours *causes* more keeps, so keep count tracks pool strength and any
honour-weighted draw tracks it too; with the simulation switched off, `KEEP_STRENGTH` alone reproduces
that table nearly as well (10.9, 14.2, 17.3, 18.6 against 10.8, 14.6, 18.1, 18.9). The mechanism is
better, but not for the reason given.

**The choice conditioning was broken and is now fixed, and fixing it bought nothing measurable.** The
reject branch forced the shown card to be one the policy declines and then handed the *other* card
over — but "the other one, given this was unkeepable" is conditionally *good*, where card two was
taken sight-unseen and should be plainly random. Thirteen keeps and thirteen rejects came out at 15.70
and 15.81 points, indistinguishable, and a test asserting a gap is what found it. The two cards a turn
offers are independent draws and the choice speaks only about the first, so the shown card is now drawn
from the cards consistent with it and the other from whatever is left. The gap went **-0.12 to +1.20**,
points stayed right at 15.60 against 15.42, shape stayed exact at 5.64.

**And the trick estimate did not move: 1.07 against 1.04, which is inside the noise on 400 cases.**
Kept anyway, on two grounds. It is correct rather than accidentally compensating — and there is a real
possibility the old version was cancelling one bias with another, since an opponent handed
conditionally-good cards is a *stronger* opponent, which offsets the solver assuming everybody plays
perfectly. A pair of errors that happen to cancel on today's metric is not a foundation for the bidder.

**Cost per sample is part of sample quality, which I had been treating as separate.** The corrected
branch asks "would this hand keep that card" of every card in the pool on all thirteen turns, and
`chooseTake` recomputes the value of an unknown card *per candidate* — a fresh deck and forty
valuations — when it depends only on the hand. That was **55ms a sample**, which cut the bid search
from 11.7 samples inside its deadline to 4.6 and turned a better sampler into a worse estimate.
`keepTest` computes the threshold once and returns a predicate; samples recovered to 9.2.

Also not done: this only runs where the draw can be replayed, which means before the opponent has
played a card — so it helps bidding and does nothing for card play beyond the opening lead. Mid-deal it
would have to *guarantee* the cards they have already shown end up in the hand, which means
constraining the draw rather than rejecting afterwards.

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

**A rubber somebody played must not depend on the network at the moment it ended, and for a long
time it did.** A robot rubber went missing, and the cause was structural rather than a bug on the
winner path: four reporters — `reportRobotRubber`, both achievement reports and `reportHandLog` —
were each a single fire-and-forget `fetch` inside `try {} catch {}`. Two ways to lose a game:

- **A dropped connection lost it silently and permanently.** No retry, nothing on disk, and no
  `keepalive`, so a request still in flight when the page went away was simply cancelled. The end of
  a rubber is exactly when somebody puts the phone down.
- **A refused body lost it just as silently.** None of the four looked at `response.ok`, so a 400
  and a 201 were indistinguishable. A record could vanish with the network working perfectly.

`game/outbox.ts` replaces all four. The report is written to `localStorage` *before* the request, so
the worst case is late rather than never; it is removed only on a 2xx; and it drains on launch, on
`online`, and on the tab becoming visible again — the last being the one that fires after a phone
suspended the app mid-send. Two rules worth keeping: **a 4xx other than 401/408/429 is permanent**,
because a body the server has read and refused will be refused identically forever, and **`drain`
re-reads the queue each step rather than iterating a snapshot** — a rubber's own result and its
achievements are enqueued a moment apart, so the second used to be invisible to the pass the first
had already started.

**The diagnosis surface is the outbox itself**, which is why the answer to "can we add logging" was
not logging. Settings shows unsent reports in the footer beside the build stamp rather than behind the
playtester flag — the person who needs to read it out is whoever the game went missing for. **An empty
outbox alongside a missing record is a different search**, on the server side, and `wrangler d1
execute --remote` answers that one directly.

**The record read waits for the outbox, and without that it showed yesterday's record.** A rubber's
result is enqueued the moment the match ends and `enqueue` starts a pass immediately, so `useRecords`
asking the server straight afterwards is a race the read usually wins: the report is still in flight,
the answer is the record from before the match, and nothing refetches — which is why it only looked
right after a reload. `reload` now waits on `flush()` before fetching, and so does `useRecentMatches`,
where a game somebody has just played is most obviously missing. `flush` joins a pass already running
rather than starting a second, so the wait is the report's own round trip and nothing at all when the
queue is empty.

**The first fix was worse than the bug and had to be reversed.** Making the read *wait* on `flush()`
did stop the staleness, and it also made the screen depend on a network round trip that has no
timeout: `send` awaits `fetch` with nothing bounding it, so one slow or hanging report held the record
and achievements screens — sometimes for a while, sometimes forever. Reported from real use as "takes
quite a while to display, or never does". **A screen that never appears is a worse failure than a
screen showing yesterday's number.** So the read never depends on the send now: it fetches
immediately, and fetches *again* after the pass, and only when `outboxState()` says something was
waiting — which is the case that needed it, after a match rather than every time the screen opens.

**And a hanging request wedges the outbox for the life of the page.** `flush()` joins the pass already
running rather than starting a second, which is deliberate and right — but a request that never
settles means `running` never clears, so every later flush joins a promise that will never resolve and
nothing is sent again. It showed up as one test leaking into the next and it is a real property, not
test housekeeping. Not fixed: the obvious guard is an `AbortController` timeout, and aborting a request
the server actually received would leave the item queued for a retry that duplicates it, since the
bodies carry no idempotency key. Worth doing deliberately rather than as a side effect.

**The test was vacuous first, and that is the third time in this file.** It asserted the order the two
requests were *issued* in — report-then-read either way, because the send starts synchronously before
the screen asks for anything — so it passed against the bug. It now pins both halves of the contract,
read-at-once and read-again, each checked by reverting the corresponding half.

The first version of that row printed a status only for *refused* reports and told everything else it
would be "filed the next time the app has a connection", which is a guess dressed as an explanation:
a report failing every attempt for some other reason read identically to one waiting out a tunnel.
Every pending report now prints its own line — kind, how long it has been queued, how many tries, and
what happened last. **A CORS failure, a blocked request and a real outage all surface as `offline`
from `fetch`**, so the try count is what separates "just now" from "forty attempts over two days".

**`enqueue` must not be able to throw.** By the time it runs the caller has already marked the rubber
reported, so a throw loses the record with nothing queued *and* nothing shown — the one failure worse
than the bug this file exists to fix. `crypto.randomUUID` needs a secure context and a new enough
browser, so the id falls back to a counter; only uniqueness within one device's queue matters.

**A row of five dim figures is unreadable, and the fix was mostly subtraction.** The record screen's
per-format summary ran "20 matches · 146 deals · 12,430–11,789 pts (+641)" at 12px in 40% white, and
that was four problems rather than one: **"N matches" is won plus lost**, already stated by the
`13–7` directly above it; **the point totals wore a bare `N–N`**, the same shape as the record, so
the eye had to work out which kind of pair it was reading; counts, points and a signed difference
**shared one separator** despite being three kinds of number; and none of it had the contrast of
something meant to be read.

It ended up as **one line per opponent and format**: `name · won–lost · margin`, and nothing else.
Two fuller versions were built on the way — a sentence of middot-separated figures, then four
captioned columns — and the columns read well; they just cost five lines for an opponent who has
played both formats, on a screen that is a list of one or two people. **A standings list is scanned,
not read.** So it holds the two things being compared and hands the rest to the match list below it,
where every individual game already appears with its own points.

Everything dropped was either duplicated or available elsewhere. "N matches" is won plus lost. "Last
played" is what the list's own most-recent-first sort says — `whenPlayed` and its thirteen assertions
went with it, rather than being left behind for a display that no longer exists. The point totals and
the per-deal margin are in the match list. **The per-deal figure is the one worth remembering**,
because it was right on its own terms — a total of +641 means nothing until you know it took 146
deals, the same lesson as everything in `bench/` — and it still lost to the line budget.

**A row opens on a tap, and the history it opens into had to come down with the record.** The panel
carries what the columns cannot: the exact point totals the bar only draws as a proportion, every rate
derived from them, and that opponent's own matches. The captions come back inside it, which is
affordable there and was not on the row — there is one open panel rather than one per opponent, which
is exactly what made a captioned table cost five lines a person.

**It could not be a second request.** `opponentKey` is handed out positionally per response —
`opponent-0`, `opponent-1` — so it is deliberately not an identifier a client can send back; a new
opponent shifts every key after it. `recordsFor` already reads every row to tally, so the matches ride
down on `OpponentRecord.matches`, capped at `MATCHES_PER_OPPONENT`. **The cap is why nothing treats
`matches.length` as the number played** — `won + lost` is that, and the panel says what it is not
showing rather than presenting a partial history as a whole one. It is also empty from a server too
old to send it, which has to read as a record with no history rather than as an error.

One at a time, because a panel breaks the column alignment where it sits and that alignment is the
whole reason the table works. And the row is a real `button` with `aria-expanded`: a decorated `div`
would leave the keyboard and a screen reader with no way to know the panel exists.

**Deals won and lost is not available and should not be added.** `results` records a match winner, a
deal *count* and each side's points; there is no per-deal outcome, so it would need a column blank for
every game already recorded. It is also weaker than the margin beside it: a deal can be passed out
with nobody winning it, and a rubber is settled in points.

**Duplicate is a second format, and a board is a seed rather than a hand.** `packages/engine/src/duplicate.ts`
is the whole of the rules: N boards, each played twice with the starter reversed, scored on the
difference between its two runs. Ordinary duplicate fixes the cards and has different people play
them; this game has no cards to fix, so what gets duplicated is the **stock**.

**Two properties of the reducer make that exact, and both are asserted rather than assumed.** A turn
spends exactly two stock cards and turns alternate unconditionally, so each seat's thirteen offers
are a function of the seed alone and cannot be perturbed by anything either player does — checked by
driving one seed under two opposite policies. And `startDeal` hands the starter the first pair, so
flipping the starter swaps the two streams exactly, which is the seat swap and needs no engine change
at all.

**The test to keep is the control run: two identical players score a dead heat on every board.**
Driven by one policy from both seats, a replay is its own first run with the seats relabelled, so
every margin must be exactly zero. It is the duplicate counterpart of `bench/rubber.ts`'s own control
— one bidder against a copy of itself must be 50% — which is what caught the oracle doubler
handicapping whichever seat it was applied to. A format claiming to cancel the deal has to cancel it
exactly when nothing else separates the players. It is asserted twice, in the engine and again in
`test/match.test.ts`, because the second is the path the app takes and a host that dealt a board
wrong would still pass the first.

**The memory advantage on a replayed board is not closeable, and every dial attacks retrieval rather
than knowledge.** Every deal is played to all thirteen tricks, so both hands are public by the end —
`finishedHandsFor` says so in as many words. So the second half of a session is inherently
memory-advantaged, and the dials only decide how *usable* that is: the board count sets the average
gap, `minGapFor` sets the worst one, and the replay order is a **random permutation** so that
withholding a board's identity means something — under a fixed order the identity is implicit in the
count. Deferring the hands reveal was designed and rejected: it withholds nothing, it is the only
feedback on 26 draw decisions, and it is what makes a replay "I know this one" rather than a blind
repeat. **If memory dominates in play, the length is what to move**, which is why it is a control.

**The length is chosen in deals and the floor scales with it.** A session's length is a *deal* count
because that is the question a player answers — how long is this game — while the engine's unit is the
board, and `boardsForDeals` is the one place the two meet. Every count is even, and that is a rule
rather than a tidy choice: a board is worth the difference between its two runs, so an odd count would
leave one board played once, which is a score with nothing to compare against.

Making it configurable forced one change that is worth more than the control. `MIN_REPLAY_GAP` was a
flat 3, and **a flat floor does not compose with a variable count**: at three boards a floor of three
admits only the identity permutation, so the schedule stops being random at all, and at twelve boards
the same floor lets a board back after three deals when the average is twelve. So it is
`minGapFor(boards)` — a fraction of the average rather than a number of deals. It exists at all because
how many deals it takes to forget a board is the one thing no bench can settle, and the draw's pacing
spent months as a setting for exactly the same reason before it was answered.

**The computer plays duplicate, and it now remembers a board it has played.** `botActionFor` hands the
bot `state.discards[seat]` — *this deal's* discards — and `DealState` is per-deal, so there was nowhere
for a previous board to live and the first version of this section recorded that as a happy accident:
no cross-deal memory, nothing to switch off, and a session's memory advantage entirely the person's.
That was a description of a missing feature rather than a design, and `boardRecall.ts` is the feature.

**What it remembers is the thirteen pairs it was offered, and the reason that is enough is the seat
swap.** A replay hands each seat the *other* stream, so the pairs a seat faced on the first run are
precisely what its opponent faces on the second. `sampleOpponentHand` then takes one card from each of
thirteen pairs instead of any thirteen of twenty-six — **about ten million hands down to 8,192**, and
every one of them a hand they could actually be holding. The mirror is the pleasant half: its memory
says **nothing about its own draw**, because its own stream is the one it has never seen, so knowing
the board structurally cannot let it see card 2 before deciding. That is why `chooseDraw` takes no
memory while `chooseCall` and `choosePlay` do.

**It is not told which board it is on, and that was the decision worth taking slowly.** The host
knows — the whole design is built on a board being a seed — and passing it over is one field. But
being told is not remembering, it is being handed the answer, and working out where you are from the
cards is most of what a person does on a replay. So the memory arrives unlabelled and
`offersFacingOpponent` matches it: every card offered to this seat this deal must belong to the
*other* twenty-six of exactly one remembered board. **Ambiguity reads as not knowing** rather than as
a guess between two, because a wrong pairing makes every sampled hand confidently impossible, which is
worse than sampling without one. The pleasant consequence is that lossy recall then costs the bot
twice — in what it remembers *and* in whether it can tell where it is, which is how a person fails.

**Worth +157 ± 52 points a session, three standard errors**, over 120 sessions of one bidder against an
exact copy of itself with memory the only difference. On sessions won it is 57.7% ± 4.6, only 1.7
standard errors — the same result through a less sensitive statistic, since the winner is the sign of
the margin and throws away its size. **The lever's own census is what made the number believable and
the first run of it was worthless**: it reported *0 of 480 deals recognised*, which reads exactly like
a capability that does not work. The bug was in the observable, not the bot — it asked at the deal's
first action, which is during the draw, when the seat has been offered almost nothing to identify a
board by. Asked at the first call instead it is **50% of deals: every replay, every time.** A census
taken at the wrong moment is the same instrument failure this file keeps recording, moved into the
read-out.

**Perfect recall only, so it lives on the top rung and nowhere else.** `forgetful.ts` hands over no
boards at all — all or nothing, because thirteen exact pairs from a deal played some time ago is a
strictly harder feat than the thirteen cards this seat just threw, and `sampleFromOffers` needs a
complete set anyway, so half a board was already worth nothing. Interpolating would be an invented
constant. So the championship computer knows a board when it meets it again and the club one does not,
which is a difference you could explain to somebody.

**And it un-cancels the deal, which is worth stating against the format's own selling point.** With
memory off, the control is `0 to 0` — *every session a dead heat*, because a replay is its own first
run with the seats relabelled. With both seats remembering it is 54 to 54 across 108 decided sessions
and none drawn. **Memory is the first thing that makes a board's two runs different games**, so
duplication no longer cancels the deal exactly. That is the point of the format having memory content
at all, and it is also a real cost to the thing duplication was for.

Note what that symmetric run does and does not check. Its mean margin is **exactly zero and forced to
be** — in `control` both seats play identically, so exchanging which one is called the challenger
scores the same game from two sides and the margins are exact negatives. It is a configuration check,
not a result. The challenger-only arm is a real measurement precisely because its two runs are
different games.

`test/boardRecall.test.ts` drives a real board and its replay and asserts the property the sampler
lives on: exactly one card of each remembered pair is in the opponent's hand. **Its anti-vacuity half
corrected the claim it was written to make.** I asserted that an unconstrained sampler deals cards the
opponent was never offered, and it does not — 26 turns spend two stock cards each, so the deck is
exactly exhausted and the pool a seat cannot place *already is* the 26 they faced. Nothing impossible
was ever being dealt. What memory buys is the structure inside those 26: they were offered them two at
a time and kept one of each, so a hand holding **both** cards of a pair is impossible, and that is
what the test pins.

**`bidValue.ts` takes a third `Objective`, and it is the format's choice rather than a release's.** A
session has no standing, so the equity table has nothing to look up and the positional credit has
nothing to price — which makes duplicate the *simplest* of the three rather than a special case.
`objectiveFor` is where the two sources meet, as a function, because a single-game match was once
played by one bidder and recorded as another for want of exactly that. One claim was wrong first: the
duplicate objective ignores the **rubber standing**, not vulnerability, which a board prescribes
rather than earns.

**Scoring is points, and `impsFor` is written and unused.** IMPs was the first proposal, on the
grounds that a concave scale stops one doubled disaster deciding a session. What weakened it is that
duplication has *already* cancelled the deal, so a duplicate margin is far better behaved than a
rubber margin to begin with. It cannot be a setting either — a session can be won on points and lost
on IMPs, so offering both is offering two formats, two rating pools and two things for the bidder to
maximise. So it is settled by measurement: a session records its board seeds, its schedule seed and
both runs' scores, so any played session can be re-scored the other way and the two answers compared.
Honors stay in, against duplicate bridge's own practice, because here a hand is built over 26
decisions and four aces is something a player did.

**`game/match.ts` is the abstraction both formats satisfy**, as a tagged union with free functions
rather than a common base — there is no common base. `MatchSummary` is shaped so almost nothing needs
a branch at the call site; only three displays read the union. `SessionPad` is one row a **board**, not
one a deal, since half a board is a score with nothing to compare it to, and **open boards are not
listed at all** because a first run's score alone invites being read as a result.

**What is being played moved from Settings to Home, and the test is not when a setting is read.** All
of them are read once, when a match starts — the useful question is **how often the answer changes**.
The format changes session to session; how hard it plays, which computer and the two dials beside them
are set once and left for months, so they stay put and keep their "takes effect on the next match"
caveat, which is fair for something touched twice a year. Moved rather than copied: a preference in
two places can disagree with itself. `test/homeFormat.test.ts` holds it there, because
`settingsRows.test.ts` structurally cannot — its list is of rows everyone must be able to *reach*, and
a format row in either place satisfies it.

**Duplicate results are recorded and deliberately excluded from the rating walk.** Not because they
could not be rated — the computer plays them — but because **the anchor cannot come from a bench**. A
bench plays bot against bot, where *neither* side has cross-deal memory, and a person does; so a bench
measurement describes a game nobody is playing and errs by over-crediting the player, which is the
mistake nobody notices. The bench can give the spread between releases and rungs, since both sides
there are equally memoryless; the single invented number waits for played sessions. Rating a session
against the *rubber* anchor meanwhile would be worse than not rating it.

**Vulnerability was assigned to a player rather than to a position, and the doc comment said it was
not.** `vulnerableFor` read `board.starter` — a fixed seat — so the *same person* was vulnerable on
both runs of a board; and since the replay hands them the second draw, the vulnerable seat sat in a
different position each time and boards on the vulnerable rungs never cancelled. It takes the run now
and resolves against whoever draws first on it.

**What let it survive is worth more than the bug: the control run was passing vacuously.** The plain
driver takes the first legal action, which passes most deals out — and a passed-out deal scores
nothing whether anybody is vulnerable or not, so the control never exercised the thing that was
broken. A second control driven by a policy that *bids* found it immediately, at 800 points on a
three-board session that had to be flat. The old unit test missed it for a related reason: it faked
the mirror by swapping the board's own `starter` instead of asking for the replay, so it tested a
hypothetical rather than the call the game makes. **A control only tests what its driver exercises**,
and this file has now recorded four vacuous tests found by reverting the fix rather than by reading
them.

**The score runs now rather than waiting for a board to close.** It totalled closed boards only,
which on a short session left it at nil for most of the way. Summing every deal played agrees with
summing the boards once they are all shut — a board's margin *is* the sum of its two runs read from
one seat — so nothing about the final answer changed, only whether the figure moves while you play
it. It is also the honest reading of what a session is: one signed score a deal, and the total is
their sum.

**Two bugs worth recording, both found by reasoning rather than by playing.** "New session" is wired to
the same call that advances the schedule, and a finished session has none left — so it appended its
last result again, growing a third run onto the last board while `complete` stayed true. Chasing that
found a second in `summarizeDuplicate`, which folded the deal on the table in whenever it was complete:
right everywhere except at the end, where the last deal is committed and then *left* on the table. A
rubber has no equivalent state, because dealing always hands it a fresh deal. The invariant is exact —
`results[i]` describes `schedule[i]`, so "already committed" is `results.length > at`.

**`REQUIREMENTS.md` §1.8 is the rules and §3.6a is where the choice lives**, so the format is
documented where every other rule is rather than only in a working note. The help screen has a
Duplicate section of its own — a format that changes what a deal is *for* is not a rule under
Scoring, and a rubber player can skip a whole heading. And the scoring page's duplicate figures come
from `duplicateBonuses` and `scoreDuplicateDeal` through `scoringFacts.ts`, on the same terms as
every other figure there: `test/scoringPage.test.ts` compares them against the engine directly,
never against the module feeding the page. One figure is stated in words instead — a failed contract
pays "no bonus at all" rather than "0", which reads as English and is guarded by the test asserting
the engine really does return zero.

**A drawn match is a third outcome now, and reading it as a loss was the wrong answer twice.**
`results.winner` is `NOT NULL` and held a seat, so `winner === seat` came out false for *both*
players on a level match — and before that, a drawn match was not recorded at all. Duplicate is what
forced it: a board is flat whenever both of its runs come to the same score, so a short session is
genuinely level a fair fraction of the time, and a match somebody played going missing is the failure
`outbox.ts` exists to prevent. A rubber can tie on exactly equal totals too, and that was silently
unrecorded.

`DRAWN` is a **negative sentinel in the existing column** rather than a migration — the column can
already hold it, and negative keeps it out of the range a seat can take. `outcomeOf` is its own
function because the comparison was wrong inline at four call sites, and a rule about hidden state
should have one testable answer. `drawn` rides on the report as an optional additive field, since
every build the service worker keeps in circulation sends `won` alone.

**And the rating line had to be suppressed for a session, which would otherwise have been a lie on
screen.** Duplicate results are recorded and left out of the rating walk, so the server will never
move the rating for one — a client showing `1361 → 1384` would be inventing a number that never
arrives. Null rather than a guess, for the same reason `botAnchor` returns null: nobody checks a
figure that looks right.

**A table plays duplicate now, and the negotiation rule is a second rule rather than the existing
one widened.** `formatFor` used to answer one question — the shorter of a rubber and a single game
wins, because being held in a rubber you did not agree to costs an hour and being given a game you
did not ask for costs nothing. Duplicate is not shorter or longer but a **different game**, so that
ordering has nothing to say about it, and the same asymmetry argument points the other way: being
put into a format you have never played is worse than getting the rubber you know. **So duplicate
takes both seats**, and a seat that asked for one and did not get it falls back to a rubber rather
than being allowed to impose a single game it never asked for. Between two seats that both want
duplicate, the shorter session wins for the original reason.

**The stored match is read through a migration rather than migrated.** A Durable Object held a bare
`TableState` under the key `table`, and `matchFrom` wraps that as a rubber on read — so a sitting
already under way survives the deploy that introduced this. The old shape stays in storage until the
next save. Same reasoning as `withImpliedTiers` repairing a stored achievement on read: a rubber
somebody is in the middle of is not worth a migration to lose.

**Verified against a real `wrangler dev`, which is the only thing that could say it works.** Two
sockets, both seats asking for duplicate, a whole two-board session played out: format `duplicate`,
four deals, complete, standing `duplicate`, boards 2 closed 2 — and **no seed anywhere in the
payload**. The margin came out 0/0, which is the control run over the wire: one policy driving both
seats means every board is flat. The drawn session was recorded with `winner: -1` in real D1, which is
the `DRAWN` path end to end. And the negotiation was checked both ways — two seats asking duplicate
got duplicate, one asking rubber got a rubber.

Two things that setup will cost the next person an hour if they are not written down: `wrangler dev`
needs **`SESSION_SECRET`** passed as well as `DEV_SIGNIN` or every sign-in throws an HMAC error at
`/api/auth/dev`, and the table socket is **`/api/tables/{code}/ws`** rather than `/socket`.

**Duplicate deals are hand-logged now, and what made it possible is the log admitting it has no
rubber.** `HandLogStanding.rubber` is optional and a session simply omits it — which is not a partial
standing but the whole of the one it was bid at, since what a duplicate call is priced against is
vulnerability and nothing else. Sending a fresh rubber instead would have put a standing that never
existed into stored data, and a bench reading it would price a session's call against it.

`HandLog.format` rides along and is **load-bearing rather than a label**: `bench/hands.ts` reads it
through `objectiveFor` to decide what the bidder was pricing in, because a session's call replayed as
a rubber's is a different decision with the same auction in front of it. It joins the configuration
census for the reason the withdrawn house rule did — a session and a rubber are two games, and a
figure pooling them describes neither. `movedFor` scores a duplicate deal with `scoreDuplicateDeal`
rather than folding it into a rubber, since a session settles where it is played.

Absent means a rubber, so **no migration**: a rubber log stores `format` as null and reads back
correctly, and every deal already in the table is untouched.

**Verified by posting both shapes to a real `wrangler dev` and reading them back**, which is worth
doing here specifically: `outbox.ts` treats a 4xx as *permanent*, so a body the server refuses is a
log lost forever rather than retried. Both came back 201, and the stored rows have
`format: "duplicate"` with no rubber and `format: null` with one.

That probe also turned up a local-setup trap worth naming, because the symptom does not point at the
cause: an unapplied migration makes `/api/hands/log` return **500 with an empty-looking error**, not a
clear failure. `npx wrangler d1 migrations apply honeymoon-bridge --local` is the fix, and it needs
re-running whenever a migration lands rather than only once.

**The replay order is a setting, because the three orders are different games rather than three
arrangements of one.** Back to back makes the comparison immediate and recall complete, so the board
turns purely on what each side did with one stock; halves is what a duplicate evening is, and working
out which board you are on is part of it; shuffled has no floor at all, because a floor is what would
stop it being shuffled. `minGapFor` therefore applies to halves alone. Every order still deals each
board exactly twice with the replay after its first run, and **all three cancel between identical
players** — asserted, because that is the property the format exists for.

Agreeing it at a table takes both seats, on the same reasoning duplicate itself does: there is no
"shorter wins" between two different games, and an order nobody asked for is one handed over unasked.
A disagreement falls back to halves.

`scheduleKindOf` reads the order back off a session's own schedule rather than storing it twice, so a
new session inherits how the last one was played with nothing to disagree with itself about.

There was a `DUPLICATE.md` while this was being built, deliberately temporary and deliberately never
cited from here or from `REQUIREMENTS.md`. It is gone: the rules are §1.8, the choice is §3.6a, and
the engineering is above. **A working design document earns its keep only while the design is
unsettled** — kept afterwards it becomes a third account of the rules with nothing keeping it honest,
which is the argument `HelpOverlay` already lost once over the scoring page.

**There is a rating now, and the computer is what makes it mean anything.** `apps/server/src/ratings.ts`
walks every match ever recorded, in order, as Elo. In a family-sized pool that is normally circular —
Elo conserves points, so two people who only play each other trade the same points back and forth and
the number says nothing the head-to-head record did not. **The bots' ratings are pinned rather than
learned**, so the pool has an anchor that never moves and a person's number becomes "how you do against
a fixed standard", which is comparable between two people who have never played each other.

**Recomputed on every read, never stored.** A rating is only comparable if it comes out of the same
pass as everybody else's, and it is sequential, so it cannot be derived from one account's slice.
Recomputing self-heals: a record reset, a retuned anchor or a corrected timestamp all just come out
right next time, where a column would need a migration and a backfill.

**That made `finished_at` load-bearing.** The robot route used to stamp rows on arrival, which was
harmless until the outbox started retrying — a report delivered days late would sort after games played
since and rewrite the history. The client now sends `finishedAt` and the server takes it inside
`REPORT_WINDOW`, falling back to arrival time outside it, since that number is the client's to choose.

**The anchors are asserted, and the recorded games cannot settle them — this is worth reading before
retuning them.** This account is 6–2 against v1 and 21–2 against v2, which taken at face value makes
v2 the *weaker* opponent; the same period is when the person improved, and with one human there is
nothing to separate the two. `bench/rubber.ts` cannot re-measure it either, because a version is a
snapshot of code and v1's is gone. So the 200-point spacing comes from what was measured when the
change landed (775–225 over a thousand rubbers, a 77.5% score, a 215-point gap), and only the absolute
anchor is invented: v2 at 1200 puts this account's real 31-match history at **1514**, which is where a
competent player should sit. Anchoring the bot at 1500 instead would put the whole family above
average, which reads as flattery.

The number shows in two places. The record screen, above the head-to-head table rather than in it,
because it is the only figure there that is not relative to somebody. And in the game, **under each
name in the standing strip and nowhere else**.

**It sat beside the seat labels first, and that was wrong twice over.** The seat labels only carry it on
the play screen, so it was absent through the draw and the auction — most of a deal — and a figure that
comes and goes invites reading its absence as a change. It was also on the wrong thing: a rating belongs
to a *person*, not to the deal being played, so it goes with the name rather than as a row of the
standing, where it would read as another figure the rubber is made of. Stacked under the name rather than run together with it. Inline was
tried — `Computer (1400)` — and clipped to "Comput… (1400)" even after widening the column, because the
combined string is the problem: on its own line neither half comes near the width. **The emphasis is
inverted from what it first was**, and that is the part worth keeping: the name is a column *label*, read
once and then ignored, where the rating is the figure worth looking at, so the name goes quiet and the
rating carries the weight — while staying below the score figures underneath, which are still what the
strip is for.

**And the match-end screen shows what the match was worth** — `Rating 1361 → 1384 (+23)`. That is the
one moment the number means anything: a rating does not move during a rubber, so on the standing strip
it is inert reference data, and half of it is a *pinned* anchor that will never move for anybody. Elo is
a result of matches, and the result is the event.

Computed on the client rather than waited for, and the two agree by construction. Only one piece is a
*choice* — the step, which the provisional period doubles — so the server sends `rating.step` with the
record and the client supplies nothing but Elo's own expectation. The server stays authoritative and the
next fetch confirms it, so the worst case is a number right a few seconds early rather than one that can
drift. Null whenever any part is unknown, since a rating change is a claim about a specific number.

The compact layout carries it too, as `Rated 1361–1400`, since it has no names to hang it on. Leaving it
out was tried and is wrong for one specific reason: **compact is the always-visible score on a short
phone**, so omitting it hides the number from exactly the devices that cannot reach it anywhere else. `knownRatings()` reads the last fetched value out of `localStorage` rather than requesting
one, because the robot game must work with no network at all; a person's rating does not travel with a
seat, so across a table you see only your own.

**The rating line is the one chart in the app, and it earned that.** Everything else here is text,
dots and one bar, and the reason to cross that threshold is that a rating is the only series in this
project that is not noise: it moves by `K × (result − expected)`, so it is bounded, ordered and evenly
spaced *by match*. A per-match points margin is a random walk — one doubled contract swings it
hundreds — and a line through that would be fiction. Plotted against matches, not time: a rating
changes only when you play, so a time axis is long flat stretches meaning "did not play this week".

**The reference is 1500, and drawing the bot's own anchor there was tried and fails on real numbers.**
The idea was good — a rule at v2's 1200 would read "here is where I passed the computer" — and
this account is 300 clear of it, so including it squashes the whole line into the top fifth and loses
the shape. **A reference has to sit inside the data's range to be worth its space**, so the average is
the rule and the bot's rating is a caption.

The opening stretch is shaded and labelled `SETTLING` rather than trimmed. Everybody starts at 1500 and
the first results move by nearly a whole K, so that stretch ramps whatever the player did; hiding it
would make the line start at an unexplained height, where saying so explains both. And the tick marks
where the bot *version* changed, which is the only vertical event on the chart with a cause — results
either side are not measuring the same opponent.

The history was free: `ratingsFor` already computed every point during its walk and threw them away.
No new query and no schema — only `HISTORY_LENGTH` to bound the payload.

**The chart marked the first release change only, and v3 is what exposed it.** `versionChangeAt`
returned a single index and the render drew a single rule, which was indistinguishable from correct for
as long as anybody's history held one change. The moment v3 shipped, a line spanning v1, v2 and v3 drew
the v1-to-v2 rule and silently dropped the one the player had just created — reported as "I see a v2
indicator but no v3". It returns every change now. **A "the" in a function name is worth suspecting
whenever the thing it names can happen twice.** `test/ratingTrend.test.ts` covers three releases, one
release, none, and a person played between two bots — that last because a null either side of a version
is not a change of opponent worth a rule.

**A rating settles twice as fast for its first ten matches, and the reason is arithmetic rather than
taste.** Everybody starts at 1500 and the strongest bot is anchored at 1400, so a new player's number
begins a hundred points too high. At `K_FACTOR` a break-even run sheds about four points a match, so
that prior survives tens of games — and in a pool playing a handful of rubbers a week, tens of games is
most of a season. **That is structural flattery**: being told you are better than you are by the
arithmetic rather than by a wrong constant, which is the error `ratings.ts` argues against everywhere
else.

Measured against one real nine-match history: a flat K gave 1423 where that player's own results imply
somewhere near 1280, and doubling K for the first ten gave **1361** on identical data. A provisional
period is what chess federations do for exactly this. `PROVISIONAL_MATCHES` is counted **per identity**
rather than per pool, so somebody joining an established family still gets their own settling stretch,
and the chart's shaded band is the same ten — it now marks a fact about the arithmetic rather than a
caution somebody chose.

**What it does not do is make a small sample informative.** Six matches against one opponent is
consistent with a range hundreds of points wide; a bigger K arrives at a point inside that range sooner
without knowing any better which point is right. The stated cost: an early loss moves the number by
about 36 rather than 18, so a new rating is visibly jumpy. That buys a number meaning something after
ten games instead of thirty.

**The trap to state before anyone reads a flat line as a plateau:** because the bot is pinned, the
line converges toward *bot + the player's true gap* and then flattens. That is having found your
level, not having stopped improving, and the only way past it is a stronger opponent — which is what
v3 was for, and what the top of the difficulty ladder is for now.

**There is a leaderboard, and it is the first thing here with no point of view.** Everything on
"Your record" is from the reader's side — a points-for, a win-loss from their seat, their recent
matches, and a button that deletes their history. A board is a list of other people, which is the
distinction `results.ts` already draws in prose for `AnyMatch`. So it is not another section of that
screen: it is a second **view** behind the same door, switched by `You` / `Everyone`, with the `h1`
following the view so the first-person voice stays on the first-person half. Sharing one scroll would
have put a destructive control at the foot of a list that is partly somebody else's.

**The switch beat a fifth button on Home, and the argument was measurable.** Home's secondary row is
four `flex-1` buttons across 336px, so 84px each; a fifth drops them to 64px and wraps "Achievements"
and "How to play" onto a second line. Relabelling one entry from "Your record" to **"Record"** is
shorter than what was there, so every caption stays on one line — and the label had to change anyway,
since half the destination is not yours. The control is `SettingsOverlay`'s own `Choice` vocabulary
rather than new chrome, and it is a real pair of buttons with `aria-pressed`: **a tappable rating
block was the first design and was wrong**, for the reason the opponent rows are real buttons with
`aria-expanded` — a decorated `div` leaves the keyboard and a screen reader with no way to know there
is anywhere to go.

**The rank rides with the record and the rows do not.** `/api/results` has already made the global
walk to produce a rating, so ranking that rating inside it is arithmetic on data in hand — `1514 ·
your rating · 3rd of 9`, which is the one fact about the pool that is about *you*. The board itself
is `GET /api/standings`, fetched only when somebody switches to it, so nobody checking their own
win-loss pays for everybody else's rows. `test/standingsView.test.ts` pins that laziness, because if
it goes the whole argument for a separate route goes with it and nothing else would say so.

**Session-gated, and it is the first surface that shows one player another player's number
unprompted.** The precedent it is measured against is `/api/results/all`, which is playtester-gated
and answers 404 because it is not scoped to the asker; a board is that kind of thing, and shipping it
to everybody is a deliberate widening of what the app discloses rather than an oversight. What it may
not carry is asserted rather than reviewed: no account id and no device token — a token reclaims a
dropped seat, so it is a credential rather than a label — which leaves a display name, a rating and a
count, with *which row is yours* as a boolean.

**Three kinds of row are absent, and each would have been wrong in its own way.** An account with no
name, because a row reading "—" beside a rating is worse than a shorter list. An account that has
never finished a rated match, because an untouched 1500 is a starting value rather than a rating. And
a device token no account has claimed, because that is a browser rather than a player. **The fold is
the part most likely to break**: a person's matches split across their account and every device they
played on before signing in, so a board built off the rating map alone lists them twice — `ratingOf`
already resolves that for the asker and `buildStandings` uses the same function, which is what keeps
a board row agreeing with the number that person reads on their own record.

**Settling ratings are listed apart rather than hidden or ranked.** Everybody starts at 1500, the
strongest bot is anchored at 1400 and K is doubled for ten matches, so one win puts a brand-new
account near 1523 — above a settled player at 1500. Ranking that would be ordering the prior rather
than the players. It is the same choice the rating chart made in shading its opening stretch instead
of trimming it: `PROVISIONAL_MATCHES` is already the server's own line for "settled", and it is sent
with the board rather than copied into the client.

**The computers are on the board, drawn as marks on the scale rather than competitors.** A leaderboard
in a family-sized pool would otherwise say nothing Elo does not conserve away, and the pinned anchors
are the whole reason the ordering means anything — so `pinnedOpponents` puts the newest release on
each of the three rungs in the list, unranked, at 1400/1200/1050. This is where it differs from
`RatingTrend`, which tried the bot's anchor as its reference rule and had to give it up because 1400
sat outside the data's range; in a ranked list it sits inside. A person sorts above a computer on the
same rating, because matching it is not passing it. Superseded releases are left off even though they
are still playable: a board is a scale, not a catalogue, and every release on every rung is nine rows
of reference data in a list holding a handful of people.

**How hard it plays is one setting, and it is rated per rung.** Difficulty used to be spread across
`strength`, `boldness`, the disguise and the opponent picker — four rows that all changed how hard the
game was, none of which said so, and using them meant knowing what a sample count is. `difficulty.ts`
replaces them with three rungs named for where the game is played rather than for how hard it is:
Kitchen, Club, Championship. "Easy" and "hard" describe the player; a kitchen table
describes the opponent, which is the thing being chosen. It also keeps them clear of the hockey names
on `release.ts` — one says *who* you are playing, the other says *how hard*.

**Every rung makes the bot wrong the way a person is wrong.** It thinks for less time, and at the
bottom it stops working the hand out and plays by rules of thumb. No rung makes it play a card it knows
is bad. An opponent that blunders on purpose is not a weaker player but a broken one, and that failure
has been rejected here before.

**Forgetting was the lever this was written around, and it turned out to be worth nothing** — see the
ladder thread below. `forgetful.ts` survives as a decorator wired through `botForLevel`, because
`botTurn.ts` already hands every decision the cards this seat discarded, so forgetting is exactly "pass
on less than you were given" and costs nothing to keep available. Its forgetting is **stable for the
deal**, seeded from the discards themselves: a bot that re-rolled per decision would not be forgetful
but incoherent, ruling a card out while bidding and dealing that same card to the opponent two tricks
later. Perfect recall returns the bot *unwrapped*, which is what keeps a pinned release pinned — and is
now what happens on every rung.

**The version and the rung are rated together, and the offset is per rung rather than per pair.**
`bot_version` says which computer somebody played; `difficulty` says how hard it was asked to play, and
beating it on its gentlest setting and beating it on its hardest are not one achievement. An anchor per
rung *per version* would be a table nobody will ever measure, so `DIFFICULTY_OFFSETS` is one number per
rung applied to the version's anchor — the assumption being that a rung weakens the bot by about the
same amount whichever release is underneath it, which is at least plausible because the levers a rung
pulls are shared by every release. Zero at the top, because `BOT_RATINGS` was measured at the strongest
setting and that is what the app plays by default, so retuning a rung does not shift the whole table.

**The anchors are sent to the client rather than computed there**, so the number on the difficulty row
in Settings, the number beside the computer's seat on the play screen and the number the rating walk
actually used are one number from one place.

**`GET /api/bots` is open, and it is the only route here that is.** The first version sent the anchors
down with the record, which needs a session — so the rating beside the opponent's seat was blank until
somebody had visited the *record screen*, signed in, on that device. Reported as "I don't see the ELO
of the bot when playing", and it is backwards for a number whose whole job is to sit beside the
opponent while you play them. These are constants about the bot rather than about anybody: the same
dozen numbers for every player, revealing nothing about who plays or how they do. `useBotAnchor` reads
the cached copy synchronously so a device that has seen them once draws them offline, which the robot
game requires, and only asks when it has nothing. Three copies of an anchor is three things to forget to
retune, and this ladder is going to be retuned. `botAnchor` returns **null** rather than a guess when
nothing has been fetched that says: a rating is the figure somebody quotes at the dinner table, so a
plausible-looking wrong one is worse than a blank, because nobody checks a number that looks right.

Two nullable-column readings that will look like bugs later and are not, both the same shape as
`bot_version`'s. **A null difficulty means "before the setting existed", not "unknown"**, and is rated
at the *top* rung — which is the honest reading rather than a default, since every one of those games
was played with perfect recall and the full sample count because there was no way to ask for less. And
**an unrecognised rung is stored raw and rated as the weakest known one**: the client can be deployed
ahead of the server and the service worker keeps old builds in circulation, so storing the string the
client sent lets `ratings.ts` come out right by itself once the server learns the name, where dropping
it to null would silently rate the match at the top rung and never correct. The conservative direction
throughout, for the reason v3's anchor was set low — being told you are better than you are is the
error nobody notices and nothing later fixes.

`test/ratings.test.ts` walks the app's own `DIFFICULTIES` list against the server's offset table,
because the two live in different workspaces and nothing else makes them meet. A rung missing from the
server is not an error anywhere: it is priced as the weakest, every match on it under-rates the player,
and nothing says so.

**Bidding by search is costed but not built, and the cost is the whole question.** The bidder is the
last decision in here made with a rule of thumb — it counts tricks with `evaluate.ts`, whose estimate
explains about 40% of what happens, and then spreads a fixed-width bell curve over the guess. Card play
stopped doing anything of the kind long ago and that was the largest single improvement the bot has
had. The reason bidding never followed is cost, and nobody had measured it.

`bidTiming.ts` measures it and decides nothing. **One solve answers a whole strain**, since double
dummy depends on the strain and not the level — 4♥ and 5♥ are the same position — so the cost is
(strains considered) × (samples), not (candidate contracts) × (samples), and one pass prices this hand
declaring *and* defending because a solution carries both seats.

On this machine, at the first call with thirteen cards each and nothing played, which is the worst
case: **7.1ms a solve**, so 25 samples over five strains is **889ms** and over two strains is
**342ms**. `bench/bidcost.ts` is that run.

**The same code is a row in the testing panel — "Time a bid search" — because the number that decides
the feature cannot be taken anywhere but a phone.** It blocks while it runs, on purpose: bidding by
search would block too, and hiding it behind an animation would measure the animation.

**Measured, and the prediction was wrong in the useful direction.** I expected a phone to run this two
to four times *slower* and sized the whole feature around needing a worker. On a real device it is
**2.6ms a solve against the desktop's 7.1 — nearly three times faster.** Five strains at 25 samples is
**331ms on the phone** against 889 here, two strains **123ms** against 342.

The reason, in hindsight: the solver is tight integer and bitmask work with a transposition table, which
is exactly what JavaScriptCore on a current phone SoC is best at, and the baseline is Node under
`vite-node` on a Windows laptop. **For this workload the dev machine is the slow one.** Worth
remembering before sizing anything else around an assumed phone penalty.

**The mean was the wrong summary and it hid the decision.** Reported over 40 deals, a 25-sample pass
over five strains runs **102ms at best and 5,269ms at worst**, median 956 and p90 3,286 — a fiftyfold
spread. On the newest iPhone, a dozen taps gave half under 500ms and a longest of four seconds. The
bench printed an average until this was noticed, which read as a settled cost of about 900ms.

**The cost is hand shape, not hardware.** A double-dummy search collapses where there are long suits
and clear structure and explodes on flat hands with scattered honours. So no per-device tuning of a
sample count can work, and the feature has to be an **anytime search with a deadline** — see
`REQUIREMENTS.md` §2.1 for the v4 design. The uncomfortable corollary is recorded there too: the
expensive hands are the ones a counted estimate serves worst.

**But that number was taken on the newest iPhone, so it is a ceiling and not a floor.** The device that
decides what ships is the slowest one anybody plays on, and this game is played across a family's
phones. Guessing at the spread rather than measuring it: an iPhone four or five years old is perhaps
two to three times slower single-thread, an older or budget Android four to six — so 2.6ms a solve
could be 6 to 15 elsewhere, and five strains every call becomes one to two seconds an auction.

So the design discipline stands even though the fast device does not need it: **one pass per auction
over the two or three strains actually in contention**, which is 123ms on the newest phone and
plausibly three quarters of a second on the oldest. The headroom on a current device is not headroom to
spend.

The same reasoning **withdraws an idea this measurement first suggested** — raising card play's sample
count from 60. That is 156ms a card here and 600 on a slow device, eating the animation on exactly the
phones least able to afford it.

**A sample count chosen from a measured device speed would beat a constant**, and the trade-off is
worth naming before anybody builds it: timing the first few solves and picking a count to fit a budget
adapts across devices, but makes the same seed play differently on different phones, which costs the
reproducibility the seeded engine and the hand log are built on. The way to have both is to measure
once, fix the count for the whole match, and log it beside `strength` — a match stays replayable
because the count it used is recorded.

Two caveats on the raw number as well. It is **one deal against the desktop's twenty-deal average**, and
solve time varies a good deal with shape, so it is the right order of magnitude rather than three
significant figures.

**The bidder can search for its tricks now, and it wins 65% of rubbers against the same bidder
counting them** — 78 to 42 over 120 plays, +205 points a rubber, 3.4 standard errors. Off by default;
`searchBudgetMs` and `searchSamples` turn it on, and `bench/rubber.ts search=200` measures it.

**The value is in the shape, not the centre.** Handing the bidder only the search's *mean* and keeping
the fitted bell curve around it comes out level at 47.5%. The whole distribution wins. Which is the
argument the feature was built on: a flat hand with solid honours and a wild two-suiter have different
uncertainty, and `TRICK_SPREAD` is one number for every hand.

**It measured as a disaster first — 37%, then 33%, then 28% — and all of that was two bugs of mine.**

Replacing `estimateFor` wholesale **deleted the trust in their bid level**, which is worth +651 a
rubber against +467 and is the largest single thing the bidder knows. A better estimate of one term is
not a reason to discard another.

And the mirror was wrong. `searchTricks` solves with the opponent on lead, so it answers *this* seat
declaring — and double-dummy tricks are not independent of who leads, so thirteen minus that number is
not what they take when they declare. Every pass and double was priced off a position nobody was in.
The search is now used **only for this seat's own contracts**, which is exactly what it solved.

Scoping those two took it from 28.3% to 47.5% in mean mode and to 65.0% with the full distribution.
**Both bugs were found by re-reading the code, not by the bench** — the bench said "worse" three times
and could not say why, and the diagnosis I had built on those numbers (that the counted estimate's
optimism was load-bearing) was wrong and would have shelved the feature.

**One constant was invented and deleted in the same session.** The searched distribution is narrower
than the fitted one — its own spread is 1.11 tricks against an error of 1.54 — so widening it to match
looked obviously right, and it is worth nothing: 64.2% unwidened, 66.7% at a third of a trick, 65.0% at
a full one. The theory was formed while the two bugs were making the bidder timid, and the fix removed
the problem the widening was invented for.

Still to decide: whether to switch it on. Doing so changes v3's play materially, so it wants the
record reset or a version bump, and the phone cost measured — 200ms a call, two or three calls an
auction.

### Open threads

- **The ladder was spaced on its one inert lever, and measuring one lever at a time is what fixed
  it.** The first ladder guessed four rungs varying recall 3/6/10/13, samples 6/15/30/60 and bid search
  0/40/120/250ms together. Three of the four turned out to be **the same opponent**: Tournament against
  Championship was 40–40 over 80 rubbers, Club 37–43. Only Kitchen was distinct, at 23.8%.

  A rung is three levers moved at once, so that pair measurement said the bottom was real and could not
  say *which* lever made it real. `bench/rubber.ts levels=` takes a `recall/samples/search` triple for
  exactly this — one run per lever, each moving a single setting away from Championship, 40 rubbers
  each:

  | change | win rate | worth |
  | --- | --- | --- |
  | recall 13 → 3 | 57.5% ± 7.5 | **nothing** |
  | samples 60 → 6 | 40.0% ± 7.4 | ~70 |
  | bid search off | 35.0% ± 7.3 | ~108 |
  | solver off entirely | 17.5% ± 6.1 | ~269 |

  **Memory is worth nothing and it was the lever the ladder varied hardest.** 57.5% is the *forgetful*
  side ahead, a null with the wrong sign — and that arm pits full recall against almost none, so it is
  also the draw-replay capability against nothing, since replaying the opponent's draw needs all
  thirteen. That capability improved the trick estimate when it was built (1.07 → 1.04 against par) and
  does not survive into rubber outcomes. The same lesson as the auction-reading sampler pointing the
  other way: **a change measured in tricks and a change measured in points are different claims.**

  The parts compose about additively — Kitchen moved all three and measured ~202 against the 178 the
  parts predict — so there is no interaction to hunt for.

  **There is a fifth lever now and it deliberately does not rate the rungs**: remembering a *board*
  across deals, worth +157 ± 52 points a session. It rides on the same `keeps` value, so the top rung
  has it and the rungs below do not — but it exists only in duplicate, where a stock comes round
  twice, so it cannot appear in a table of rubber margins and the offsets above are untouched by it.
  A rung is priced by the format it was measured in.

  **The rebuilt ladder is three rungs, not four, and the fourth was removed because it did not exist.**
  Four rungs would sit inside the noise of the instrument measuring them. **Kitchen 1050, Club 1200,
  Championship 1400**, measured at −357 and −191 and rounded toward zero, which is the conservative
  direction: a rung rated slightly stronger than it plays gives slightly less credit for beating it.

  **`searchBudgetMs: 0` rather than an empty tuning, and this would have shipped wrong.** The rung's
  tuning is merged *over* the release's, so a rung leaving the key out inherits whatever the release
  set rather than turning the search off. An empty object reads as "no search" and means "whatever it
  said". `test/forgetful.test.ts` requires every rung to state a budget explicitly.

  Two things worth knowing before re-measuring anything here. **`nodouble` belongs in every one of
  these runs**: the oracle doubler handicaps whichever seat it is applied to under solver card play, and
  a control run of two identical bidders came back 61.8% because of it. And **the rungs are compared to
  each other rather than to par**, so the offset is what a rubber margin says — the only bench that can
  price a bidder at all.

  **The levers do not compose, and that is the finding that shaped the final ladder.** With the bid
  search on, going from 60 samples to none is worth 172 points; with it off, the same change is worth
  70. Turning off one way of thinking makes the other matter less. So stacking every lever reaches only
  **−261**, not the −380 the parts suggest — measured, not assumed, after the parts had already been
  added up once and found wanting. That left Kitchen and Club about seventy points apart, which is the
  original failure in miniature.

  **The simple bidder is the one lever that did compose**, taking the rung from −261 to **−357**, and
  the reason is worth keeping: it is not more of the same kind of weakening. Fewer samples and less
  search are both "think less about what a contract is worth", and they saturate against each other. A
  bidder that asks a different question does not. Its behavioural signature says the same thing —
  **down two or more in its own contract fell to 2% of deals from 13%**. It is not losing by
  overreaching; it bids only what it can make and simply never competes.

  **A floor was expected and there is not one where I guessed.** At 20 rubbers the simple bidder was
  tracking 10% and I wrote that rubber outcomes have a luck floor around 10–15% that no weakening gets
  past — the draw being 26 decisions and the deal most of the variance. The second twenty went 1–19 and
  it finished at **7.5%**. The floor may well exist; it is lower than it looked, and calling it from
  half a run was the same mistake as reading a win rate off the first five rubbers.

  **So the bottom rung got a different bidder rather than less of the same one.** `simpleBidder` is the
  rule the bot used before contracts were priced in points — bid the highest contract you think you can
  make, and otherwise pass — whose replacement was worth **+464 points a rubber, 775 rubbers to 225**.
  It lived in `bench/rubber.ts` as the reference the current bidder has to beat, described there as "not
  a bot any more"; it is a bot again, and `bench/rubber.ts` imports it from `src/` rather than keeping
  a copy.

  **The argument that changed my mind had nothing to do with strength.** Every other lever makes the
  bot think *less* about the right question. This one asks a **simpler and more natural** question, and
  "can I make this?" is how a person new to the game bids — nobody who has just learned it is pricing a
  contract against a rubber standing and weighing a sacrifice. It is the only lever that makes the
  computer weak in a way you could explain to somebody, which is the standard every rung here is held
  to. It does cross the release/rung boundary — Kitchen bids what no release ever shipped — and that is
  written down in `release.ts` rather than left to be discovered.

  **That open thread got measured and it reversed the conclusion.** Recall was called worthless off one
  arm at Championship settings, and the note said the low-sample case was untested. Measuring Club
  directly settled it: at six samples and no search, recall 13 against 3 is worth about **76 points**,
  where at full strength it measured **+48** — a null with the wrong sign.

  | recall 13 → 3 | worth |
  | --- | --- |
  | at 60 samples, search on | +48 |
  | at 6 samples, no search | −76 |

  The mechanism is plain in hindsight: with sixty sampled hands a card wrongly left in the pool is
  diluted across all of them; with six it is a sixth of everything the bot believes. **Memory matters
  exactly when there is little else to lean on** — which is why it is useless at the top of a ladder and
  a real lever at the bottom, the reverse of how the first ladder used it.

  Neither figure is individually significant — 1.0 and about 1.2 standard errors, the gap between them
  around 1.8 — so it is evidence rather than proof, and it is used only to place a rung whose combined
  build has been measured directly. Club ships as recall 3, which is exactly the configuration the old
  four-rung Kitchen was measured at over 80 rubbers.

  **Kitchen went forgetful too, and there the prediction held.** A ladder where the kitchen-table
  opponent has the better memory is not a ladder, so `forgetful.test.ts` rejected the mismatch. Recall
  costs Kitchen nothing — 10.0% against 7.5%, inside the noise — because recall's 13% was earned *in the
  sampler* and this rung has none. Predicted in advance and then run anyway, which is the only reason
  it counts.

  So the ladder is measured end to end with nothing interpolated: **Championship 1400, Club 1200 (−191
  over 80 rubbers), Kitchen 1050 (−321 and −357 across two builds, −368 pooled)**. Both offsets are
  rounded *toward zero*, which rates a rung slightly stronger than it plays and so gives slightly less
  credit for beating it.

  Watching one of these run is also what caught a fault in the read-out: the plain binomial error bar
  collapses to **exactly zero** at a clean sweep, so a lopsided run opened "0% ± 0" — no uncertainty
  at all — and the headline, which divides by that bar, would have announced half a billion standard
  errors off its guard against dividing by zero. `winRate` pads with two imagined wins and two
  imagined losses, and the tally and the headline share it so they cannot disagree.

  **The range that is left is below the bottom rung, not between the top ones, and it comes from
  turning the solver off rather than turning it down.** Heuristic card play is a *different kind of
  player* rather than a less certain one, which is why it does not saturate the way a sample count
  does — it gives away about twice as many tricks on defence and loses by tens of points a deal. It is
  also still wrong the way a person is wrong: it plays by rules of thumb, which is how a beginner
  plays, rather than choosing a card it can see is bad.

  **Random draw was considered for the bottom and rejected, on a reason specific to this game.** A bot
  drawing at random does not arrive at the auction playing badly, it arrives *holding garbage*, having
  built its hand out of the cards a sensible player throws away. Every deal would be won by several
  hundred points with no auction worth having. In a game whose first half is 26 discard decisions, the
  random opponent is not an easy opponent but an absent one.

  **`samples: 0` was a landmine until `bot/build.ts` existed, and the shape of it is worth keeping.**
  Zero samples is not a quieter sampler: nothing separates the cards, so the tie-break decides
  everything and the bot plays its lowest legal card every trick of every deal. `bench/rubber.ts` had
  always branched to `createHeuristicBot` at zero and `localSession.ts` had not — so a rung written
  that way would have *measured* as a sane weak opponent and *shipped* as one that never plays a
  picture card by choice, with nothing in the types saying so. One factory now, used by both, and
  `test/botForLevel.test.ts` pins both halves: that a no-sample rung is still choosing, and that the
  bare sampler is not. The second is what stops the first passing for the wrong reason.

  Two things worth knowing before re-measuring. **`nodouble` belongs in every one of these runs**: the
  oracle doubler handicaps whichever seat it is applied to under solver card play, and a control run of
  two identical bidders came back 61.8% because of it. And **the rungs are being compared to each
  other, not to par**, so the rating offset is what a rubber margin says — which is the only bench that
  can price a bidder at all, for the reason the rest of this file keeps repeating.


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

- **The open discard was built, played, and withdrawn, and the complaint it answered is still open.**
  It existed because the draw phase has no interaction in it: a turn spends two stock cards whichever
  card is taken, so nothing either player does changes what the other is offered, and 26 of a deal's 52
  decisions are two games of solitaire side by side. It went because playing it made the draw *less*
  strategic — a face-up card of known value mostly answers itself, so it crowded out the keep-or-reject
  bet against an unseen pool, which is the decision worth having. `REQUIREMENTS.md` §3.6b is the full
  record, including two things it needed and never got.

  **The complaint survives it and duplicate is the better answer.** The variant tried to make the draw
  *interactive*; duplicate makes it *scored* — thirteen private decisions against a shared stock stop
  being solitaire the moment somebody else's result on the same stock is the yardstick. The interaction
  moves into the comparison rather than into the pile, and the base game pays nothing for it.

  **What its removal bought, beyond the rule.** It was the only thing in the game that widened what a
  seat may be told, so `viewFor`'s projection has no exceptions again and the conditional permission is
  out of `packages/protocol/test/snapshot.test.ts`. And it was going to force the forgetting lever to
  be *built* rather than merely available, since a seat with perfect recall watching the pile ends the
  deal knowing the other hand — that pressure is gone, and duplicate brings it back in a different form
  (a bot replaying a board it has already played remembers the whole deal).

- **`DEFENSE_SHARE` is why the draw stopped passing up aces, and it was found by watching rather than
  by measuring.** Playing the withdrawn three-card draw turned up the bot declining a visible ace, and
  the cause was not that rule — which is why the fix outlived it. `rawHandValue` valued a growing hand
  purely as *declarer in its best strain*, and
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

  **Two layout things that were tried and rejected, so they are not tried again.** Shrinking both piles
  to a small stack with the count beside them buys back about 120px of phone height, and the deck's
  count really is derivable from the `TurnTrack` and the opponent's hand row — but the count *printed
  across the card* is what a player actually looks at, and at a third the size there is nowhere to
  print it. The piles stay full size. What did survive from that pass is merging the opponent's seat
  label into the commentary line: their name had been on screen twice in adjacent bands, and the label
  now carries only what a sentence cannot say.

  **Two UI bugs from that work outlived the rule that produced them.** The amber mark on a takeable card
  was a single pale ring, invisible against the one ground it has to work on — the near-white card face
  — so it is two layers now, a translucent-black gap and then the amber, which needs to know nothing
  about the per-theme table color or its sheen. And the commentary line lost the space before its
  emphasized phrase and read "took theunseen card", because the `p` holding it is a **flex container**:
  every child is a flex item and whitespace at an item's edge is trimmed like a block's, so the sentence
  has to be one inline `span` for its own spaces to survive — `{" "}` does not help, since a
  whitespace-only node between two items is discarded outright.

  `bench/draw.ts` grew `vs=N` for this — the same policy at a different weight, because against
  `alwaysKeep` both weights win hugely and the difference between them drowns. Its disagreement counter
  now compares against **the reference actually in play**; hardwired to `alwaysKeep` it reported 70% of
  decisions changed when the real answer was 1.3%, which is the same instrument failure this file keeps
  recording, in the read-out rather than in the experiment. Note `rawHandValue` is used by the draw
  decision and nothing else, so none of this touches the bidder, the card play or the calibration.

- **Draw-phase pacing is settled: fast.** This was the longest-standing open question here — the
  durations in `game/timing.ts` were first guesses, a turn costs roughly 0.6s to 1.5s of animation
  times 26, and whether that reads as deliberate or as waiting is not something a bench has an
  opinion about. It is the whole reason the thing went onto a phone this early, and playing it is
  what answered it: **fast**, the 0.6 multiplier, which is what it had defaulted to all along.

  So the `Pace` row graduated out of the testing panel into the ordinary settings, which is not a
  contradiction — the *question* is closed and an ordinary preference is what is left. It earns its
  place out there because the game is now shared beyond the family: the fastest pace is not the right
  one for somebody meeting the draw for the first time, which is exactly who the walkthrough is for,
  and behind the playtester flag they could not have reached it. `"brisk"` was renamed `"fast"` to
  match what the row says; `pace()` treats anything unrecognized as fast, so the old spelling carries
  across without a migration.

  One of the three "settings that exist to answer a question" remains — `boldness` — and the note on
  it in `identity.ts` still says what has to happen when it gets its answer. `strength` is gone, and
  the way it went is worth recording: it did not get an answer, it got a **better question**. It was
  asking "how much sampling is worth sitting down to", which turned out to be the player's to answer
  rather than a constant to find, so it became a rung on the difficulty ladder. It was also, briefly,
  a **dead control** — the rung took ownership of the sample count while the row stayed on screen
  still promising to change it. A setting that lies is worse than one that is merely unanswered.
- **How much should the bot remember? Closed, and it turned out to be two questions with opposite
  answers.** Discards are not shown, so recall is part of the game and a perfect-memory bot has a real
  edge; the `Bot` interface therefore takes every kind of memory as explicit state handed to it, never
  read from engine state, which is what keeps lossy memory a difficulty lever. *Within* a deal that
  memory is worth nothing at the top of the ladder and about 76 points at the bottom — the ladder
  thread above has why. *Across* deals it exists only in duplicate, where it is worth +157 ± 52 points
  a session. Both are rung business, so "whether the bot forgets" has no single answer: the top rung
  remembers everything including the boards it has played, and every rung below forgets both.
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

### Deploying: the app and the server ship together

**`npm run deploy --workspace @hb/web` and `npm run deploy --workspace @hb/server` are one release,
and nothing enforces it.** The engine is shared source bundled into both, so a change to
`packages/engine` changes what each end expects — and the wire carries no version, so a mismatch is
not refused anywhere. It just misbehaves.

This has already happened once and cost an afternoon of looking in the wrong place. `apps/web` was
deployed from a commit that added the open discard; `apps/server` was not. Nothing errored on either
side that anybody could see. What actually happened:

- `draw-decide` had changed from `{ keep: boolean }` to `{ take: "first" | "second" | "discard" }`,
  so the client's choice arrived as a field the deployed server did not read. `undefined` is falsy,
  so **every draw turn of every networked deal was silently treated as a reject** — the player's
  taps did nothing, and the hands were still thirteen cards, so nothing looked wrong.
- `PlayerView` had gained `rules`, and `legalActionsForView` reads `view.rules.openDiscard` — so a
  current client throws a `TypeError` on its first draw turn against an older server.
- `DrawReveal.discarded` had gone from `Card | null` to `readonly Card[]`, and `drawPlayout` reads
  `.length` — so the same client throws again on the opponent's first turn.

**Withdrawing that rule is the same hazard in reverse, and it has not been deployed yet.** `PlayerView`
has *lost* `rules` and `discardTop`, and `DrawTake` no longer has `"discard"` — so an older client
against a current server reads `view.rules.openDiscard` off `undefined` and throws on its first draw
turn, exactly as before with the two ends swapped. `DrawReveal.discarded` was deliberately left a
`readonly Card[]` rather than shrunk back to a single card, which removes one of the three failure
modes above from this deploy but not the other two. Ship both ends together.

**Never request a new hashed asset through the custom domain until a cache-buster has proved the
origin has it.** Pages answers an unpropagated `/assets/*` with the SPA fallback — `index.html`, under
`Cache-Control: immutable, max-age=31536000` — so one curl poisons that path for a year. I have done
this twice, and the second time was worse than the first because I had convinced myself of a wrong
safety check: **`index.html` on the domain already naming the asset does not mean the asset has
propagated.** It named it, the asset path still returned HTML, and the request I made to "verify"
cached that HTML under the exact URL every visitor was about to load. The app was broken until the
next deploy.

The order that is actually safe: deploy, verify on the `*.pages.dev` alias, then probe the domain
with `?v=<timestamp>` and check `content-type`, and only then touch the plain path. Recovery is a
rebuild — the build stamp changes, so the content hash changes — and a redeploy, which orphans the
poisoned path.

Diagnosing this by reading the code was slow and diagnosing it by comparing timestamps was instant:
`npx wrangler deployments list` in `apps/server` against `npx wrangler pages deployment list
--project-name=honeymoon-bridge` in `apps/web`, then `git log --since=<the older one> -- packages/`.
**If anything in `packages/` landed between the two deploys, stop looking for a bug and deploy.**

The general shape, worth keeping: a networked bug report that the same code cannot reproduce locally
is a question about *what is deployed* before it is a question about the code. The rules engine and
the board were both exonerated here by tests that were written to accuse them.

### Testing on a phone

Development is Windows + desktop Chrome with the DevTools device toolbar; two-player testing uses a
normal window plus an incognito window, since separate `localStorage` means separate seats. Chrome
cannot verify WebKit behavior (safe-area insets, `dvh` viewport, PWA install, background socket
drops) — `REQUIREMENTS.md` §3.6 covers what needs a real iPhone and when.

A local `wrangler dev` needs two things that are not in the repo: `SESSION_SECRET`, without which
sign-in throws, and `DEV_SIGNIN`, which the `dev` script already passes. There is no `.dev.vars`, so
`npm run dev --workspace @hb/server` alone cannot seat anybody — and neither can it before
`npx wrangler d1 migrations apply honeymoon-bridge --local` has been run, since a table needs an
account and an account needs the schema. Both are one-time setup that looks like a bug the first time.

**The Durable Object is exercised against a real `wrangler dev`, and driving it takes twenty lines.**
Two `WebSocket`s, `/api/auth/dev` for a session apiece, `/api/auth/name` (a seat is refused without
one), `POST /api/tables` for a code, then `legalActionsForView` off each seat's own snapshot to pick
the next action. Worth writing again whenever a networked report needs the server ruled in or out:
it plays a full 26-turn draw, an auction and 13 tricks in about a second.
