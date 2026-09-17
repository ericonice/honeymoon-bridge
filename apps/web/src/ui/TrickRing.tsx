import type { TrickOutlook } from "@hb/engine";

/**
 * How many tricks a seat still needs to win the deal, and whether it got there.
 *
 * One segment per trick of that seat's *own* target — ten for the declarer of
 * 4♠, four for its defender — lit as each is taken, with **the count in the middle**.
 *
 * **The numeral was drawn, dropped, and is back, which is a reversal worth stating.**
 * It went on the argument that a discrete ring already carries its own number, so the
 * two together said one thing twice. That is true of the *information* and false of the
 * reading: counting nine lit segments out of ten at a glance, mid-trick, is work, and
 * the trick count had meanwhile left `ContractBar` — so there was nowhere else to look.
 * Reported as wanting to know the tricks taken from time to time, which is evidence
 * about the reading that the original argument could not have had.
 *
 * It costs a bigger ring — 44px against 32 — because a numeral inside a 32px ring is
 * about eleven pixels of type. That is affordable here and nowhere else on this screen:
 * the rings are absolutely positioned beside the trick slots, so they take no room from
 * the cards, which §1.5 does not trade for anything.
 *
 * **The numeral is tricks taken, and needs no new state**: `target - need` already is
 * that, and it saturates at the target exactly when the ring is replaced by the decided
 * disc — so the one case where the two would disagree is the case where the numeral is
 * not drawn at all.
 *
 * **The ring is a target, not the thirteen tricks.** So one is not comparable
 * with another — half lit is five tricks for the declarer of 4♠ and two for its
 * defender — which costs nothing, and buys the thing that matters: the defending
 * seat's target is small, so its segments are few and fat and its ring is the
 * *easier* of the two to read.
 *
 * **There are two of them, one per seat, and every simplification here came out
 * of that.** A deal is frequently decided several tricks before its last card. With
 * one ring that had to be computed and then signalled somehow; with both on screen
 * the other seat's ring filling up simply *is* the loss, and their count closing in
 * *is* your margin running out.
 *
 * So there is one live colour and no escalation. Amber — the gold of the card
 * backs — for every segment a seat has taken, at every point in every deal. A ramp
 * was built and removed: white resting, then amber resting with orange one trick
 * from the edge and white at the edge itself. Each step was a colour on *your* ring
 * restating something the opponent's ring was already saying in tricks, which is
 * the clearer of the two channels and the one that cannot be misread at 24px.
 *
 * **Reaching the target is the only thing that changes the drawing**: the whole ring
 * turns green, and the count stays. It marks that side achieving its own goal, so it is
 * the same mark for a contract made and a contract set — which is why this component
 * does not know whose ring it is. From your seat a green ring opposite is bad news, and
 * it is still the true statement about them; the news about *you* is carried by the
 * sound, which is per-device where the rings are per-seat.
 *
 * **It was a green disc with a check, and the count is why that changed.** The disc was
 * argued for on the grounds that a ring is live and a disc is decided, so a green disc
 * cannot be misread as progress where a nearly-complete green ring could. That reasoning
 * held while the ring carried no number — and it cost the number, because the disc
 * covered it, exactly when overtricks become the interesting part. The ambiguity it
 * guarded against does not arise: `lit` reaches `target` only when the target is
 * reached, so **a full ring is a decided ring** and there is no nearly-complete green one
 * to confuse it with. The numeral turns green with it rather than staying white, so the
 * mark reads as one thing.
 *
 * **Only one of the pair can ever be green**, because the two targets sum to one more
 * than the tricks in a deal.
 *
 * **Under trial: lit segments shade from amber toward green as they fill**, in
 * place of the single flat colour the paragraphs above argue for. Asked for
 * directly, to see it rather than to decide it — the argument above still
 * stands and this is not yet its reversal. If it does not earn a place kept,
 * `colorAt` goes and the lit segments go back to a flat `stroke-amber-400`.
 */
const GRADIENT_START = { b: 0x24, g: 0xbf, r: 0xfb }; // amber-400
const GRADIENT_END = { b: 0x99, g: 0xd3, r: 0x34 }; // emerald-400

