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
 * What is different about this game, for somebody who already plays bridge.
 *
 * Deliberately not a bridge tutorial. This was built for a family who play, and
 * the help they need is the diff — the handful of places where an instinct
 * borrowed from the four-player game is wrong. Teaching bidding and trick play
 * from nothing is a different document and a much larger one.
 *
 * Ordered by what costs a deal soonest rather than by the order of play, which
 * is why the auction comes before the draw phase that precedes it.
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
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-table-dark/97">
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto px-5 py-6">
        <div className="w-full max-w-sm">
          <h2 className="text-lg font-semibold">How this differs from bridge</h2>
          <p className="mt-1 text-sm text-white/40">
            This assumes you play bridge and covers only what is not the same. Two players, one
            deck, no partner.
          </p>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-3 pt-2">
          <Rule title="One pass ends the auction">
            Not three. Waiting for the auction to come back round to you is the four-player rule,
            and there is nobody for it to come back round from — so a pass over a bid settles the
            contract there. Two passes to open pass the deal out. Declarer is simply whoever made
            the last bid.
          </Rule>

          <Rule title="You build your hand before you play it">
            Nobody is dealt thirteen cards. The deal starts with a stock, and there are twenty-six
            turns of drawing from it before a single trick is played. Thirteen of those turns are
            yours.
          </Rule>

          <Rule title="Each turn spends two cards and keeps one">
            You are shown one card and must decide before the second is turned over. Keep the
            first and the second is drawn, shown to you, and discarded. Reject the first and it is
            discarded instead, and the second goes into your hand sight unseen — a real gamble on
            a card you have not met. Either way you see both and keep one, which is why half the
            deck never comes into play at all.
          </Rule>

          <Rule title="What you throw away is not shown again">
            There is no pile to look back through, and the app will not remind you. By the end of
            the draw you will have seen twenty-six cards and kept thirteen; remembering the other
            thirteen is meant to be part of playing well, not an oversight.
          </Rule>

          <Rule title="No dummy, and no partner">
            Both hands stay concealed from first bid to last trick. Nothing is ever laid down. With
            no partner there is nobody to tell anything to, so there are no conventions, no alerts
            and no carding signals — Stayman means nothing here. The auction is a straight
            negotiation and a lead is just a lead.
          </Rule>

          <Rule title="Every deal is played out">
            All thirteen tricks, every time. No claiming, no conceding, and no undo. A contract
            that is obviously going down still has to be played, and the overtricks on a cold one
            still have to be taken.
          </Rule>

          <Rule title="Honors look after themselves">
            You never claim them. They are awarded to whoever was holding them when the deal ends,
            and that includes the defender — so points can arrive for a hand you did not bid.
          </Rule>

          <Rule title="Rubber scoring">
            Best of three games, with vulnerability following from having won one, exactly as at a
            rubber. Settings will shorten a sitting to a single game instead; at a table with
            somebody else, one game wins if either of you asks for it.
          </Rule>
        </div>

        <div className="w-full max-w-sm pt-5">
          <h2 className="text-lg font-semibold">In the app</h2>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-3 pt-2">
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
        </div>
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
