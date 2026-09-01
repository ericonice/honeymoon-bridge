import type { Strain } from "@hb/engine";
import { strainIsRed, strainSymbol } from "../game/labels.js";
import { useSwipeBack } from "../game/swipeBack.js";
import { BackButton } from "./BackButton.js";
import {
  GAME_THRESHOLD,
  honorValues,
  duplicateBonuses,
  duplicateFailedBonus,
  duplicateIfBid,
  matchBonuses,
  plainUndertrick,
  scoreIfBid,
  slamValues,
  strainValues,
  undertrickStep,
  undertrickTable,
} from "../game/scoringFacts.js";
import { redTone } from "./CardText.js";
import { FactsTable } from "./FactsTable.js";

/**
 * How a deal is scored, for somebody who has not played rubber bridge.
 *
 * **This exists against an argument `HelpOverlay` used to make, and the argument
 * was right.** It said a scoring table written out by hand would be a second
 * account of the rules with no way to stay honest as the first one changes,
 * which is the one kind of help worth less than none. Every figure on this page
 * is therefore *asked of the engine* — see `scoringFacts.ts` — so changing what
 * a heart is worth or what a doubled undertrick costs changes this page too, or
 * breaks its test. Nothing here is typed out.
 *
 * It is its own destination rather than a section of the help screen for two
 * reasons. That screen says at the top that it assumes you play bridge and
 * covers only the differences, and this is the first thing in the app written
 * for somebody who does not. And it is what a person opens *during* an auction,
 * which is not a moment for scrolling past four other headings.
 *
 * The last block is the only opinion on the page. Everything above it is what
 * the rules pay; that one says what the payments imply, which is the part a new
 * player cannot derive at the table and the part that makes the rest worth
 * reading.
 */

/** A strain named the way the cards name it, red where the cards are red. */
function StrainName({ strain }: { readonly strain: Strain }): React.JSX.Element {
  return (
    <span className={strainIsRed(strain) ? redTone("dark") : undefined}>
      {strainSymbol(strain)}
    </span>
  );
}

/** A contract, as it would be said out loud. */
function Contract({
  level,
  strain,
}: {
  readonly level: number;
  readonly strain: Strain;
}): React.JSX.Element {
  return (
    <span className="font-medium whitespace-nowrap">
      {level}
      <StrainName strain={strain} />
    </span>
  );
}

function Note({
  children,
  title,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}): React.JSX.Element {
  return (
    <section className="w-full max-w-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-white/70">
        {children}
      </div>
    </section>
  );
}

