import { GAME_THRESHOLD, opponentOf, overtrickPoints, undertrickPoints } from "@hb/engine";
import type { Contract, DealScore, Pair, PlayerId, PlayerView, ScoreDetail } from "@hb/engine";
import { ContractText } from "./CardText.js";

export function Row({
  divider,
  emphasis,
  label,
  view,
  values,
}: {
  /** A plain rule above the row — the line a paper scorepad draws between
   * its above- and below-the-line sections, with no weight of its own. */
  readonly divider?: boolean;
  readonly emphasis?: boolean;
  readonly label: React.ReactNode;
  readonly view: PlayerView;
  readonly values: Pair<number>;
}): React.JSX.Element {
  const cell = "w-16 text-right tabular-nums";
  const tone =
    emphasis === true
      ? "border-t border-white/20 pt-2 font-semibold"
      : divider === true
        ? "border-t border-white/15 pt-2"
        : "";

  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${tone}`}>
      <span className="whitespace-nowrap text-white/75">{label}</span>
      <span className="flex gap-3">
        <span className={cell}>{values[view.me] || "—"}</span>
        <span className={`${cell} text-white/60`}>{values[view.opponent] || "—"}</span>
      </span>
    </div>
  );
}

export function Columns({ opponentName }: { readonly opponentName: string }): React.JSX.Element {
  return (
    <div className="flex justify-end gap-3 pb-1 text-xs text-white/45">
      <span className="w-16 text-right">You</span>
      <span className="w-16 text-right">{opponentName}</span>
    </div>
  );
}

export interface DealResultHeadlineProps {
  /**
   * What a duplicate deal paid beyond its trick score — a game or a part-score,
   * settled on the spot. Zero in a rubber, where a game is banked into the rubber
   * rather than paid, so the breakdown has nothing extra to show.
   */
  readonly bonus?: number;
  readonly opponentName: string;
  readonly score: DealScore;
  readonly view: PlayerView;
  readonly vulnerable: Pair<boolean>;
}

/** "made", "made +2" or "set by 2" — the contract's own result, read the way a player says it aloud rather than the way it is entered on a scorepad. */
/**
 * How a deal came out, in three words at most.
 *
 * Shared by both scorepads, which is the whole reason it is here: a session's pad
 * and a rubber's pad describe the same event and would otherwise say it in two
 * slightly different vocabularies, which reads as two kinds of thing happening.
 */
export function dealResultText(score: DealScore | null): string {
  if (score === null) {
    return "passed out";
  }
  const { detail } = score;
  if (!detail.made) {
    return `down ${detail.undertricks}`;
  }
  return detail.overtricks > 0 ? `made +${detail.overtricks}` : "made";
}

/**
 * How the contract went, in bridge's own notation rather than in prose.
 *
 * `dealResultText` says the same thing in words and is what a surface with room
 * uses. This is for the two-column scorepad, where a cell is about half a phone
 * wide and already holds a contract, a declarer and a signed total — "made +2"
 * does not fit and `+2` does.
 *
 * **A contract made exactly is `=` rather than nothing**, which is the lesson that
 * pad has already learnt once from the other side: a blank cell has to mean there
 * is no deal there. A mark that disappears when the news is "made it" would leave
 * the reader deciding which kind of nothing they are looking at.
 */
export function resultMark(score: DealScore | null): string | null {
  if (score === null) {
    return null;
  }
  const { detail } = score;
  if (!detail.made) {
    // U+2212, matching the signed totals it sits beside rather than a hyphen.
    return `−${detail.undertricks}`;
  }
  return detail.overtricks > 0 ? `+${detail.overtricks}` : "=";
}

function resultPhrase(detail: ScoreDetail): string {
  if (!detail.made) {
    return `set by ${detail.undertricks}`;
  }
  return detail.overtricks > 0 ? `made +${detail.overtricks}` : "made";
}

function creditTo(player: PlayerId, amount: number): Pair<number> {
  return player === 0 ? [amount, 0] : [0, amount];
}

interface ScoreItem {
  readonly key: string;
  readonly label: string;
  readonly values: Pair<number>;
}

/**
 * Every named component a deal's score is made of, in the order the rules
 * apply them — declarer's own contract first, then what either side added on
 * top of it — rather than the two-number "above the line"/"below the line"
 * split this replaced. That split says how much moved and which column it
 * sits in, but not why; a made contract with a doubled overtrick and a stack
 * of honors landed on the same two numbers a plain part-score would, and a
 * player watching has no way to tell them apart. Omitted entirely rather
 * than shown as zero: a doubled bonus nobody earned this deal is not a line
 * worth reading past.
 *
 * Recomputes `overtrickPoints`/`undertrickPoints` from the same inputs
 * `scoreDeal` used rather than stashing the result on `DealScore` itself —
 * both are already exported for exactly this, and every other number here
 * (`slamBonus`, `insult`, `honors`) already lives on `detail` untouched.
 */
function scoreItems(
  score: DealScore,
  contract: Contract,
  vulnerable: Pair<boolean>,
  bonus: number,
): ScoreItem[] {
  const { detail } = score;
  const { declarer, doubling, strain } = contract;
  const defender = opponentOf(declarer);
  const declarerVulnerable = vulnerable[declarer];

  const items: ScoreItem[] = [];

  if (detail.made) {
    items.push({ key: "contract", label: "Contract", values: score.belowLine });
  }
  if (detail.overtricks > 0) {
    items.push({
      key: "overtricks",
      label: `${detail.overtricks} overtrick${detail.overtricks === 1 ? "" : "s"}`,
      values: creditTo(declarer, overtrickPoints(detail.overtricks, strain, doubling, declarerVulnerable)),
    });
  }
  if (detail.undertricks > 0) {
    items.push({
      key: "penalty",
      label: "Penalty",
      values: creditTo(defender, undertrickPoints(detail.undertricks, doubling, declarerVulnerable)),
    });
  }
  if (detail.slamBonus > 0) {
    items.push({ key: "slam", label: "Slam bonus", values: creditTo(declarer, detail.slamBonus) });
  }
  if (detail.insult > 0) {
    items.push({ key: "insult", label: "Doubled bonus", values: creditTo(declarer, detail.insult) });
  }
  if (detail.honors[0] > 0 || detail.honors[1] > 0) {
    items.push({ key: "honors", label: "Honors", values: detail.honors });
  }
  // Duplicate only, and it has to be here rather than left off: a session pays for
  // a game or a part-score on the spot, so a breakdown without it does not add up
  // to the figure the scorepad shows for the same deal. In a rubber it is zero,
  // because what a game is worth is banked into the rubber instead.
  if (bonus > 0) {
    items.push({
      key: "bonus",
      label: detail.contractTricks >= GAME_THRESHOLD ? "Game" : "Part-score",
      values: creditTo(declarer, bonus),
    });
  }

  return items;
}

/**
 * The contract itself and its result stated the way a player would say it —
 * "4♠ made +1", "3♠X set by 4" — rather than a trick count nobody at the
 * table quotes out loud. One line rather than two: a separate "Contract
 * made"/"Down N" line above this used to say the same fact again in
 * different words, which read as noise once this line already said it.
 * Vulnerability is kept as its own line underneath instead, since it is a
 * genuinely separate fact rather than a restatement of this one.
 *
 * And below that, every component the score is actually made of — see
 * `scoreItems`.
 *
 * Shared between the hands reveal, where it now appears the moment a deal
 * ends, and `DealComplete`'s own claimed-finish path — a claim never has a
 * reveal to have shown it already, so that one screen still needs it.
 */
export function DealResultHeadline({
  bonus = 0,
  opponentName,
  score,
  view,
  vulnerable,
}: DealResultHeadlineProps): React.JSX.Element {
  // Guaranteed set: this only renders once a deal has been scored, and a
  // contract is what a deal needs before it can be.
  const contract = view.contract!;

  return (
    <div className="text-center">
      <h2 className="text-2xl font-semibold">
        <ContractText contract={contract} on="dark" /> · {resultPhrase(score.detail)}
      </h2>
      {vulnerable[view.me] || vulnerable[view.opponent] ? (
        <p className="mt-1 text-sm text-white/60">
          {vulnerable[0] && vulnerable[1]
            ? "Both sides were vulnerable"
            : vulnerable[view.me]
              ? "You were vulnerable"
              : `${opponentName} was vulnerable`}
        </p>
      ) : null}
      <div className="mx-auto mt-2 w-full max-w-xs text-sm">
        <Columns opponentName={opponentName} />
        {scoreItems(score, contract, vulnerable, bonus).map((item) => (
          <Row key={item.key} label={item.label} values={item.values} view={view} />
        ))}
      </div>
    </div>
  );
}
