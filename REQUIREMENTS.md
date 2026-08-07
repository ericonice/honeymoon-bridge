# Honeymoon Bridge — Requirements

A two-player contract bridge variant, playable in a phone browser. Two versions: a
single-player game against a computer opponent, and a live two-device game over a network.

Status: requirements agreed, nothing built yet. Open questions are collected at the end.

---

## 1. The Game

This is a house variant. It is not the classic "draw" honeymoon bridge, and it is not
semi-exposed honeymoon bridge. The distinguishing feature is the draw phase: each player
sees 26 cards but keeps only 13, and half the deck never enters play at all.

### 1.1 Setup

- One standard 52-card deck, shuffled, placed face down as a single stock.
- No dummy, no partners. Each player is a side unto themselves.
- One player has the right to draw first. This alternates from deal to deal, functioning
  as the deal rotation.

### 1.2 Draw Phase

Players strictly alternate turns. A turn always consumes exactly two cards from the stock
and adds exactly one card to the player's hand:

1. The player draws card 1 and looks at it.
2. The player commits to one of two choices, **before seeing card 2**:
   - **Keep card 1.** Card 2 is then drawn, looked at, and discarded.
   - **Reject card 1.** Card 1 is discarded and card 2 is taken sight-unseen into the hand.
3. Turn ends.

The decision is sequential and committing — rejecting card 1 is a genuine gamble on an
unknown card. This is the central tension of the phase.

The phase runs 26 turns (13 per player) and consumes the deck exactly. Both players finish
with 13 cards. The 26 discarded cards are out of play for the rest of the deal.

### 1.3 The Draw Screen

The draw phase is 26 turns of the same decision, so the screen it happens on carries most of the
game's feel. What follows is a layout requirement, not a styling one — each element earns its place
by making a rule visible.

Top to bottom: **the opponent's hand** as a face-down row that grows a card a turn; **the stock,
card 1, and the discard pile** in a row across the middle; **keep and reject** as two full-width
buttons; **your own hand** along the bottom, visible at all times, because every keep-or-reject is
judged against what you already hold.

The stock shows its remaining count and visibly thins as it empties. The discard pile does the
reverse. Both are the same information as the number printed on them; the phase is *about* the deck
running down two cards a turn, and a number alone does not convey it.

**A hand is laid out spades, hearts, clubs, diamonds** — here and in every other phase. That is not
the bidding order, which runs clubs up to spades; it is chosen so the suits alternate black and red.
Cards overlap in a fan, so all that shows of most of them is a narrow strip down the left, and in
bidding order the join between diamonds and hearts is two red strips against each other and
vanishes. Within a suit, high cards first.

**Your own resolved turn is animated as the movement of two cards**, because where those two cards
go is the rule: one arrives in your hand and one in the discard, and which went where is exactly
the keep-or-reject distinction.

- **The opponent's turn is not animated.** It was, once, with a beat first so their card 1 could be
  told from card 2 — the reasoning being that destinations carry the choice. In the hand it read as
  ceremony. Their hand grows by one either way, the deck drops by two, and a line of text says what
  they did in words; two face-down cards travelling added none of that and cost about a second on
  each of their thirteen turns, on the phase whose open question is whether it drags. It is now a
  pause long enough to register, with something visibly moving so the game does not look stopped.
- **The player's own turn keeps its animation**, because it is doing work nothing else does: it is
  what shows you card 2 on a keep, which the rules require.
- **Both of your own cards are shown face up**, and on a keep, card 2 is held face up long enough
  to read before it goes to the discard. This is required, not decorative: §1.4 has you look at
  both cards on every turn, and the 13 cards you keep plus the 13 you throw away are the 26 you are
  entitled to have seen. A UI that skips card 2 silently deletes half of what you are supposed to
  be remembering.
- **Your card 1 is not turned over until the board is still.** The rules engine hands it to you
  the instant the opponent's turn resolves, but that turn is still playing out on screen. Showing
  it early steps on their animation and invites a decision taken while you are still being told
  what just happened. It stays face down, and both buttons stay disabled, until the table settles.