/** A colour partway from amber to green, `t` from 0 (first trick) to 1 (last). */
function colorAt(t: number): string {
  const mix = (from: number, to: number): number => Math.round(from + (to - from) * t);
  return `rgb(${mix(GRADIENT_START.r, GRADIENT_END.r)}, ${mix(GRADIENT_START.g, GRADIENT_END.g)}, ${mix(GRADIENT_START.b, GRADIENT_END.b)})`;
}
export interface TrickRingProps {
  readonly outlook: TrickOutlook;
  /**
   * Tricks this seat has actually taken.
   *
   * Passed rather than derived, because `target - need` saturates: `need` is zero once
   * the target is reached, so a declarer who has made an overtrick would read as the
   * contract exactly. That did not matter while the decided ring was a disc with a check
   * over the numeral; it does now that the number stays on screen past the moment the
   * deal is decided, which is exactly when overtricks start being the interesting part.
   */
  readonly taken: number;
  /** Edge length in pixels. Scales the whole drawing; nothing here is fixed. */
  readonly size?: number;
}

/** A point on the ring. Fraction 0 is the top, increasing clockwise. */
function at(centre: number, radius: number, fraction: number): readonly [number, number] {
  const radians = (fraction * 360 - 90) * (Math.PI / 180);
  return [centre + radius * Math.cos(radians), centre + radius * Math.sin(radians)];
}

function arc(centre: number, radius: number, from: number, to: number): string {
  const [x1, y1] = at(centre, radius, from);
  const [x2, y2] = at(centre, radius, to);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
}

/**
 * The gap between segments, as a fraction of the circle.
 *
 * Proportional to the segment rather than fixed, so thirteen thin segments still
 * read as segments instead of as a dashed blur, and capped so a target of one —
 * defending a grand slam, where a single trick sets it — is a ring with a notch
 * rather than a ring with a bite out of it.
 */
function gapFor(target: number): number {
  return Math.min(0.05, 0.18 / target);
}

export function TrickRing({ outlook, size = 44, taken }: TrickRingProps): React.JSX.Element {
  const centre = size / 2;
  const radius = size * 0.36;
  const width = size * 0.1;
  const decided = outlook.state === "reached";

  const lit = decided ? outlook.target : outlook.target - outlook.need;
  const slot = 1 / outlook.target;
  const gap = gapFor(outlook.target);

  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      {Array.from({ length: outlook.target }, (_, index) => {
        const isLit = index < lit;
        return (
          <path
            key={index}
            // The class stays even while the trial overrides its colour inline —
            // it is still what identifies a lit segment as one, to this file and
            // to `test/trickRing.test.ts`, whichever colour it actually paints.
            className={
              decided ? "stroke-emerald-400" : isLit ? "stroke-amber-400" : "stroke-white/20"
            }
            style={
              isLit && !decided
                ? { stroke: colorAt(index / Math.max(1, outlook.target - 1)) }
                : undefined
            }
            d={arc(centre, radius, index * slot + gap / 2, (index + 1) * slot - gap / 2)}
            strokeLinecap="butt"
            strokeWidth={width}
          />
        );
      })}

      <text
        className={decided ? "fill-emerald-400" : "fill-white/85"}
        dominantBaseline="central"
        fontSize={size * 0.34}
        fontWeight={600}
        textAnchor="middle"
        x={centre}
        y={centre}
      >
        {taken}
      </text>
    </svg>
  );
}

/**
 * A ring's own sentence, for anyone not looking at it.
 *
 * The widget is deliberately wordless, which leaves a screen reader nothing at
 * all — so the words exist here instead, on a visually hidden node beside each
 * ring, and this is the one place they are written. Phrased from the ring's own
 * seat, since that is exactly what the ring is.
 */
export function trickRingLabel({
  declaring,
  mine,
  outlook,
}: {
  /** Whether this ring's seat is the one that has to make the contract. */
  readonly declaring: boolean;
  readonly mine: boolean;
  readonly outlook: TrickOutlook;
}): string {
  const who = mine ? "You" : "They";
  const goal = declaring ? "make it" : "set it";
  if (outlook.state === "reached") {
    return declaring ? `${who} made the contract` : `${who} set the contract`;
  }
  if (outlook.state === "gone") {
    return declaring ? `${who} cannot make it` : `${who} cannot set it`;
  }
  const tricks = outlook.need === 1 ? "1 trick" : `${outlook.need} tricks`;
  return `${who} need ${tricks} to ${goal}`;
}