export function ScoringOverlay({ onClose }: { onClose(): void }): React.JSX.Element {
  useSwipeBack(onClose);

  const strains = strainValues();
  const bonus = matchBonuses();
  const honors = honorValues();
  const slams = slamValues();
  // Eleven tricks in hearts, bid two ways. The gap between these two rows is the
  // whole of the "bid the game" argument, so it is computed rather than claimed.
  const timid = scoreIfBid({ bid: 3, strain: "H", tookLevel: 5 });
  const brave = scoreIfBid({ bid: 4, strain: "H", tookLevel: 5 });
  const duplicate = duplicateBonuses();
  const timidSession = duplicateIfBid({ bid: 3, strain: "H", tookLevel: 5 });
  const braveSession = duplicateIfBid({ bid: 4, strain: "H", tookLevel: 5 });

  return (
    <div className="safe-inset absolute inset-0 z-40 flex flex-col bg-table-dark/97">
      <div className="px-4 pt-4">
        <BackButton onBack={onClose} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-5 pt-2 pb-6">
        <div className="w-full max-w-sm">
          <h1 className="text-lg font-semibold">Scoring</h1>
          <p className="mt-1 text-sm text-white/40">
            What a contract pays, what going down costs, and what any of it is for.
          </p>
        </div>

        <Note title="A rubber is the first to two games">
          <p>
            A game is {GAME_THRESHOLD} points <em>below the line</em>. Winning the rubber is worth{" "}
            {bonus.rubberUnbeaten} if your opponent never won a game, {bonus.rubber} if they won
            one. There is no bonus for a game itself — the rubber is what pays.
          </p>
          <p className="text-white/45">
            A single-game match instead pays {bonus.game}, and ends the moment somebody reaches{" "}
            {GAME_THRESHOLD}.
          </p>
        </Note>

        <Note title="Only what you bid and made goes below the line">
          <p>
            Everything else you score — overtricks, penalties, honors, slam bonuses — is real
            points, and sits <em>above</em> the line where it brings you no closer to a game. That
            one distinction is most of what makes bidding matter.
          </p>
        </Note>

        <Note title="What a contract is worth">
          <FactsTable
            caption="Points per trick over six, by strain"
            columns={["strain", "first", "after"]}
            rows={strains.map((value) => ({
              label: <StrainName strain={value.strain} />,
              values: [value.first, value.each] as const,
            }))}
          />
          <p>
            So a game in a single deal is{" "}
            {strains
              .filter((value) => value.gameAt !== null)
              .map((value, index, kept) => (
                <span key={value.strain}>
                  <Contract level={value.gameAt!} strain={value.strain} />
                  {index === kept.length - 1 ? "." : index === kept.length - 2 ? " or " : ", "}
                </span>
              ))}
          </p>
        </Note>

        <Note title="Bidding less than you make costs you the game">
          <p>
            Overtricks never go below the line. Take eleven tricks in hearts and what you scored
            depends entirely on what you said you would do:
          </p>
          <FactsTable
            caption="Eleven tricks in hearts, scored at two different bids"
            columns={["bid", "below", "above"]}
            rows={[
              { label: <Contract level={3} strain="H" />, values: [timid.below, timid.above] },
              { label: <Contract level={4} strain="H" />, values: [brave.below, brave.above] },
            ]}
          />
          <p>
            The same eleven tricks, {timid.below + timid.above} points either way — and only the
            second is a game. This is the most expensive habit a new player has, and it is why
            "bid only what you are sure of" loses.
          </p>
        </Note>

        <Note title="A part-score carries over until somebody wins a game">
          <p>
            Fall short of {GAME_THRESHOLD} and what you scored below the line stays there and
            counts toward your next deal. The moment either side reaches {GAME_THRESHOLD} the line
            is redrawn for <em>both</em> — so your game wipes out their part-score, and theirs
            wipes out yours.
          </p>
          <p>A part-score is therefore worth most when the rubber is nearly over.</p>
        </Note>

        <Note title="Winning a game makes you vulnerable">
          <p>
            Vulnerability is not a punishment for doing badly. It is what happens when you
            succeed, and it does not change what a contract is worth — only what failing one
            costs.
          </p>
        </Note>

        <Note title="When you go down">
          <p>
            Undoubled, each trick short costs {plainUndertrick(false)}, or {plainUndertrick(true)}{" "}
            vulnerable, paid to the defender. Doubled, it climbs:
          </p>
          <FactsTable
            caption="What a doubled contract costs when it fails"
            columns={["short by", "doubled", "+ vuln"]}
            rows={[
              ...undertrickTable().map((row) => ({
                label: row.short,
                values: [row.doubled, row.doubledVulnerable] as const,
              })),
              {
                label: "each after",
                values: [`+${undertrickStep(false)}`, `+${undertrickStep(true)}`] as const,
              },
            ]}
          />
        </Note>

        <Note title="Doubling cuts both ways">
          <p>
            A double doubles the contract's value below the line as well as the penalties. Double
            them in <Contract level={2} strain="H" /> and, if they make it, they score{" "}
            {scoreIfBid({ bid: 2, strain: "H", tookLevel: 2 }).below * 2} below — a game they could
            not otherwise have had. Doubling a part-score you cannot beat is one of the more
            expensive things you can do.
          </p>
        </Note>

        <Note title="Slams pay on top">
          <FactsTable
            caption="What reaching a slam adds"
            columns={["level", "bonus", "+ vuln"]}
            rows={slams.map((slam) => ({
              label: slam.level,
              values: [slam.bonus, slam.vulnerable] as const,
            }))}
          />
          <p>
            Above the line, so a slam does not win a game by itself — though{" "}
            <Contract level={6} strain="H" /> is{" "}
            {scoreIfBid({ bid: 6, strain: "H", tookLevel: 6 }).below} below the line, which does.
          </p>
        </Note>

        {/* Last of the scoring notes and before the closing argument, because it is
            the one section a rubber player can skip — and because it only makes
            sense once the line, the part-score and the game bonus above have been
            read. */}
        <Note title="A duplicate session settles every deal on the spot">
          <p>
            No line, no part-score, nothing carried. A game pays {duplicate.game} the moment you
            make one, or {duplicate.gameVulnerable} vulnerable; anything short of a game pays{" "}
            {duplicate.partScore}. A contract that goes down pays{" "}
            <em>{duplicateFailedBonus() === 0 ? "no bonus at all" : duplicateFailedBonus()}</em> —
            the defender's penalty is the whole of what the deal paid. Tricks, overtricks,
            penalties, slams and honors are exactly as above.
          </p>
          <p>
            So the same eleven tricks in hearts are worth {timidSession.total} at{" "}
            <Contract level={3} strain="H" /> and {braveSession.total} at{" "}
            <Contract level={4} strain="H" /> — the whole difference paid at once, where a rubber
            would have banked it toward a game. Nothing rewards stopping short here.
          </p>
          <p className="text-white/45">
            Vulnerability is dealt to you rather than earned, and it is the same on both halves of a
            board — so it cancels out of the comparison the session is scored on.
          </p>
        </Note>

        <Note title="Honors look after themselves">
          <p>
            Four of the five top trumps in one hand is {honors.four}; all five is {honors.five};
            all four aces at no-trump is {honors.fourAces}. Awarded automatically to whoever holds
            them, <em>defender included</em>, and always above the line. Nothing to claim and
            nothing to play for.
          </p>
        </Note>

        <Note title="What it means when you are bidding">
          <p>
            Bid the game when you think it is there, because the gap between the two rows above is
            far larger than the two numbers suggest.
          </p>
          <p>Protect a part-score, and value it more the nearer the rubber is to ending.</p>
          <p>
            Expect to be punished once you are vulnerable — and remember you got there by winning.
          </p>
          <p>
            And going down in a contract you never expected to make can still be the cheaper
            outcome, if the alternative was letting them bid and make a game.
          </p>
        </Note>
      </div>
    </div>
  );
}
