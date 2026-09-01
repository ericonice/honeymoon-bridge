import type { Doubling, Level, Strain } from "@hb/engine";
import { useState } from "react";
import { doubledOutcome, trickTargets } from "../game/biddingFacts.js";
import { useSwipeBack } from "../game/swipeBack.js";
import { BackButton } from "./BackButton.js";
import { ContractText } from "./CardText.js";
import { FactsTable } from "./FactsTable.js";

/**
 * Bidding, from nothing — for somebody who has never played a trick-taking card
 * game, as distinct from `HelpOverlay`, which assumes bridge and covers only the
 * differences. Reached from Help rather than folded into it for the same reason
 * `ScoringOverlay` is its own destination: the assumption at the top of Help
 * would be false the moment this content sat under it.
 *
 * **A screen you tap through, not a page you scroll.** The content was drafted
 * and read as one long page first, and paced badly as one — bidding is learned a
 * rule at a time, each landing before the next arrives, which a single scroll
 * cannot pace for a reader the way a "Next" button can. `STEPS` is therefore the
 * one place this content lives; the component only ever renders whichever one
 * `step` names.
 *
 * Every number that could in principle change is asked of `biddingFacts.ts`
 * rather than typed here — see that module's own doc, which is `scoringFacts.ts`'s
 * reasoning applied a second time.
 */

/** One call in a worked auction: a bid, or a plain word — Pass, Double, Redouble. */
function Bid({
  doubling = "none",
  level,
  strain,
}: {
  readonly doubling?: Doubling;
  readonly level: Level;
  readonly strain: Strain;
}): React.JSX.Element {
  return <ContractText contract={{ declarer: 0, doubling, level, strain }} on="dark" />;
}

/** A worked auction, read left to right — your own calls stand out, theirs are muted. */
function Auction({
  calls,
}: {
  readonly calls: readonly { readonly mine: boolean; readonly said: React.ReactNode }[];
}): React.JSX.Element {
  return (
    <p className="flex flex-wrap gap-1.5 font-mono text-sm">
      {calls.map((call, index) => (
        <span
          key={index}
          className={`rounded bg-white/10 px-2 py-0.5 ${call.mine ? "text-white" : "text-white/55"}`}
        >
          {call.said}
        </span>
      ))}
    </p>
  );
}

function Worked({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs tracking-wide text-white/40 uppercase">{label}</p>
      {children}
    </div>
  );
}

interface Step {
  readonly body: React.ReactNode;
  readonly title: string;
}

const STRAIN_ORDER: readonly { readonly strain: Strain; readonly symbol: string }[] = [
  { strain: "C", symbol: "♣ clubs" },
  { strain: "D", symbol: "♦ diamonds" },
  { strain: "H", symbol: "♥ hearts" },
  { strain: "S", symbol: "♠ spades" },
  { strain: "NT", symbol: "no-trump" },
];

