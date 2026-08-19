# Honeymoon Bridge — Requirements

A two-player contract bridge variant, playable in a phone browser. Two versions: a
single-player game against a computer opponent, and a live two-device game over a network.

Status: both versions are built and deployed. This document stays the source of truth for the
rules and the product decisions, and records why as well as what — several of the decisions are
deliberate and counter-intuitive, and a few have been reversed with the reasoning kept rather than
tidied away. Open questions are collected at the end.

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

There is one optional house rule that changes this phase — the open discard, §3.6b — which is off by
default. Everything above is the game; that is a variant of it.

### 1.3 The Draw Screen

The draw phase is 26 turns of the same decision, so the screen it happens on carries most of the
game's feel. What follows is a layout requirement, not a styling one — each element earns its place
by making a rule visible.

Top to bottom: **the opponent's hand** as a face-down row that grows a card a turn, with their name,
turn state and what they last did on one line beneath it; **the stock and the discard pile** across
the middle, each at full card size with its count printed across it; **the cards this turn offers
you**, of which you take one; **your own hand** along the bottom, visible at all times, because every
draw is judged against what you already hold.

**The opponent's name used to be on screen twice in adjacent bands** — once as a seat label, once as
the subject of the sentence under it. The label now keeps what a sentence cannot say, whose turn it is
and whether they are vulnerable, and the sentence finishes it as a clause.

**Shrinking the piles to buy that height back does not work, and was tried.** A compact strip — a
small stack with the number beside it — reclaims about 120px for the choices below, on the reasoning
that the deck's count is derivable from the turn track and the opponent's hand row anyway. It reads
worse: the count printed across the card is the thing you actually look at, and at a third the size
there is nowhere to print it. The piles stay full size.

**The choice is those two cards, not a pair of buttons.** It was keep and reject as two full-width
buttons, which stated the rule correctly and left the player to translate it: *reject* is a word
that has to be turned back into "and take an unknown card instead" every single time it is read. A
turn spends two cards and yields one, so what is actually being decided is **which of the two goes
into the hand** — one that can be seen and one that cannot. Two cards side by side, one face up and
one face down, is that sentence as a picture. Tapping the face-up card keeps it; tapping the
face-down card takes it sight-unseen. Nothing needs translating, and the gamble looks like a gamble
instead of being described as one.

The cost is a smaller target than a full-width button, on a decision that is final and has no
confirmation step, and it is paid rather than dodged: the pair is drawn at the largest card size in
the app, each card's tappable area is padded past its edges, and each is labeled underneath with
what taking it does. The face-down card is kept clear of the stock, which is the other face-down
thing on the screen and must never be what a thumb finds first.

**The pair is yours, and only ever yours.** A single shared pair whose ownership followed the turn
was tried first, on the reasoning that the opponent is visibly taking the same decision you take.
With the computer's cards showing it read instead as a card of theirs turning up in your slot, told
apart from your own by nothing but a colored outline — and in a card game *position* is what says
whose a card is, so position was saying nothing. **The computer gets a pair of its own**, under its
own hand, and yours stops being lent out.

Theirs appears only while its cards are being shown, and is drawn smaller than yours. Both follow
from the same fact: it is an aid to watching the computer rather than a part of the game, so
reserving a strip of a phone screen for two unreadable face-down cards would charge every deal
anybody plays for it. The difference in size is not decoration either — it says whose pair is whose
a second time, in the way that survives being glanced at.

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
what you just chose. Both leave from the pair rather than from the stock — they are already on the
table, so the animation is that pair resolving rather than two cards arriving from somewhere else.

- **The opponent's turn is not animated, unless their cards are showing.** It was, once, with a
  beat first so their card 1 could be told from card 2 — the reasoning being that destinations
  carry the choice. In the hand it read as ceremony. Their hand grows by one either way, the deck
  drops by two, and a line of text says what they did in words; two face-down cards traveling added
  none of that and cost about a second on each of their thirteen turns, on the phase whose open
  question is whether it drags. It is now a pause long enough to register, with something visibly
  moving so the game does not look stopped.

  **With the setting that shows the robot's cards turned on, their turn plays out exactly as yours
  does.** This is the same test rather than a hole in it: the animation was cut because it carried
  no information, not because motion is bad. With their cards visible it carries plenty — card 1 is
  face up in the pair, card 2 stays hidden until they commit just as yours does, and watching which
  one they took is watching the decision instead of being told the result afterwards. Motion that
  carries information earns its second back, and somebody who turned that setting on turned it on
  to watch. The commentary line goes back to naming the choice rather than the two cards, which are
  now on the screen anyway.
- **The player's own turn keeps its animation**, because it is doing work nothing else does: it is
  what shows you card 2 on a keep, which the rules require.
- **Both of your own cards are shown face up**, and on a keep, card 2 turns over in place and is
  held long enough to read before it goes to the discard. This is required, not decorative: §1.4
  has you look at both cards on every turn, and the 13 cards you keep plus the 13 you throw away
  are the 26 you are entitled to have seen. A UI that skips card 2 silently deletes half of what
  you are supposed to be remembering.
