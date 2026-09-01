import { useState } from "react";
import { useSwipeBack } from "../game/swipeBack.js";
import { BackButton } from "./BackButton.js";
import { ScoringOverlay } from "./ScoringOverlay.js";
import { resetWalkthrough } from "../game/walkthrough.js";

export interface HelpOverlayProps {
  onClose(): void;
}

function Rule({
  children,
  title,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}): React.JSX.Element {
  return (
    <div className="w-full max-w-sm border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-white/55">{children}</p>
    </div>
  );
}

/**
 * A named group of rules, collapsed by default so the list of headings reads
 * as a table of contents rather than a page to scroll past to find one.
 */
function Section({
  children,
  onToggle,
  open,
  title,
}: {
  readonly children: React.ReactNode;
  onToggle(): void;
  readonly open: boolean;
  readonly title: string;
}): React.JSX.Element {
  return (
    <div className="w-full max-w-sm pt-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 border-b border-white/10 pb-2 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">{title}</h2>
        <span className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`}>
          ⌄
        </span>
      </button>

      {open ? <div className="flex flex-col gap-3 pt-3">{children}</div> : null}
    </div>
  );
}

const SECTION_TITLES = [
  "draw",
  "auction",
  "play",
  "scoring",
  "mirror",
  "duplicate",
  "app",
  "known",
] as const;
type SectionKey = (typeof SECTION_TITLES)[number];

/**
 * What is different about this game, for somebody who already plays bridge.
 *
 * Deliberately not a bridge tutorial. This was built for a family who play, and
 * the help they need is the diff — the handful of places where an instinct
 * borrowed from the four-player game is wrong. Teaching bidding and trick play
 * from nothing is a different document and a much larger one.
 *
 * Grouped by the phase of a deal a rule belongs to, so the heading somebody is
 * already thinking about — "wait, does one pass really end this?" mid-auction —
 * is also the one that gets them to the answer fastest.
 *
 * It used to say nothing at all about how a deal is scored, on the grounds that
 * a scoring table written out here would be a second account of the rules with
 * no way to stay honest as the first one changes — the one kind of help worth
 * less than none. That objection stands, and `ScoringOverlay` answers it rather
 * than ignoring it: every figure on that page is asked of the engine's own
 * scoring functions, so it moves when they move. It is a separate page rather
 * than a section here for a second reason, which is the line directly below this
 * one — this screen is explicitly for somebody who already plays bridge, and
 * scoring is the first thing in the app written for somebody who does not.
 *
 * An overlay rather than a screen so it can be opened from the middle of a
 * game. Somebody wondering whether a pass ends the auction is, by definition,
 * in an auction.
 */
export function HelpOverlay({ onClose }: HelpOverlayProps): React.JSX.Element {
  // Local, and only so the button can say it worked. The armed state itself lives in
  // storage, where the draw screen reads it on its next mount.
  const [walkthroughArmed, setWalkthroughArmed] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    app: false,
    auction: false,
    draw: false,
    duplicate: false,
    mirror: false,
    known: false,
    play: false,
    scoring: false,
  });

  useSwipeBack(onClose);

  function toggle(key: SectionKey): void {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (showScoring) {
    return (
      <ScoringOverlay
        onClose={() => {
          setShowScoring(false);
        }}
      />
    );
  }

  return (
    <div className="safe-inset absolute inset-0 z-30 flex flex-col bg-table-dark/97">
      <div className="px-4 pt-4">
        <BackButton onBack={onClose} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-5 pt-2 pb-6">
        <div className="w-full max-w-sm">
          <h1 className="text-lg font-semibold">How this differs from bridge</h1>
          <p className="mt-1 text-sm text-white/40">
            This assumes you play bridge and covers only what is not the same. Two players, one
            deck, no partner.
          </p>
        </div>

        <Section title="The draw" open={open.draw} onToggle={() => toggle("draw")}>
          <Rule title="You build your hand before you play it">
            Nobody is dealt thirteen cards. The deal starts with a stock, and there are twenty-six
            turns of drawing from it before a single trick is played. Thirteen of those turns are
            yours.
          </Rule>

          <Rule title="Each turn spends two cards and keeps one">
            Two cards are put in front of you, one face up and one face down, and you take one of
            them. Keep the face-up card and the other is drawn, shown to you, and discarded. Take
            the unseen one instead and the first is discarded — a real gamble on a card you have
            not met, since you commit before it is turned over. Either way you see both and keep
            one, which is why half the deck never comes into play at all.
          </Rule>

          <Rule title="What you throw away is not shown again">
            There is no pile to look back through, and the app will not remind you. By the end of
            the draw you will have seen twenty-six cards and kept thirteen; remembering the other
            thirteen is meant to be part of playing well, not an oversight.
          </Rule>

          <Rule title="The row of dots is a record of the choices">
            Each of you has thirteen, one a turn, hollow until it is spent. What it is filled with
            says which card was taken: blue for the face-up one, purple for the unseen gamble.
            Theirs is there for the same reason — what somebody takes is public, and only the cards are not.
          </Rule>
        </Section>

        <Section title="The auction" open={open.auction} onToggle={() => toggle("auction")}>
          <Rule title="One pass ends the auction">
            Not three. Waiting for the auction to come back round to you is the four-player rule,
            and there is nobody for it to come back round from — so a pass over a bid settles the
            contract there. Two passes to open pass the deal out. Declarer is simply whoever made
            the last bid.
          </Rule>
        </Section>

        <Section title="Play" open={open.play} onToggle={() => toggle("play")}>
          <Rule title="No dummy, and no partner">
            Both hands stay concealed from first bid to last trick. Nothing is ever laid down. With
            no partner there is nobody to tell anything to, so there are no conventions, no alerts
            and no carding signals — Stayman means nothing here. The auction is a straight
            negotiation and a lead is just a lead.
          </Rule>

          <Rule title="Every deal is played out, unless it is claimed">
            All thirteen tricks, or a claim ends it early — see below. Otherwise no conceding and
            no undo. A contract that is obviously going down still has to be played, and the
            overtricks on a cold one still have to be taken.
          </Rule>

          <Rule title="Claiming the rest">
            On your own turn, you can declare every remaining trick is yours. Your hand is shown
            the instant you do, and stays shown for the rest of the deal whether or not it is
            accepted. Against a person, they decide from their own judgment, same as they always
            could at a real table. Against the computer, it works out the position exactly and is
            never wrong about it — accepting or denying a claim is not something its difficulty
            setting touches.
          </Rule>

          <Rule title="The two rings count what each side still needs">
            One beside each played card, divided into as many segments as that side has to take:
            level plus six to make the contract, and one more than that leaves to break it. A
            segment fills per trick won, and whichever ring closes gets a green check — the same
            mark for a contract made and a contract set, because both are that side getting what it
            was playing for. It very often arrives with cards still in hand: once one side has its
            tricks the deal is decided, whatever the rest of them do. Switch it off in Settings if
            you would rather keep the count yourself.
          </Rule>

          <Rule title="Honors look after themselves">
            Awarded automatically to whoever was holding them when the deal ends, and that
            includes the defender — so points can arrive for a hand you did not bid.
          </Rule>

          <Rule title="Press near the card, not on it">
            A full hand fanned to fit a phone screen leaves each card only a sliver to tap. Press
            anywhere close to the one you want and the nearest legal card lifts to show what would
            be played; slide your finger before letting go to change your mind. Whatever is raised
            when you lift your finger is the card that gets played.
          </Rule>
        </Section>

        <Section title="Scoring" open={open.scoring} onToggle={() => toggle("scoring")}>
          <Rule title="Rubber scoring">
            Best of three games, with vulnerability following from having won one, exactly as at a
            rubber. The home screen will shorten a sitting to a single game instead, or swap it for a
            duplicate session.
          </Rule>
          {/* A page rather than more rules here. It is what somebody opens mid-auction,
              and it is the one part of this app written for a person who has never
              played rubber bridge rather than for one who has. */}
          <button
            type="button"
            className="mt-1 w-full rounded-xl border border-white/25 px-4 py-3 text-left"
            onClick={() => {
              setShowScoring(true);
            }}
          >
            <span className="block text-base font-medium">What everything is worth</span>
            <span className="mt-0.5 block text-xs text-white/55">
              Trick values, games, penalties, and what they imply when you are bidding.
            </span>
          </button>
        </Section>

        {/* Same argument as Duplicate's below: a format that changes what a deal is
            *for* is not a rule under Scoring, and somebody who only plays rubbers can
            skip the whole heading. */}
        <Section title="Mirror" open={open.mirror} onToggle={() => toggle("mirror")}>
          <Rule title="A game, then the same deals back">
            You play a game. Then the very same deals are dealt again, with the draw the
            other way round — so the cards you were offered the first time are the ones
            your opponent is offered the second, and the ones they had come to you.
          </Rule>
          <Rule title="Each half is a game, or a rubber">
            The home screen sets it. One game a half is what the format is for: the pair
            comes to about six deals, and playing the same cards from both sides cancels
            most of the luck. A rubber a half is the long version of the same idea.
          </Rule>
          <Rule title="The two halves added together decide it">
            Winning the first settles nothing. What counts is the total of both, which is
            the point: you and your opponent have each had a turn with the same cards, so
            most of the luck of the shuffle cancels and what is left is what the two of
            you did with them.
          </Rule>
          <Rule title="Ordinary scoring inside each half">
            A line, a part-score carried, honors, first to a hundred — everything works the
            way it does in a rubber. Only the verdict is different.
          </Rule>
          <Rule title="The second half can outlast the first">
            It runs until somebody wins it, which need not be inside the number of deals
            the first took. When the repeated deals run out it simply carries on with
            fresh ones, so a little of the second half is not mirrored. Most of it is.
          </Rule>
          <Rule title="You will remember the deals, and so will the computer">
            That is part of it. Every deal is played to all thirteen tricks, so both hands
            are known by the end and you meet them again a few minutes later. The computer
            remembers them exactly. It turns out to be worth almost nothing here, so these
            matches count toward your rating like any other.
          </Rule>
        </Section>

        {/* Its own section rather than a rule under Scoring. Duplicate changes what a
            deal is *for*, not only what it pays — and a rubber player can skip the
            whole heading, which is the argument for a heading. */}
        <Section title="Duplicate" open={open.duplicate} onToggle={() => toggle("duplicate")}>
          <Rule title="The deck repeats, not the hand">
            At a real duplicate you and everybody else play the same thirteen cards. Nobody is dealt
            a hand here — you build one — so what repeats is the <em>deck</em>. A board is one
            shuffle, played twice.
          </Rule>
          <Rule title="The second time, you swap sides">
            Whoever drew first draws second, which hands you exactly the cards your opponent was
            offered the first time. The board is worth the difference between the two halves, so
            what is left when you subtract is what the two of you did with one deck — the luck of
            the shuffle cancels out.
          </Rule>
          <Rule title="You are told it is a repeat, never which one">
            Working out which board you are on is part of it, and the app will not do it for you —
            though it does tell you what the deal came to when you played it before.
          </Rule>
          <Rule title="Four orders, and they are different games">
            <em>Back to back</em> plays a board's two halves one after the other, so the comparison
            is immediate and you remember everything — the clearest way to see what duplicate is.{" "}
            <em>In order</em> plays every board once and then replays them in that same order — a
            real gap to remember across, but never a guess which board is next. <em>Halves</em> plays
            every board once and then brings them round again in a random order, which is what a
            duplicate evening is. <em>Shuffled</em> mixes the lot. Settings picks; at a table it takes
            both of you asking for the same one.
          </Rule>
          <Rule title="One score a deal, plus or minus">
            No line and no part-score: every deal is settled where it is played, and the session is
            just the sum. A game pays at once, so there is nothing to gain by stopping short of one.
          </Rule>
          <Rule title="Vulnerability is dealt, not earned">
            It comes with the board rather than from having won a game — and it is the same on both
            halves, so it cancels out along with everything else about the deck.
          </Rule>
          <Rule title="A passed-out board is a result">
            It is not redealt. Nobody found a contract worth bidding, so whatever the other half
            comes to is the whole of what the board is worth.
          </Rule>
          {/* Said out loud because it is a fact about the opponent rather than about the
              app. Somebody who works out mid-session that the computer knew the board
              all along would reasonably feel cheated; somebody told up front has a
              reason to pick a shorter session or an easier rung. */}
          <Rule title="The computer remembers too">
            On its hardest setting it recognises a board it has played and remembers the cards it
            was offered — which tells it a great deal about the hand you are holding, since those
            are the cards you were offered this time. Worth about fifteen points a deal, so it
            matters without deciding things. The gentler settings meet every board fresh.
          </Rule>
          <Rule title="How long, and who with">
            The home screen sets the length in deals — always even, since every board is played
            twice. Two deals is one board and a real session. Against the computer only for now: a
            session runs on this device.
          </Rule>
        </Section>

        <Section title="In the app" open={open.app} onToggle={() => toggle("app")}>
          <Rule title="The computer needs nothing">
            No account, no connection. It runs entirely on this device and works on a plane.
          </Rule>

          <Rule title="Playing a person needs an account">
            Only so the result has somebody to attach to afterwards. A record of how you do against
            each person you play cannot be built out of browsers, and it is written at the moment
            the game is played or not at all. Signing in is an email and a code, once per device.
          </Rule>

          <Rule title="Two ways to reach somebody">
            An invite is a link you send to one particular person. The queue puts you together with
            whoever else is waiting. Nothing lists tables and nothing lists players.
          </Rule>

          <Rule title="Only finished matches count">
            A match that is abandoned is not scored and never reaches your record — which also
            means a record cannot be improved by walking out of a game going badly.
          </Rule>
        </Section>

        <Section title="Known Issues" open={open.known} onToggle={() => toggle("known")}>
          <Rule title="Rotating can flicker, installed">
            Added to your home screen rather than opened in Safari, turning the phone to landscape
            and back can flash for an instant. That is iOS forcing the screen back to portrait, not
            the game — it settles on its own and nothing is lost.
          </Rule>
        </Section>
      </div>

      <div className="flex flex-col gap-2 px-5 pb-5">
        {/* Above the way out, because it is the thing somebody who came here confused
            actually wants: the draw explained on the board rather than on this page.
            Offered whether or not it has been seen — a walkthrough you can lose by
            tapping through it too fast is worse than none, and the person most likely
            to want it back is somebody returning after a year away. */}
        <button
          type="button"
          className="w-full rounded-xl border border-white/15 px-4 py-3 text-left"
          onClick={() => {
            resetWalkthrough();
            setWalkthroughArmed(true);
          }}
        >
          <span className="block text-base font-medium">
            {walkthroughArmed ? "Walkthrough is on for the next deal" : "Walk me through the draw"}
          </span>
          <span className="mt-0.5 block text-xs text-white/55">
            {walkthroughArmed
              ? "Three notes on the board itself, starting with your next deal against the computer."
              : "Three short notes on the board itself, on the turns they matter. The draw is the part of this game that exists nowhere else."}
          </span>
        </button>
      </div>
    </div>
  );
}