- **The card that just entered your hand is marked** until the next one replaces it. The hand is
  displayed sorted, so a card taken sight-unseen slots in among twelve others with nothing to say
  it just arrived. The mark does not move the card out of the row — a card that jumps forward
  reads as selected, which is a different idea. This shows nothing that is not already on screen.
- **The reveal is never re-viewable.** It plays once, at the moment of the turn, and cannot be
  replayed, scrubbed or scrolled back to. Recalling it is the player's problem — that is the point.

### 1.4 Information Model

Precise definition of who knows what, because the server enforces this and the robot
reasons over it.

**Private to a player:**
- Their own 13-card hand.
- Every card they personally drew — note that a player looks at *both* cards on every one
  of their turns, so by the end of the draw phase each player has seen 26 distinct cards:
  their 13-card hand plus the 13 cards they discarded.
- Consequence: the 26 cards a player has *not* seen are split between the opponent's hand
  and the opponent's discards, in unknown proportion. Deducing which is the core inference
  problem of the game.
- **A player's own discards reach back exactly one turn.** Each is seen at the moment of the
  turn that throws it away — §1.3 requires that, or the player has not in fact looked at both
  cards — and the turn just played can be called back up, because the reveal is a card in
  motion and can be missed. That recall closes the instant the next turn is taken. There is no
  discard list, no history and no way further back; the app shows the current hand and nothing
  else. Recalling the other twelve is the player's own problem. Memory is deliberately part of
  the game.

**Public to both players:**
- Whose turn it is and how many cards remain in the stock.
- For every completed draw turn, **whether that player kept card 1 or took card 2**. The
  choice is visible; the cards are not.

**Never visible to the opponent:**
- Any discarded card, ever. Discards are face down and permanently gone.
- Any card in the other player's hand.

### 1.5 Auction

Full contract bridge auction once both hands are complete.

- All 35 contracts (levels 1–7 × ♣ ♦ ♥ ♠ NT), plus Pass, Double, Redouble.
- Standard legality: bids must ascend; Double only over an opponent's undoubled bid;
  Redouble only over a Double of one's own bid; the auction closes when a bid is followed
  by a pass.
- The first-drawer for the deal makes the first call.
- **No conventions and no alerting.** With no partner there is no one to signal to — the
  auction is a purely competitive negotiation over the contract. Stayman, transfers and the
  rest of the convention apparatus are meaningless here and are explicitly out of scope.
- A deal passed out by both players is redealt, with the same player drawing first.

### 1.6 Play

- No dummy. Both hands stay concealed throughout.
- The non-declarer makes the opening lead.
- 13 tricks. Follow suit if able; otherwise play anything. Highest trump wins, else highest
  card of the suit led. Winner of a trick leads to the next.
- Declarer needs level + 6 tricks (book is 6).
- **Every deal is played out to all 13 tricks.** No claiming and no conceding.
- **A finished trick is swept towards whoever won it**, then it is gone. The engine resolves a
  trick the instant the second card lands and hands the lead to the winner, so without this the
  trick you just lost would be replaced by the next card before you had read it. The direction of
  the sweep is what says who took it.
- **The last completed trick can be called back up on demand.** Both cards were played face up and
  both players saw them, so this is public — it is the paper game's right to look back at the trick
  just played. Only the most recent one: the whole history is available in the state, and offering
  it would turn a game where memory is the point into a reference table.
- **No undo or takeback** of any action. Bids require a confirmation tap to guard against
  misclicks; card plays are final on release.
- With 26 cards missing from the deal, voids and unusual distributions are common and
  expected. This is not an error condition.

### 1.7 Scoring — Rubber Bridge

Standard rubber bridge scoring, with each player scoring as a side.

**Trick points (below the line)** — per trick taken over book:

| Contract | Value |
|---|---|
| ♣ / ♦ | 20 per trick |
| ♥ / ♠ | 30 per trick |
| NT | 40 for the first trick, 30 for each subsequent |