- **Neither seat's card 1 is turned over until the board is still.** The rules engine hands a player
  card 1 the instant the other's turn resolves, but that turn is still playing out on screen.
  Showing it early steps on the animation and invites a decision taken while you are still being
  told what just happened. Yours stays face down, and neither of your cards can be tapped, until
  the table settles.

  **The computer's card 1 obeys the same rule**, and the first build of its pair broke it: its card
  turned face up the moment you tapped, so the card you were about to read appeared over the top of
  your own two still travelling to your hand and the discard. It follows that the computer also
  waits a beat longer than the animation before it moves — a card that turns over and leaves in the
  same instant was never shown at all, and showing it is the entire reason its pair is on the table.
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
- **A player's own discards are seen once and never again.** Each is seen at the moment of the
  turn that throws it away — §1.3 requires that, or the player has not in fact looked at both
  cards — and that is the whole of it. There is no discard list, no history, and no way back to
  any of the thirteen; the app shows the current hand and nothing else. Recalling them is the
  player's own problem. Memory is deliberately part of the game.

  The turn just played *could* be called back up for a while, on the reasoning that the reveal is
  a card in motion and can be missed. It went unused in practice, and the reason it did is worth
  keeping: card 2 no longer flies past on its way somewhere: since the pair sits on the table, it
  turns face up where it already lies and is held there to be read. The recall was covering for a
  reveal that was easy to miss, and that reveal was fixed rather than compensated for.

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
- **Every deal is played out to all 13 tricks, unless it is claimed.** No conceding, still, and no
  undo.
- **A claim declares every remaining trick, on the claimant's own turn, and is symmetric — either
  side, not just declarer.** This reverses §4's original "no claiming," once what changed since
  that call underneath it became clear: a claim in the traditional sense needs dummy on the table,
  since that is what lets the defense check it before agreeing, and this game has no dummy — both
  hands stay concealed until a deal ends on its own. So a claim reveals the claimant's *own* hand
  instead, the moment it is offered, and that hand stays visible for the rest of the deal whichever
  way the answer goes. That is the whole cost of a claim that does not land, paid regardless of
  whether the claim was actually right.

  Full claims only — "I take everything left from here" — never partial, and confirmed by a second
  tap before it is sent: nothing else in the game commits to exposing a concealed hand, so nothing
  else needs that guard as much as this does.

  Against a person, accepting or denying it is their own judgment call, deliberately not refereed
  by software — reasoning about what is left from what has already been seen is the skill this
  game is built around, and a solver deciding it would take that away at exactly the moment it
  matters most. Against the computer, the double-dummy solver (§2.1, `bot/solver.ts`) decides it
  instead, and is never wrong: once a claim has revealed the hand there is no hidden information
  left in the position, which makes this the same kind of question honors or auction legality
  already are — a rule to get right, not a skill to play at a level. No difficulty setting touches
  it.
- **A finished trick is swept toward whoever won it**, then it is gone. The engine resolves a
  trick the instant the second card lands and hands the lead to the winner, so without this the
  trick you just lost would be replaced by the next card before you had read it. The direction of
  the sweep is what says who took it.
- **The thirteenth trick gets the same ending as the other twelve.** The deal is complete the
  instant the last card lands, so the scorepad used to arrive on top of a trick that had not been
  collected yet — and the trick that decides whether a contract was made is the one most worth
  watching. The board therefore holds the play screen for exactly as long as a trick takes to
  collect before the score replaces it.

  This is the same mistake as the one §1.3 fixes at the end of the draw, in the same place: a phase
  ends on a beat the engine has no reason to wait for, so its last turn is the one turn nobody sees.
  These are now one rule — the phase being *shown* lags the phase the engine is in by the length of
  whatever it was still animating — and anything that ends a phase on an animation belongs there
  too rather than in a third special case.
- **The closed auction is held until it is dismissed, rather than for a set time.** An auction
  settles on the call before the final pass, and the play screen used to replace it in that same
  instant — taking the record of how it got there with it. The contract itself survives in the top
  bar for the whole of the play; the *sequence of calls* does not, and that is the only thing that
  says why the contract is what it is.

  This is the rule above with the budget taken out of it. A trick being swept and a card 2 being
  read have a natural length and can therefore be waited out; a closed auction has none, so any
  delay would be a number picked out of the air — and a delay long enough to study an auction is
  one nobody would sit through on every deal of a rubber. It is dismissed by hand instead, with a
  control that reads as starting the play rather than as closing a dialog, because what comes next
  is the opening lead and the lead is made by the **non-declarer** — the rule here people most
  reliably have backwards.

  **The opponent is not held along with it.** Over a network there is no way to stop the other seat
  leading while this sits on somebody's screen, so the computer is not stopped either. The hold is
  one seat's screen lagging its own game, exactly as at the end of the draw, and not a pause in the
  deal: a lead already on the table when the screen is dismissed is the correct outcome, and it is
  the same outcome in both versions.

  A deal passed out needs none of this. It completes rather than going to play, and the screen that
  says so is already dismissed by hand.
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

**Winning the rubber and being ahead in it are two different questions, and this app answers
with the second.** Two games ends the rubber and hands out its bonus to whichever side got
there — there is no other sensible stopping rule, and nothing above changes it. But which side
the app calls the *winner* is decided afterward, by comparing the two final totals with that
bonus already folded in, not by which side reached two games. The two agree almost every time,
since the bonus is large enough to cover an ordinary deficit — but a side that spent the rubber
defending well enough to bank a stack of undertrick penalties, or was dealt the honors, can
outscore a side that quietly closed out two games, and when that happens the higher total is the
winner even though the other side ended the rubber. This can happen on a clean two-games-to-none
sweep, not only a narrow two-to-one. A tie in final points — which needs the two totals to land
on the exact same number — falls back to whichever side reached two games, since a winner still
has to be named. This is the rule a finished rubber's win/loss is recorded by, in §3.7's record and
in the game's own "you won" screen alike; both read the same field.

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
below the line count toward a game, and a scorepad that adds them into a single figure hides the
distinction the whole rubber turns on.

