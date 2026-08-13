import { useState } from "react";

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

const SECTION_TITLES = ["draw", "auction", "play", "scoring", "app", "known"] as const;
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
 * Deliberately says nothing about how a deal is scored. The engine computes
 * that and the deal-complete screen already itemises it — honors included, on
 * the line where the points appear. A scoring table written out here would be a
 * second account of the rules with no way to stay honest as the first one
 * changes, which is the one kind of help worth less than none.
 *
 * An overlay rather than a screen so it can be opened from the middle of a
 * game. Somebody wondering whether a pass ends the auction is, by definition,
 * in an auction.
 */
export function HelpOverlay({ onClose }: HelpOverlayProps): React.JSX.Element {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    app: false,
    auction: false,
    draw: false,
    known: false,
    play: false,
    scoring: false,
  });

  function toggle(key: SectionKey): void {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="safe-inset absolute inset-0 z-30 flex flex-col bg-table-dark/97">
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-5 py-6">
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
            rubber. Settings will shorten a sitting to a single game instead; at a table with
            somebody else, one game wins if either of you asks for it.
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

      <div className="px-5 pb-5">
        <button
          type="button"
          className="w-full rounded-xl bg-white px-4 py-3.5 text-base font-semibold text-stone-900"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