Doubled contracts double the trick score; redoubled quadruple it.

**Games, part-scores and vulnerability**
- 100 or more trick points below the line wins a game; the line is then redrawn and both
  sides' part-scores are wiped.
- Part-scores below 100 accumulate across deals until a game is won.
- A side that has won a game is **vulnerable** for the remainder of the rubber.
- The rubber ends when a side wins two games.

**Bonuses (above the line)**
- Rubber: **700** for two games to none, **500** for two games to one.
- Slam: small slam **500** non-vulnerable / **750** vulnerable; grand slam **1000** / **1500**.
- Making a doubled contract: **50** insult bonus; redoubled: **100**.
- Overtricks: undoubled, the normal trick value each. Doubled: **100** each non-vulnerable,
  **200** each vulnerable. Redoubled: **200** / **400**.

**Undertricks (scored by the defender, above the line)**

| | Non-vulnerable | Vulnerable |
|---|---|---|
| Undoubled | 50 each | 100 each |
| Doubled | 100 first, 200 each for the 2nd and 3rd, 300 each thereafter | 200 first, 300 each thereafter |
| Redoubled | double the doubled values | double the doubled values |

**The scorepad**

A rubber runs several deals, so the score has to be a record and not just a running total. Every
deal gets a line: the contract, who declared, whether it made, and the points to each side. A line
is ruled across under the deal that wins a game, the way it is on paper.

Below-the-line points are shown distinctly from above-the-line ones. Both are real, but only points
below the line count towards a game, and a scorepad that adds them into a single figure hides the
distinction the whole rubber turns on.

**Honors** — in scope.
- **100** for four of the five trump honors (A K Q J 10) in one hand.
- **150** for all five trump honors in one hand.
- **150** for all four aces in one hand at no-trump.
- Scored by whichever player holds them, declarer or defender alike.
- The engine detects and awards honors automatically at the end of the deal; there is no
  claiming step. Honors will be rarer than in normal bridge, since half the deck is out of play.

---

## 2. The Two Versions

### 2.1 Human vs. Robot

- Runs entirely in the browser. **No server, no network, no account.** Fully playable offline.
- One computer opponent, implemented behind a `Bot` interface with three decision points:
  keep-or-reject during the draw, make a call during the auction, play a card during the trick.
- v1 ships a single straightforward heuristic bot. Difficulty is **not** exposed to the
  player as a setting in v1, but the interface is designed so stronger implementations can
  be dropped in later without touching the rest of the app.
- The bot must not read hidden state. It sees exactly what a human in its seat would see,
  as defined in §1.4. This is a correctness requirement, not just a fairness one — it keeps
  the interface honest for future bot implementations.
#### What the bot actually does

Three decisions, in `apps/web/src/bot/`. The through-line is that **there is no partner**, which
removes most of what ordinary bridge technique is for: no fit to find, no signals to send, no third
hand. What is left is arithmetic about one hand.

**Hand evaluation** (`evaluate.ts`) — the shared basis for the other two. It counts *playing
tricks*, not points: trump length past the first two, plus winners in the side suits (AK=2, AQ=1½,
A=1, KQ=1, guarded K=½). Point counting answers "how much do we hold between us", which is a
question with no meaning here. The raw count under-predicts badly, so it is **calibrated against
measured outcomes** rather than reasoned about — see §5.2.

**Bidding** (`heuristicBot.ts`) — measure every legal bid against what the hand is worth in that
strain, discard the ones it cannot make, and take the highest of the rest. Being outbid in a suit
therefore pushes it into another suit it can afford, never into a level it cannot; when nothing is
affordable it passes. It doubles only from the five level and holding three defensive tricks — that
is, only when they have clearly overreached. It never redoubles.