**Honors** — in scope.
- **100** for four of the five trump honors (A K Q J 10) in one hand.
- **150** for all five trump honors in one hand.
- **150** for all four aces in one hand at no-trump.
- Scored by whichever player holds them, declarer or defender alike.
- The engine detects and awards honors automatically at the end of the deal; nobody has to
  announce holding them, the way honors are traditionally claimed. (A trick claim, §1.6, is an
  unrelated thing despite the shared word — this is about points for a holding, that is about
  who wins tricks not yet played.) Honors will be rarer than in normal bridge, since half the deck
  is out of play.

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

**Bidding** (`heuristicBot.ts` and `bidValue.ts`) — price every legal call in *points* and take the
best one, if it beats the price of passing. A candidate contract is played out at each plausible
number of tricks, scored by the engine's own `scoreDeal`, folded into the rubber with
`applyDealScore`, and what comes back is how far the standing moved. So the bidder never restates
a scoring rule and cannot drift from the one the deal is settled by.

It asked "can this hand take this many tricks" until it was measured, and that is the wrong
question in two directions: it cannot see that the contract finishing a game is worth far more than
the trick reaching it, nor that going down 100 to deny 500 is a good result. Both are invisible in
tricks and obvious in points. Stretching for game, sacrificing, doubling, and declining to jump to
the top of what the hand can make all stopped being rules and became consequences of the one
comparison. It still never redoubles.

Two numbers carry it, both fitted against par: what this hand takes *declaring* a strain, and what
it takes *defending* against one. The second is what prices passing, and without it the bidder has
no way to judge letting them play — assuming they simply make what they bid drives both sides into
a bidding war neither can win. Worth **+464 points a rubber** over the bidder it replaced, measured
over 1000 rubbers with the seats exchanged.

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

**Card play, the second implementation** (`samplingBot.ts`) — every one of those rules is an
approximation of a question that is directly computable once both hands are known, so rather than
sharpen the approximations this guesses the hand it cannot see, many times over, and solves each
guess exactly with `solver.ts`. A card that wins tricks across most plausible hands is the card to
play. This is why the game is two-handed rather than four: one opponent and no partner make a
double-dummy solve small enough to run twenty-five times per card in a phone browser, and remove
most of the usual objection to the technique, which is that each guess assumes the opponents can
also see everything.

Measured, it roughly halves what the bot gives away on defense and wins head-to-head by about 37
points a deal, and it is **what the game against the computer now plays**. The sample count is both the cost and
the difficulty lever, which is a better lever than
heuristic weakness: fewer samples make an opponent that is unsure rather than one that is wrong on
purpose, which is the shape the difficulty question below actually wants.

- **Bot memory is built, and it pays in card play rather than in the draw.** The bot is given the
  cards it threw away — explicit state handed to `chooseDraw` and `choosePlay`, never read from
  engine state, so a forgetful opponent is a matter of passing less. In the draw it is worth
  nothing measurable: 0.6% of decisions change and hand quality moves not at all. In card play it
  is worth 13% of everything the bot throws away, because there the discards are not a bias in an
  average but cards the opponent provably cannot hold.

- **Bot memory is a tunable, not a given.** Since discards are not displayed back (§1.4), a human
  will forget some of the 13 cards they discarded and the bot would otherwise never forget
  any of them. Perfect recall is therefore a genuine advantage the bot gets for free, and
  imperfect recall becomes a legitimate difficulty lever alongside play strength. The bot
  interface should treat "what this bot remembers seeing" as explicit state it is given,
  not as something it reads from the engine directly.

### 2.2 Human vs. Human, Networked

- Two players on two devices, **both live and connected**. Not asynchronous or
  correspondence play.
- **Table creation, two ways.**
  - **An invite**, which is the way to reach *one particular person*: a player creates a table,
    gets a short link, and sends it however they like. The second player opens it and is seated.
  - **A queue**, which is the way to reach *anybody at all*: both players ask for a game and are
    put together. This was originally deferred — the section read "no public lobby, no
    matchmaking, no discovery", with a quick match queue named as a possible later addition — and
    it is now built. Invites did not go away; they answer a different question.

  The queue is a single Durable Object that holds **no state of its own**: who is waiting is
  whoever currently has a socket open to it. Leaving therefore needs no message and no timeout,
  and a place in the queue cannot outlive the person standing in it. It will not pair somebody
  with themselves — the token catches two tabs on one device, and the account catches the same
  person on two devices.

  There is still **no discovery**: nothing lists tables, nothing lists players, and a code is only
  useful to somebody who was sent it. The queue is the one place two strangers can meet, and
  reaching it costs an account. That is less a doorman than a receipt — there is still no chat and
  nothing to steal — but it does mean everybody standing in the queue is a person rather than a
  browser, which is what makes the result of the game worth recording.
- **Identity: an account to sit down, a device token to hold the seat.** Playing against another
  person requires being signed in — §3.7. The opaque token in `localStorage` still *holds* a seat
  and reclaims it on reconnect, because possession belongs to the browser actually sitting there,
  but who the seat belongs to is the account, and the name across the table comes from the account
  rather than from whatever the device was calling itself.

  This bullet has now said three different things. It first read "no accounts, no passwords, no
  email"; then accounts existed and were strictly additive; now they are required to play a person.
  Each reversal had the same cause, reached more slowly than it should have been: a record of how
  you do against the people you play cannot be assembled out of browsers, and a record most games
  are missing from is not a record. The game against the computer still needs no account, no server
  and no network at all.

  Accepted trade-off, unchanged by any of that: a rubber is bound to the device that started it.
  Clearing browser data or switching phones mid-rubber forfeits the seat, and an account does not
  yet move a game in progress between devices.
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
- **Leaving is the way back, not a preference.** The exit sat at the bottom of Settings for a
  while, which was wrong twice over: Settings is a list of things to *change* and every other row
  in it is a toggle, and nobody hunting for the way out of a game opens a gear icon to find it. It
  is a back control in the top left of the board now, where a phone puts the way back from
  anywhere. This holds in both versions — the game against the computer is left the same way.

  Because that makes it easy to hit, it **asks first**, and the confirmation names what is actually
  lost. That differs by version, so the words come from whoever set the game up rather than from
  the board, which deliberately does not know where it is running: against the computer only this
  browser's deals go, while at a table somebody else is sitting there and their match ends too.
  The one thing the old warning never said is the one thing worth saying.

  It stops asking once the match has been won. There is nothing left to lose by then, and a
  confirmation that guards nothing only teaches people to tap through confirmations.