function steps(): readonly Step[] {
  const targets = trickTargets();
  const fourHearts = doubledOutcome({ level: 4, strain: "H" });

  return [
    {
      body: (
        <>
          <p>
            A deal is played out in thirteen rounds called <strong>tricks</strong> — one card
            each, and whoever plays the highest card wins the trick, unless somebody plays a
            card from the <strong>trump</strong> suit, which beats every other suit regardless
            of rank.
          </p>
          <p>
            The bidding — the <strong>auction</strong> — happens before any of that, and it
            settles two things: what the trump suit will be, or whether there won't be one at
            all (called <strong>no-trump</strong>), and how many of those thirteen tricks
            whoever wins the auction is promising to take.
          </p>
        </>
      ),
      title: "What the bidding is deciding",
    },
    {
      body: (
        <>
          <p>
            A bid names a level, one through seven, and a strain — a suit, or no-trump. The
            level does not mean the number of tricks directly. It means tricks{" "}
            <strong>past six</strong>: six is called the <strong>book</strong>, and does not
            have to be bid for. So <Bid level={1} strain="S" /> promises seven tricks with
            spades as trumps — six plus one. <Bid level={4} strain="H" /> promises ten.{" "}
            <Bid level={7} strain="NT" /> promises all thirteen, the highest bid there is.
          </p>
        </>
      ),
      title: "A bid is a promise, in tricks",
    },
    {
      body: (
        <>
          <p>
            If you don't win the auction, you're defending — and your job is the mirror image
            of declarer's. You need <strong>8 minus the level</strong> tricks to defeat the
            contract, and the two numbers always add up to fourteen against thirteen tricks in
            play — exactly one more than exists. That's not a coincidence: it's why a deal can
            never be a draw. Somebody always gets there first, and it's never both.
          </p>
          <FactsTable
            caption="What each side needs, by level"
            columns={["level", "declarer", "defender"]}
            rows={targets.map((row) => ({
              label: row.level,
              values: [row.declarer, row.defender] as const,
            }))}
          />
          <p>
            Worth sitting with for a second: the higher somebody bids, the <em>fewer</em>{" "}
            tricks it takes to beat them. A grand slam at the seven level falls to a single
            trick going the other way.
          </p>
        </>
      ),
      title: "The other side of the promise: defending",
    },
    {
      body: (
        <>
          <p>
            To bid over an existing bid, you need a higher level, or the same level in a
            strain that outranks it. Strains rank low to high, and no-trump outranks all
            four suits:
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-sm">
            {STRAIN_ORDER.map((one, index) => (
              <span key={one.strain} className="flex items-center gap-1.5">
                {index > 0 ? <span className="text-white/40">&lt;</span> : null}
                <span className="rounded bg-white/10 px-2 py-0.5">{one.symbol}</span>
              </span>
            ))}
          </p>
          <p>
            So if the last bid was <Bid level={2} strain="H" />, you could go to{" "}
            <Bid level={2} strain="S" />, <Bid level={2} strain="NT" />, or anything at the
            three level or above — but not <Bid level={2} strain="D" />, which is
            lower-ranked at the same level, and not <Bid level={1} strain="NT" />, which is a
            lower level regardless of strain.
          </p>
        </>
      ),
      title: "Outbidding: what counts as higher",
    },
    {
      body: (
        <>
          <p>
            Calls alternate, one at a time. Whoever drew first on that deal calls first. Each
            turn, you either bid higher (as in Step 4), pass, double, or redouble.
          </p>
          <p>
            Here is the one thing that catches everybody who has played four-player bridge
            before: <strong>one pass ends the auction here</strong>, not three. There's no
            partner to come back around to, so the moment either player passes after a bid has
            been made, the bidding is over on the spot — that bid is the contract, and whoever
            made it is declarer.
          </p>
          <Worked label="A short auction">
            <Auction
              calls={[
                { mine: true, said: <Bid level={1} strain="S" /> },
                { mine: false, said: <Bid level={2} strain="H" /> },
                { mine: true, said: <Bid level={2} strain="S" /> },
                { mine: false, said: "Pass" },
              ]}
            />
            <p className="text-sm text-white/70">
              Three calls in, then a pass. The auction is over the instant that pass lands —{" "}
              <Bid level={2} strain="S" /> is the contract, and whoever bid it is declarer,
              needing eight tricks with spades as trumps.
            </p>
          </Worked>
        </>
      ),
      title: "How the auction actually runs",
    },
    {
      body: (
        <p>
          The last step's rule is about a pass <em>after</em> a bid. Two passes in a row with
          nothing bid at all is different: nobody has promised anything, so there's nothing to
          play. The deal is scrapped and redealt, with the same player drawing first again.
        </p>
      ),
      title: "Passing before anybody has bid",
    },
    {
      body: (
        <>
          <p>
            If you think an opponent's bid is going to fail, you can <strong>double</strong>{" "}
            it instead of bidding over it. A double doesn't change what tricks are needed — it
            changes the score. Making a doubled contract is worth roughly double the usual
            trick score, plus a bonus for having made it under pressure; failing to make it
            costs sharply more than failing undoubled would have.
          </p>
          <p>
            You can only double a bid that hasn't already been doubled, and only an
            opponent's — you can't double your own.
          </p>
        </>
      ),
      title: "Doubling: a bet that they can't make it",
    },
    {
      body: (
        <>
          <p>
            If your own bid gets doubled and you still believe in it, you can{" "}
            <strong>redouble</strong> — raising the stakes again, further than a double does,
            as your own way of saying <em>no, I really can make this</em>. Only the player
            whose bid was just doubled may redouble it.
          </p>
          <Worked label="A double, and an answer">
            <Auction
              calls={[
                { mine: true, said: <Bid level={1} strain="NT" /> },
                { mine: false, said: <Bid level={4} strain="H" /> },
                { mine: true, said: "Double" },
                { mine: false, said: "Redouble" },
              ]}
            />
            <p className="text-sm text-white/70">
              You opened a balanced hand at <Bid level={1} strain="NT" />. Your opponent,
              sitting on a long, strong heart suit, jumped straight to{" "}
              <Bid level={4} strain="H" /> — ten tricks with hearts as trumps. You don't
              believe it: two aces and a heart honor of your own should be enough to stop
              them, so you double rather than bid on. They redouble right back. One of you is
              about to be right in a big way — making it now scores roughly four times the
              ordinary trick total; failing costs just as steeply in the other direction.
            </p>
          </Worked>
        </>
      ),
      title: "Redoubling: betting back",
    },
    {
      body: (
        <>
          <p>
            Not every made contract is worth the same. Score enough below the line in a single
            deal — the threshold is <strong>100 points</strong> — and you've won a{" "}
            <strong>game</strong>: a large bonus on top of the ordinary trick score, and a real
            step toward the rubber itself, which ends when a side has won two of them. Fall
            short of that and you've made a <strong>part-score</strong> instead — real points,
            but points that just sit below the line waiting for you to reach 100 across
            however many deals it takes.
          </p>
          <p>
            Because of how the strains are valued, only a handful of bids reach game at their
            cheapest level: <Bid level={3} strain="NT" />, <Bid level={4} strain="H" /> or{" "}
            <Bid level={4} strain="S" />, and <Bid level={5} strain="C" /> or{" "}
            <Bid level={5} strain="D" />. Everything below those —{" "}
            <Bid level={2} strain="NT" />, <Bid level={3} strain="H" />,{" "}
            <Bid level={4} strain="C" />, and so on — makes a perfectly good part-score but not
            a game, even though it's often only a trick or two short. The exact arithmetic
            behind why those particular bids are the ones that clear 100 is on the scoring
            page; what matters here is recognising them.
          </p>
          <p>
            That gap is exactly why bidding is a judgement call rather than a checklist. A
            hand that's a slightly optimistic stretch toward <Bid level={4} strain="S" /> is
            often worth bidding anyway, because the prize if you're right is a game, not just a
            few extra points — where the same stretch toward a part-score you'll never see
            again usually isn't. The reward being lumpy is what makes it rational to reach
            further for it.
          </p>
        </>
      ),
      title: "Game: the bid that's worth more than its tricks",
    },
    {
      body: (
        <>
          <p>
            Once a side has won a game within the rubber, they're <strong>vulnerable</strong>{" "}
            for the rest of it — and it changes the risk on both sides of a double, but not
            symmetrically. Take a doubled <Bid level={4} strain="H" /> — declarer needs ten
            tricks — and watch what actually moves:
          </p>
          <FactsTable
            caption="4 hearts, doubled — declarer's outcome, points scored"
            columns={["result", "not vulnerable", "vulnerable"]}
            rows={[
              {
                label: "Made exactly",
                values: [fourHearts.notVulnerable.madeExactly, fourHearts.vulnerable.madeExactly] as const,
              },
              {
                label: "Down 1",
                values: [fourHearts.notVulnerable.down[0], fourHearts.vulnerable.down[0]] as const,
              },
              {
                label: "Down 2",
                values: [fourHearts.notVulnerable.down[1], fourHearts.vulnerable.down[1]] as const,
              },
              {
                label: "Down 3",
                values: [fourHearts.notVulnerable.down[2], fourHearts.vulnerable.down[2]] as const,
              },
            ]}
          />
          <p>
            Making it scores the <strong>same either way</strong> — vulnerability doesn't
            touch the contract's own trick points or the bonus for making it under double.
            Going down is where it moves, and it moves a lot: down 3 vulnerable costs{" "}
            {0 - fourHearts.vulnerable.down[2]} against {0 - fourHearts.notVulnerable.down[2]}{" "}
            not vulnerable, for the identical three tricks lost.
          </p>
          <p>
            Which is the real lesson for doubling: it's a much better bet against a vulnerable
            opponent than a non-vulnerable one. If you're wrong, they score exactly what
            they'd have scored anyway. If you're right, they pay for it far more steeply.
            Being vulnerable yourself cuts the other way — it's a reason for a little more
            caution before stretching for a contract you're not sure of, since a miss now
            costs more than the identical miss would have before.
          </p>
        </>
      ),
      title: "Vulnerability: why the stakes move",
    },
    {
      body: (
        <>
          <p>
            There's no minimum hand you need to open, and nothing stops you naming a suit
            you're weak in — the auction doesn't check your cards, only that each call
            outranks the last. What decides a good bid from a bad one is entirely on you: can
            you picture actually taking that many tricks? The standard tool for a first
            estimate is <strong>high-card points</strong>: count 4 for each ace you hold, 3
            for each king, 2 for each queen, 1 for each jack.
          </p>
          <p className="flex flex-wrap gap-2 font-mono text-sm">
            {(
              [
                ["Ace", 4],
                ["King", 3],
                ["Queen", 2],
                ["Jack", 1],
              ] as const
            ).map(([card, points]) => (
              <span key={card} className="rounded bg-white/10 px-2 py-0.5">
                {card} <span className="text-white/50">{points}</span>
              </span>
            ))}
          </p>
          <p>
            There are 40 points in the deck, and a truly random 13-card hand averages 10 of
            them — the same arithmetic whether four people are dealt in or two. But your hands
            here aren't dealt at random: they're <em>built</em>, thirteen cards kept out of
            twenty-six offered over the draw, and keeping the strong ones and discarding the
            weak ones is the whole point of that phase. A kept hand — yours or your
            opponent's — tends to run stronger than a random one would. Worth assuming a bit
            more strength is out there than a plain average suggests, not less.
          </p>
          <p>
            Points are a starting estimate, not the whole answer — they say roughly how many
            raw winners you hold, but not how many <em>tricks</em> you'll take, which is what a
            bid actually promises. For that, weigh your longest suit alongside them: length
            wins tricks on its own once the missing cards run out, points or no points, which
            is why a long, ragged suit can outbid a short, pointy one. If you can genuinely see
            yourself taking level-plus-six tricks with a given suit as trumps, that's a bid you
            can make. If you can't quite see it, bid a level lower — or don't bid at all. You
            don't have to win the auction to win the deal; defending it well works just as
            well.
          </p>
        </>
      ),
      title: "So what do you actually bid? Start by counting.",
    },
    {
      body: (
        <p>
          One thing worth knowing before you get there, because it's the rule people have
          backwards most often: the <strong>non-declarer</strong> makes the opening lead. If
          you just won the auction, you don't play the first card of the deal — your opponent
          does.
        </p>
      ),
      title: "Right after the auction ends",
    },
  ];
}