**The draw** (`drawDecision.ts`) — the interesting one, because rejecting is not discarding, it is
swapping for a draw from what is left. So both sides are measured the same way: what card 1 adds to
this hand, against what an unknown card adds on average over every card not yet accounted for.
Nothing about aces or long suits is special-cased — they fall out, because value is measured as the
*gain to this hand*. A fifth card in a suit you are already long in is worth more than a fifth
elsewhere; two long suits beat one, since the hand is valued at its best strain and no-trump counts
every suit's length at once. The pool of unknown cards is where memory will live: a bot that
recalled its own discards would rule them out and choose more sharply, which is the difficulty
lever below.

**Card play** (`cardPlay.ts`) — a trick is two cards, so the whole trick is decided by the second
one. Following: win with the *cheapest* card that wins, or throw the lowest card of the shortest
non-trump suit, since length is what runs later. Leading: draw trumps while holding four or more
and the opponent has not shown void; otherwise cash a card nothing outstanding can beat, longest
suit first; otherwise lead low from length. "Nothing outstanding can beat it" counts the 26 cards
that were never dealt as though they were still out there, so it is too cautious rather than wrong.

- **Bot memory is a tunable, not a given.** Since discards are not displayed back (§1.4), a human
  will forget some of the 13 cards they discarded and the bot would otherwise never forget
  any of them. Perfect recall is therefore a genuine advantage the bot gets for free, and
  imperfect recall becomes a legitimate difficulty lever alongside play strength. The bot
  interface should treat "what this bot remembers seeing" as explicit state it is given,
  not as something it reads from the engine directly.

### 2.2 Human vs. Human, Networked

- Two players on two devices, **both live and connected**. Not asynchronous or
  correspondence play.
- **Table creation:** one player creates a table and receives a short invite link. They send
  it however they like. The second player opens it and is seated. No public lobby, no
  matchmaking, no discovery. (A "quick match" queue is a possible later addition; out of
  scope for v1.)
- **Identity:** anonymous. A nickname plus an opaque token persisted in `localStorage`,
  which is what reclaims the player's seat on reconnect. No accounts, no passwords, no email.
  Accepted trade-off: a rubber is bound to the device that started it — clearing browser data
  or switching phones mid-rubber forfeits the seat.
- **Server authority is a hard requirement.** The server holds the authoritative game state.
  A client is sent only its own hand, the public state, and the opponent's visible choices.
  The opponent's hand, the undrawn stock and all discards must never cross the wire to a
  client. Because the rules engine is shared code that could run wholly client-side, this
  needs to be an explicit, tested boundary rather than an assumption.
- **Disconnection handling.** A rubber runs long, and iOS Safari suspends backgrounded tabs
  and drops WebSockets when the phone locks or a call arrives. Both players will disconnect
  during a normal session; this is the expected case, not an edge case.
  - Client: heartbeat, plus reconnect-and-resynchronize on `visibilitychange`.
  - Server: state survives the socket. A reconnecting client presents its token and resumes
    its seat with full state.
  - Opponent's view: an explicit "waiting for X to reconnect" state with a visible countdown,
    not a frozen or apparently-dead table.
  - Grace period: **3 minutes**, after which the waiting player chooses to keep waiting or
    end the table.
- **Abandoned rubbers end unscored** and the table is discarded. There are no ratings,
  standings or history to protect.
- **No turn clock in v1.** The risk is a 26-turn draw phase held up by a slow opponent;
  revisit if it proves annoying in practice.

---

## 3. Technical Approach

### 3.1 Stack

TypeScript end to end.

| Piece | Choice |
|---|---|
| Front end | Vite + React + TypeScript |
| Delivery | PWA, installable to the iPhone home screen, full-screen without Safari chrome |
| Styling | Tailwind |
| Animation | Framer Motion — card deal/play feel is most of the perceived quality on a phone |
| Rules engine | Standalone TypeScript package, no UI or I/O dependencies |
| Server (networked version only) | Cloudflare Workers + Durable Objects |
| Static hosting | Cloudflare Pages |

**Phone-first.** The primary target is iPhone Safari. Layout, tap targets and card
legibility are designed for a phone held in one hand; desktop is a scaled-up bonus, not
the design target.