- **A won match offers to stop, not only to go again.** It used to offer a new rubber and nothing
  else, so the only ways to say *that was the last one* were the buried exit or closing the tab.
  Another match stays the weighted choice — with family, one more is usually the point — with
  **Done for now** beside it, unconfirmed, since the result is already recorded.

  **Leaving a finished match is declining a rematch, not abandoning one**, and the other player is
  told so. The seat empties identically either way, so the difference is read from whether the
  rubber was complete; without that, somebody who had just won would be told their rubber ended
  with nowhere to keep it, which is both alarming and untrue.
- **Waiting to continue is stated from both sides.** Moving on from a finished deal takes both
  players, so one of them is always waiting on the other, and only the waiting half was ever shown
  — the player being waited *on* saw an ordinary scorepad with no sign that anybody was sitting
  there. Both seats' readiness is already on the wire; it just had to be said.
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
| Accounts, and later results | Cloudflare D1 (SQLite) |
| Transactional email | Resend |
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
- D1 is on the free plan as well: 5 GB storage, 5 million rows read/day, 100,000 rows
  written/day. Accounts cost a handful of rows per sign-in and one row read per session check,
  which does not register against any of those.
- Resend's free plan sends 3,000 emails a month, capped at 100 a day, from one custom domain.
  A sign-in link is sent once per device rather than once per game, so the daily cap is the only
  one that could ever bind, and only if something were wrong.

Sources: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

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
- **Where a sign-in link opened from Mail actually lands.** Checked, and the answer was the wrong
  place: iOS opens it in the default browser, and an app on the home screen has storage of its own,
  so the session arrives somewhere the app cannot see it. §3.7 now sends a typed code instead, and
  sends no link at all to an installed app. Worth restating as the general lesson rather than the
  specific bug — **anything that leaves the app and comes back cannot be assumed to come back to
  the same app**, and desktop Chrome will agree that it does every single time.

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
- **A dev-only way to obtain a session without email.** Two-player testing is one normal window
  plus one incognito window, and incognito discards its session every time it closes — so once
  playing a person requires signing in, the ordinary loop costs an email round trip per window per
  run. That would tax every future change to networked play, not merely the change that introduced
  the gate.

  **This is the one dev control that does not ship,** and the paragraph above says why without
  meaning to. A shortcut is safe in a deployed build when the server would refuse it regardless;
  the server cannot refuse this one, since honoring it is the entire point. So it fails the test
  the other controls pass, and is compiled out of the client *and* refused by the server outside
  the development environment — two independent conditions, because one of them will eventually be
  got wrong. The client's condition is `vite dev` rather than a setting, so testing from a phone
  over the LAN still has it while a deployed build never does. Sign-in on a real device is
  therefore always met the way a player meets it.
- On-device access: `vite --host` and browse to the PC's LAN address from the phone (needs a Windows
  Firewall allowance). Service workers require HTTPS, so testing the *installed PWA* specifically
  needs an HTTPS tunnel such as `cloudflared`.

**A script is not a browser, and saying "verified" on the strength of one is a mistake this project
has already made.** `curl`, Node and PowerShell send the request you asked for. A browser sends a
preflight first, refuses to attach headers it was not given permission for, and enforces an origin
policy none of those tools have. Sign-in shipped with `Authorization` missing from
`Access-Control-Allow-Headers`: every script passed, and in Chrome the session check never left the
page — so signing in appeared to work and the app still could not tell who you were. Anything
touching CORS, cookies, storage or the service worker is only tested once it has been done in a
browser.

**Real-device checkpoints.** Two planned, rather than continuous device testing:
1. Before the phone layout is locked down (end of phase 2).
2. Once networking works, to validate reconnection against real iOS backgrounding (end of phase 3).

### 3.6a Match Length

A sitting runs to a **rubber** by default — best of three games, as §1.7 describes — or to a
**single game**, ending the moment somebody first reaches 100 below the line. A rubber is the game
this was built to play; a single game exists because a rubber runs the better part of an hour and
not every sitting has that in it.

**A single game pays 300.** Rubber bridge has no bonus for winning a *game* — its 700/500 is
specifically for taking the rubber — so a single game played by the rubber rules would end with no
bonus at all and be settled on trick points alone. The 300 is Chicago's non-vulnerable game bonus,
and it is the one convention here borrowed from another form of the game. Everything else is
unchanged: the same trick values, the same part-scores accumulating to a hundred, the same line.

**Nobody is ever vulnerable in a single game**, and this is the substantive consequence rather than
a detail of the implementation. Vulnerability is having won a game, and in this format winning a
game ends the match — so every deal is played non-vulnerable, and the doubled vulnerable penalties,
the vulnerable slam bonuses, and the whole pressure of being vulnerable while the opponent is not
simply never arise. A shorter match is also a flatter one.