export function BiddingTutorialOverlay({ onClose }: { onClose(): void }): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const all = steps();
  const step = all[index]!;
  const first = index === 0;
  const last = index === all.length - 1;

  // A step forward or back rather than leaving the screen — see this
  // component's own doc on why it exists as a tap-through rather than a
  // scroll. Only the very first step's "back" leaves, and it does that by
  // calling `onClose` directly rather than by underflowing `index`.
  const back = (): void => {
    if (first) {
      onClose();
      return;
    }
    setIndex((current) => current - 1);
  };

  useSwipeBack(back);

  return (
    <div className="safe-inset absolute inset-0 z-40 flex flex-col bg-table-dark/97">
      <div className="flex items-center justify-between px-4 pt-4">
        <BackButton onBack={back} />
        <span className="text-xs text-white/40">
          Step {index + 1} of {all.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-3 pb-4">
        <div className="w-full max-w-sm">
          <h1 className="text-lg font-semibold text-balance">{step.title}</h1>
          <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-white/80">
            {step.body}
          </div>
        </div>
      </div>
      <div className="px-5 pb-6">
        <button
          type="button"
          className="w-full rounded-xl bg-white px-4 py-3.5 text-base font-semibold text-stone-900"
          onClick={() => {
            if (last) {
              onClose();
              return;
            }
            setIndex((current) => current + 1);
          }}
        >
          {last ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}