### 3.2 Shared Rules Engine

The single most important structural decision. One engine module implements deal, draw-turn
legality and resolution, auction legality and closure, trick-taking, and rubber scoring —
with no knowledge of UI, network or storage.

It runs in two places:
- **In the browser** for the robot game, where it is the whole game.
- **On the server** for the networked game, where it is the authority.

This is the main reason to choose TypeScript over any other stack: the rules exist once,
not twice, and the two versions cannot drift apart.

The engine must expose a strict notion of a **player's view** of the game state — the
filtered projection described in §1.4. Both the bot and the network serialization consume
that view rather than the full state, which makes hidden-information leaks structurally
difficult rather than merely discouraged.

### 3.3 Server Design

- One Durable Object per table, addressed by the invite code. This maps exactly onto the
  problem: a table is a small, long-lived, singly-addressed piece of state.
- Durable Object storage persists table state, so **an in-flight rubber survives a deploy or
  a restart**. This matters given a rubber can run 45 minutes.
- **Use the WebSocket Hibernation API.** An idle table — one waiting on a player who is
  thinking, or briefly disconnected — is billed no duration at all under hibernation. Holding
  sockets in a normally-running object would burn wall-clock compute for no reason.

### 3.4 Hosting and Cost

Cloudflare's free tier covers the expected usage (family play) with a very large margin.
Verified against current Cloudflare documentation:

- Durable Objects are available on the Workers **Free** plan, SQLite-backed storage only,
  which is what this design uses regardless.
- Free plan allowances: 100,000 requests/day, 13,000 GB-s/day compute duration, 5 GB
  storage, 100,000 storage writes/day. Cloudflare Pages serves the static PWA free.
- Inbound WebSocket messages bill at a 20:1 ratio; outbound messages and protocol pings are
  free. A deal is roughly 70 inbound messages (26 draw turns, ~15 calls, 26 cards), so a
  five- or six-deal rubber bills as roughly **20 requests**.
- Duration is the only allowance worth designing around, and hibernation reduces idle cost
  to zero. Even without hibernation the free duration allowance would cover roughly 35
  rubbers a day.