**At a table with somebody else, the shorter format wins.** Each player has a preference; if either
wants a single game, that is what is played. Deliberately not symmetric: somebody who wanted one
game and is held in a rubber owes the best part of an hour they never agreed to, while somebody who
wanted a rubber and gets a game can simply play another. The two mistakes are not the same size.

This also means the queue needs no matching on length — a table settles it once both seats are
filled, so nobody waits longer to be paired for the sake of it.

The preference is read **when a match starts** and never again. Changing the setting cannot move
the goalposts on a sitting under way, and a player reconnecting mid-match carries no authority over
it.

### 3.6b The Open Discard — a house variant

**Two cards by default, and two cards is the game.** §1.2 is the rules; this is an alternative
chosen from Settings, and it changes the draw phase rather than dressing it up. Every number ever
measured in here was measured under the base rules, so a variant that quietly became the default
would make all of them describe something else.

**Settings calls it "Draw style", and offers two cards or three** rather than naming the mechanic.
A turn offering three cards is what a player experiences; the top of the discard pile lying face up
is the rule that produces it, and the engine's flag is named for the rule (`openDiscard`). The same
split the match format already uses, where the row says "Match length" and the type says `rubber`.
It is a choice rather than a toggle for the same reason that one is: "take their discard, off" leaves
the reader to work out what off does.

**The rule.** The top of the discard pile lies face up. A turn therefore offers three cards and
takes one: card 1, face up, as always; card 2, still sight-unseen; and the top of the pile. Whichever
is taken, the other two go to the pile — so a turn that takes off the pile throws **both** its own
cards, and the pile still nets exactly one card a turn, minus the one lifted off it and plus the two
laid on top. Two cards leave the stock every turn either way, and the deck still exhausts exactly on
turn 26 with thirteen cards in each hand.

**§1.2's central tension is untouched.** Card 2 is still drawn only after the decision is committed,
so rejecting it is still a genuine gamble on a card nobody has seen. What the variant adds is a
priced alternative to that gamble rather than a way out of it — and card 2, when it is thrown away,
is still turned over and held long enough to read, exactly as §1.3 requires of a keep.

**The card on offer is always the opponent's own last discard.** Not a pile to rummage through: turns
strictly alternate and every turn ends by covering the pile with a card the acting player threw, so
what is face up on your turn is never your own throw. That is the whole point of the variant, and the
reason it exists.

**Why it exists: the draw phase has no interaction in it.** A turn spends two stock cards whichever
card is taken, so nothing either player does changes what the other is offered. Twenty-six of a
deal's fifty-two decisions — and most of its playing time — are two games of solitaire running side
by side, with the only lever a keep-or-reject against a pool of twenty-six cards nobody has seen.
With this on, the card you throw away is a card they may pick up. Rejecting a good card stops being
free, and keeping a card you do not want in order to deny it becomes a real move. Neither is
reachable under the base rules.

**The pile is adversely selected, and readably so.** A card somebody *rejected* is a card they judged
worse than an unknown one — suspect, possibly bait. A card thrown as card 2 off a keep is forced and
random, and can be excellent. The draw screen already says which of the two happened on every turn,
so telling them apart needs no new information.

**What it costs, which is not settled.** You now see the opponent's discards as they cross the top of
the pile, so a player who remembers all thirteen ends the deal knowing their hand exactly. A person
will not manage that and the memory is one §1.4 already wants to reward. **A bot would manage it
trivially**, which is what finally turns §2.1's forgetting lever from something available into
something that has to be built. For now the computer is handed no more recall than before: its own
discards, and nothing it merely watched cross the pile.

**All three choices sit in one row, and the pile is the third of them.** §1.3's founding argument is
that the choice should be the rule as a picture rather than a description of it — which is why it is
cards rather than buttons. "A turn offers you these cards and you take one" is three cards abreast,
so on a three-card draw the discard pile leaves the stock's side and takes the third place in the
choice row, at the same size and in the same shell as the two cards beside it.

**The pile itself moves, not a copy of its top card.** A copy would have to fly back to the pile
every time it went untaken — thirteen round trips a deal, animating a card that never moved. Any
layout that draws the card somewhere it is not has to lie about where it goes when it is refused.
Moving the pile keeps the card where it actually is, and keeps the pile's thickness, which is both
the discard count §1.3 asks for and the thing that says *this one is not from the stock*.

This overrules §1.3 on where the pile sits, and on that section's own terms: it put the pile beside
the stock "the way a stock and a waste pile sit side by side on a real table," and gave as the reason
that neither is a tap target so proximity could never be read as a choice. Under a three-card draw
that reason is gone. On a two-card draw the pile is only scenery again, and goes back beside the
stock.

**The row runs "Last discard", "Face up", "Unseen"** — their discard, then this turn's face-up card,
then the blind one at the far end. The two cards you can actually read sit together and the gamble is
at the edge. It ran face-up, unseen, pile at first, which put the one card carrying no information
*between* the two carrying all of it, so every turn the eye had to jump a card back to make the only
comparison there is.

**The discard is the first of the three to be shown, not the last.** It is not being dealt — it has
been lying on the table since they threw it — so it turns face up the moment the turn is yours, and
this turn's own two cards fly in from the stock beside a choice already on offer. It had been gated on
the same flag that gates tapping, which held it back until after the cards it competes with had
landed. Tapping still waits for the board to finish dealing; being *visible* does not.

**The cards are labelled for what they are, not for what taking them does** — "Last discard", "Face
up", "Unseen". "Discard" on its own is a trap worth recording: under a card you can tap it reads as a
verb, and tapping this one does the opposite of discarding. The row itself now says *take one*, so three labels each repeating the verb would be saying
it a fourth, fifth and sixth time in the space where the words have to fit under a 64px card. The
pile keeps a label even when it is not takeable, unlike the two cards: they belong to this turn and
are gone by the next, while the pile is a standing object and wants saying what it is.

**Every card this turn can be spent on also carries an amber edge while the decision is live.** With
the choices in one row this is no longer what tells them apart from the scenery; what is left for it
is the other half of the job — saying the board has settled and the turn is yours, which the row's
existence cannot say. Amber because the app already spends amber on one idea only, "it is your move,"
and this is that idea pointed at a card.

**What the computer chose is shown, not only stated.** Under the base rules their turn is
deliberately not animated (§1.3): two face-down cards travelling say nothing the line of text does
not, and cost a second on each of their thirteen turns. That reasoning does not survive the third
choice — **when they lift a card off the pile, the card that moves is face up and one you have been
looking at.** So that turn alone animates: the card travels from the pile to their hand, and the
commentary names it outright ("*Bobby Orr* took your ♠Q") while the reveal is still theirs. It is
the only moment in the whole draw when you learn a *particular* card in the other hand, and it was
previously a sentence in small grey text that vanished on the next turn.

**The three choices turn face up together.** The pile's top card is shown face up exactly while
there is a decision to make with it, which is the rule card 1 already follows — neither is turned
over until it is this seat's to act on. That also fixed a blink: the top was previously hidden only
while a turn *played out*, and the pause before the computer moves is the same length as that
playout, so the card you had just thrown turned face up and was covered again inside a frame.
Nothing is lost by hiding it in between, since the top of the pile between your turn and theirs is
your own discard from two seconds ago, and the lift animates it face up if they take it.

The cost, which is a real one and not yet judged: you do not get to watch them consider the card
sitting there. Restoring that means holding the top's *previous* value through a turn rather than
hiding it, and giving the computer a beat before it acts — which lengthens every one of its thirteen
turns on the phase whose open question is whether it drags.

The other two choices stay words, with the choice picked out rather than left to be read. That
asymmetry is deliberate: kept-the-face-up-card and took-the-unseen-card both put an unknown stock
card in their hand and differ only in what it hints about their judgement, so giving all three
outcomes equal weight on screen would spend the phase's attention on the two that carry least.

The named card obeys the same rule as every other reveal — it plays once, at the moment of the turn.
Once you draw again the card is no longer sent at all and the sentence goes back to being general;
remembering it is your problem, as §1.4 intends.

**Read when a match starts and never again**, exactly like the match length above. The rules travel on
the deal and are carried forward by `nextDeal`, so changing the setting cannot alter a sitting under
way, and every deal of a rubber is played under one game.

**Not offered in a networked game yet.** It is a local preference and a table would have to negotiate
it between two seats the way `formatFor` negotiates length. The engine and the wire shape both carry
it; nothing on the server turns it on.

### 3.7 Accounts and Sign-in

Listed as out of scope for v1 (§4) and built anyway, because the thing actually wanted — *how do I
do against each of the people I play* — cannot be built without it. A record has to attach to a
person, and a `localStorage` token is a browser rather than a person: it dies with cleared site
data and does not follow anyone to a second device.

**An account is required to sit down with another person.** This reverses the rule the section was
built around — *an account never gates a game* — and the reversal is the substance of it rather
than a detail. A record of how you do against each person you play is written at the moment the
game is played and cannot be reconstructed afterwards, so an account that is optional at that
moment yields a record that is mostly holes: most seats anonymous, a column of opponents all called
"Player", and nothing for the next game to attach to. Without the gate the feature does not
half-work, it does not work.

What the old rule was protecting is still real, and scope protects it now instead. The game against
the computer needs no account, no server and no network, and it is what somebody sees before
deciding whether this is worth handing over an email address for. Nothing gates that.

**The gate is on sitting down, not on staying seated.** A rubber runs long, and a session can
expire or be invalidated underneath one. A reconnecting player presenting a token that matches a
seat at the table resumes it whatever their session says. The alternative is that rotating a secret
or shipping a deploy takes a game away from somebody in the middle of it, which is a worse failure
than the one the gate prevents. The older sentence below — a stale session should cost somebody
their attribution, not their game — survives, scoped now to the reconnect.

**An invite costs a round trip, and that price is paid deliberately.** The old text said somebody
opening an invite should be seated in seconds rather than standing in front of a sign-up, and that
objection was not wrong; it was outweighed. This is a game for a family who play each other
repeatedly, where signing in happens once per device and lasts a year, and where wanting a record
at all meant wanting to compare it with the same handful of people. A one-time cost amortised over
years buys the thing the app is for.

The cost is real enough to design around rather than wave through. A link that arrives after the
tab it was meant for has gone is a dead end unless the destination survives the round trip, so it
survives twice over: stashed locally when the link is requested, and encoded in the link itself.
The local copy covers the ordinary case; the encoded one covers asking on a laptop and opening the
mail on a phone, where there is no local copy to find. Either way the sign-in screen says what it
is asking *for*, because joining a particular table is a different sentence from a bare email box
and the person reading it was in the middle of being invited.

**Email and a code, no passwords.** A password would mean storing a hash, building a reset flow —
which is a magic link with extra steps — and asking family to invent a password for a card game.
Email is the one identifier people can already receive something at, and what arrives there *is*
the proof: it reached somewhere only that person can read.

**The code is the credential; the link is a convenience.** It began the other way round, and a
phone corrected it. iOS gives an app added to the home screen its own storage, separate from
Safari's — so a link opened from Mail signs *Safari* in and leaves the installed app exactly as it
was, with the link then spent, because one works only once. This is not something carrying the
destination in the link can fix: the session is real and sitting in a container the app cannot see.
It was found the first evening the gate was live, on the first real device, by the person who
built it.