Sources: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Deliberately avoided: free tiers that spin down on idle (e.g. Render's). Cold starts drop
WebSockets, which is fatal for a live game.

### 3.5 Build Order

1. Rules engine, with unit tests — draw, auction, play, rubber scoring. Headless.
2. Robot version end to end: UI, one heuristic bot, playable on the phone. Ships standalone
   with no server.
3. Networked version: Durable Object, invite links, reconnection.

Nothing about phase 3 blocks phases 1 and 2, and the game is fully playable after phase 2.

### 3.6 Development and Testing

Development happens on Windows, in desktop Chrome. An iPhone is not needed for day-to-day work.

**Normal loop**
- Vite dev server with hot reload; Chrome DevTools device toolbar set to an iPhone preset for
  correct viewport dimensions and touch event emulation.
- Two-player networked testing: one normal Chrome window plus one incognito window. Separate
  `localStorage` means separate tokens, so they are genuinely two seats rather than one player
  twice.
- Rules engine is headless and unit tested, so the bulk of the game logic needs no browser at all.

**What desktop Chrome cannot verify.** Chrome's iPhone emulation changes the viewport, not the
rendering engine — iOS Safari is WebKit, not Blink. The following are only answerable on a real
device, and there is no Safari on Windows to substitute:
- Safe-area insets around the notch and home indicator.
- Viewport height as the URL bar shows and hides (use `dvh`, not `vh`).
- Scroll rubber-banding, tap highlight, and general touch feel.
- Hit-target sizing and whether cards are comfortably tappable one-handed.
- PWA installation: home-screen install, standalone display mode, splash screen, status bar styling.
- Background suspension dropping the WebSocket — which is the exact behavior §2.2's reconnection
  design exists to handle, and which desktop Chrome will not reproduce.

**Required tooling for the above**
- A **dev-only control that force-drops the WebSocket**, so reconnection is exercised deliberately
  rather than assumed to work. This is not optional; it is the only way to test the reconnect path
  on a schedule.
- A **dev-only "skip phase" control** that plays whatever phase is in progress out at once, and
  stops when the deal moves on. Twenty-six draw turns and thirteen tricks are the game, and they
  are also the wrong thing to sit through on the way to checking something in the scoring for the
  tenth time — the more so since a rubber runs several deals. It drives the ordinary `applyAction`
  path with both seats decided at random, so nothing about the rules is bypassed and the results
  are ordinary legal results.
- **The dev controls ship in the deployed build, switched off.** Compiling them out was tidy and
  wrong: the phone is where the game is actually judged and where a deployed build is the only way
  to reach it, so the shortcuts were unavailable exactly where they were most needed. They are
  turned on in **Settings**, reachable from every screen, and the choice is remembered — an
  installed PWA launches at its start URL with no query string, so a URL flag alone would not
  survive installation. `?dev=1` still works and wins over the stored value, for the case where
  reaching Settings is itself the thing being tested.
- **Settings also carries the build stamp** — the commit it was built from and when, with a
  trailing `+` when the tree had uncommitted changes. From a phone there is otherwise no way to
  tell a fresh deployment from a service worker still handing back the last one, which turns every
  "did that change land?" into guesswork.

  This is safe to ship because these controls cannot reveal anything a player is not entitled to
  see: they decide both seats at random through the ordinary `applyAction` path, fast-forwarding
  the game rather than opening it up. It stays safe in the networked version because the server is
  the authority there (§2.2) and would simply refuse a client-side skip — which is the test of
  whether a control like this is acceptable at all.
- On-device access: `vite --host` and browse to the PC's LAN address from the phone (needs a Windows
  Firewall allowance). Service workers require HTTPS, so testing the *installed PWA* specifically
  needs an HTTPS tunnel such as `cloudflared`.

**Real-device checkpoints.** Two planned, rather than continuous device testing:
1. Before the phone layout is locked down (end of phase 2).
2. Once networking works, to validate reconnection against real iOS backgrounding (end of phase 3).

---

## 4. Out of Scope for v1

- Bidding conventions and alerting (meaningless without a partner — see §1.5).
- Defensive carding signals, for the same reason.
- Claiming, conceding, undo.
- Accounts, authentication, cross-device seat recovery.
- Public lobby, matchmaking, spectators.
- Ratings, standings, game history, hand records.
- Turn clocks.
- Player-selectable robot difficulty.
- Native App Store distribution. (Expo/React Native is the alternative route if this ever
  becomes a requirement; it costs web polish and build complexity now for a maybe later.)

---

## 5. Open Questions

1. **How much should the bot be allowed to remember?** Decided that discards are not shown
   (§1.4), which makes recall part of the game and hands a perfect-memory bot a real edge.
   Whether v1's bot has full recall, or is deliberately given a lossy memory of the cards it
   has seen, is open — see §2.1. Best answered by playing against it.
2. ~~**Robot bidding approach.**~~ **Settled, and not the way it was framed.** Point counting is
   a tool for finding a *partnership* fit — it answers "how much do we have between us". With no
   partner there is nothing to add up: a bid has to be supported by thirteen cards alone. So the
   bot counts **playing tricks** instead (trump length plus winners in the side suits) and bids the
   most it expects to take.

   Counting winners under-predicts badly, because it credits only the certain cards while length
   and middle cards win tricks too — the more so here, where half the deck is out of play and a
   nine is often high. The estimate is therefore calibrated against measured outcomes rather than
   reasoned about: fitted over 4000 deals, raw winners averaged 4.1 against 7.6 tricks actually
   taken. The fit is in `evaluate.ts` and **wants refitting whenever card play changes**, since it
   was measured against random play on both sides.
3. **Turn clock**, if the untimed draw phase proves tedious in practice (§2.2).