A code goes the other way. It is carried by the person *into* whichever app asked for it, so it
signs in the thing they are actually looking at, and it works when the mail is read on a different
device entirely. It is the same alphabet as an invite code and chosen for the same reason — read
off one screen, typed into another.

So **a request from an installed app is sent no link at all.** Offering one there is offering
something that cannot work, and the person who taps it ends up signed in somewhere they were not
using. From a browser tab both are sent, since there the link is genuinely one tap.

**Six characters is enough because a guess needs the address too.** A code is looked up by address
and code together, so it cannot be attacked without knowing who to attack, and five wrong tries
burn every outstanding code for that address. The count rises on every attempt rather than on every
failure — otherwise the cheapest attack is the one that never matches. The remedy for being burned
is asking for another, which is why this is not a lockout.

An email address and a display name are the only personal data held. No marketing, nothing else.
The address is lower-cased on the way in, so one person cannot end up with two accounts and one
confusing history.

**The name is on the account, and it is there because the alternative was showing an address.** The
accounts table was built with no name in it deliberately, and the consequence was a record screen
that identified an opponent by their email — the only place in the app where one player was shown
another's personal data, and it happened purely because there was nothing else to print. A name is
what somebody wants to be called across a table; an address is a credential that happens to be
readable. The name is asked for once, after the first sign-in, so that a person joining a table
already has one instead of being asked for it while somebody waits.

**A link works once and lasts ten minutes.** Only a hash of the token is stored, so a copy of the
table grants nobody a login. Single use is enforced by the write itself — the statement marks the
row used and requires it to be unused in the same breath, so two taps on the same link cannot both
succeed and there is no transaction to get wrong.

**Ten outstanding links per address per fifteen minutes, and forty per IP per hour.** The address
limit was five, and five was sized as a brake on an optional convenience. It is the wrong shape for
a gate: somebody who taps "send again" twice because nothing arrived would be locked out of
*playing*, not merely out of signing in, and an impatient person is not the threat. The threat is a
script, and a script uses a different address every time — so the per-address limit never protected
the send quota at all. The limit that does is per-IP, and it did not exist while exhausting the
quota only cost money. It exists now that exhausting the quota takes the app down.

Two details that were wrong at first and are worth keeping right. A link that failed to send is *deleted*, so it
does not count: the row must be written before the mail is attempted, because the token has to
exist before it can be sent, but a row for a message that never left records nothing and holding it
against the next attempt punishes somebody for our fault. And being turned away is now **said out
loud**, with how long to wait. That admits the address has asked recently, which is a small thing to
give up, and the alternative is worse — a silent refusal makes the app claim a link is coming when
it is not, which is indistinguishable from mail going missing and sent this exact feature's
debugging down the wrong path for an evening.

**A sign-in link is never logged.** A live link in the logs is a credential in the logs. One was
added deliberately for a single round of end-to-end verification and removed immediately after,
which is the only form that is acceptable.

**Signing in claims the device token rather than replacing it.** The token exists before any
account does — it is what seated the player and what any record is already attached to. An account
whose first act was to discard the history it was created to keep would be worse than no account.

**Signing out mints a new one.** Claiming a token and then leaving it in place meant the next
account signed in on that device inherited the previous one's anonymous history. That was harmless
while an account was optional and sharing a device was unusual. It is neither once every game
against a person is attributed and the device in question is the one the family passes around.

**Sessions are signed, not stored.** An HMAC over the account id and issue time, held by the
client. Nothing to look up per request and no session table to leak; the signature is what makes it
trustworthy. Sessions last a year, because signing in should be something done once per device.

The cost is that rotating the signing secret invalidates every session at once. That was accepted
when it meant everybody quietly lost their attribution; it now means nobody can play a person until
every device has redone the email round trip. It is still the only revocation mechanism there is,
and the client still drops a session the server refuses rather than carrying a string that can
never work again — but it is an outage now rather than an inconvenience, and worth knowing before
reaching for it. A game already under way is not affected, since a seat is resumed by its token.

**Asking for a link never reveals whether an address is known here.** The answer is the same
either way.

**Accounts live in D1, not in a Durable Object.** A Durable Object is right for one live table:
small, long-lived, strongly consistent, singly addressed. It is precisely wrong for "my record
against everyone", which is a query across many players and many tables — the one question no
per-table object can answer.

**Mail goes out as `play@ericonice.com`,** the domain Resend has verified. SPF, DKIM and DMARC are
published; DMARC sits at `p=none` with a reporting address, which asks receivers to report without
acting, so nothing can break while the reports are watched.

It was first written to send from `play@send.ericonice.com`, reasoning that a subdomain keeps the
game's sending reputation apart from anything the domain's owner sends themselves. That is a real
technique and this was not it: the `send.` records Resend asks for are the parent domain's return
path and SPF, not a domain in their own right, and Resend answers a `From:` on one with a flat 403.
Doing it properly means verifying `send.ericonice.com` as a domain of its own, and the free plan
verifies one. Worth revisiting only if this ever sends enough mail for reputation to matter.

**Sending failures are reported.** Every message was rejected for the first stretch of this
feature's life and nothing said so: the endpoint answered "ok" whatever happened, on the reasoning
that a uniform answer is what stops a stranger probing which addresses have accounts. That
reasoning is right about the *address* and wrong about the *server* — a refusal to send is a fault
on this side and reveals nothing, so it now returns a failure and the screen says so. Being unable
to send is not a reason to tell somebody their link is on its way.

**A seat records the account holding it, and never takes that on trust.** The session travels in
the `join` message rather than a header, because a browser cannot set headers on a WebSocket. The
table verifies the signature itself before believing any of it — a seat that merely *claimed* an
account would make the record it produced worthless, which is the whole reason for having accounts.

The name is read from that verified account too, and no longer travels in `join` beside it. It used
to, which meant a seat could call itself anything at all; the same reasoning that stops the server
believing a claimed account id stops it believing a claimed name. This also removes the several
places that separately decided what to call somebody who had not set a name, since there is no
longer any such person at a table.

What a seat is *held* by is still the device token. Signing in does not let a second device take
over a rubber in progress; that stays out of scope (§4), and keeping the two separate means the
account decides attribution while the token decides possession.

A session that fails for any reason — absent, forged, altered, or signed with a secret since
rotated — no longer seats the player anonymously. It refuses a join at a table they are not already
sitting at, and resumes the seat if they are: possession by token, permission by account. The
sentence this replaces said a stale session should cost somebody their attribution rather than
their game, and that is still the rule on the second half of it.

The queue uses the same verified account to avoid pairing somebody with themselves, and every
socket in it now carries one, so that no longer depends on the token happening to catch it. The
token still catches two tabs on one device; the account catches the same person on two devices.

**Results attach to the account id, not the email.** The id is the stable key; the address is a
property of the account that a display joins back to. Copying an address into every result would
make it a duplicate of something that can change.

**The record is its own screen**, reached from the home screen rather than shown inside Settings.
Settings is where you go to *change* something and every row in it is short and bounded; the record
grows with every person played and doubles again because rubbers and single games are counted
apart. Scrolling past a scoreboard to reach a theme switch is the wrong way round. Signed out, the
screen explains what an account buys instead of showing nothing, which makes it a reason to sign in
rather than a dead end.

**A robot rubber records which computer it was played against.** The bot is versioned from v1, and
each version carries a name shown in Settings — hockey players in alphabetical order by first name, so the
ordering is obvious to anybody reading a list of them. The name appears there and nowhere else:
across the table the opponent stays the computer, because a first name in the seat opposite
promises a personality that is not there.

This exists for the same reason accounts do. A record against "the computer" pooled across every
version there has been describes an opponent nobody ever played, and the bot changes enough between
versions to make that a real distortion rather than a pedantic one. It cannot be applied backwards:
rows written before the column have no version and never will, and null there means *before
versions* rather than *unknown version*. A report that omits the version is still accepted, because
the service worker keeps older builds in circulation and a rubber somebody actually played is worth
recording whether or not their client knew to name its opponent.

**A finished rubber is what gets recorded**, not a deal. A rubber is what people say they won;
nobody asks how many deals they have won. Only completed ones land in the table — §2.2 already ends
an abandoned rubber unscored, which also means a record cannot be improved by walking out of a game
going badly.

Each row keeps both seats twice over: the account signed in at the time and the device token. Every
networked rubber recorded from here on has both, since a seat cannot be taken without an account.
The null accounts are the ones played before the gate, and they are why the token column stays —
the token is what makes those games recoverable, so signing in claims it and the games already
played on that device come along. Storing only the account would have thrown them away, and that is
the whole reason claiming a token was chosen over replacing one.

Because a name can change and a record is read long after the game, the record shows the name the
account has *now*, falling back to the nickname stored on the row only for those older rows that
have no account behind them. The alternative rewrites some of the history and not the rest of it,
which reads as a bug whichever way somebody notices it.

**Rubbers against the computer are kept in their own section.** The row is identical — won, lost,
points either way — because a rubber against the computer is won exactly as a rubber against a
person is. What differs is where the claim comes from: a networked rubber was witnessed by the
server that owned the state and applied every rule, while the game against the computer runs
entirely in a browser (§2.1) and is therefore reported by that browser and taken on its word.
Nothing can make that verifiable without moving the robot game to the server, which would cost it
the one thing it has that the networked game does not — working with no network at all. So the two
are shown side by side and never summed into a single record.

---

## 4. Out of Scope for v1

- Bidding conventions and alerting (meaningless without a partner — see §1.5).
- Defensive carding signals, for the same reason.
- ~~Claiming~~, conceding, undo. **Claiming reversed, see §1.6** — conceding and undo have not.
- ~~Accounts, authentication~~ — **built after all, and now required to play a person**, see §3.7.
  The reason for the reversal is that per-opponent results need somewhere to attach and a browser
  is not a person; the reason for the second reversal, from optional to required, is that results
  which only sometimes attach are not results. The game against the computer needs no account.
  **Cross-device seat recovery stays out:** an account carries a *record* between devices, not a
  rubber in progress.
- Spectators.
- Ratings and hand records. Standings and game history are partly reversed with §3.7: a record
  against each opponent is now the point of having accounts at all, though nothing yet writes one.
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
   nine is often high. The estimate is therefore calibrated against measurement rather than
   reasoned about. The fit is in `evaluate.ts` and **wants refitting whenever card play changes**.

   What has changed is what it is fitted *against*. The first three fits used deals the bot had
   itself bid and played, which was circular twice over — the contracts in the sample were the ones
   the previous constants chose, and the tricks were whatever the previous card play managed. Each
   fit disagreed with the one before it. It is now fitted against **par**, computed by the
   double-dummy solver for every hand in every strain whether or not anything would bid it, so the
   sample is the hands rather than the auctions they happened to produce.

   The remaining problem is no longer the fit but the thing being fitted: r-squared is 0.42 and the
   residual is ±1.4 tricks, which no straight line through this feature can improve. Hand
   evaluation is the weak link, and the specific defect and why the obvious fix cannot land alone
   are recorded in `CLAUDE.md`.
3. **Turn clock**, if the untimed draw phase proves tedious in practice (§2.2).
