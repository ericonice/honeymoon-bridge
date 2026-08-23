import type { TrickOutlook } from "@hb/engine";

/**
 * How many tricks a seat still needs to win the deal, and whether it got there.
 *
 * One segment per trick of that seat's *own* target — ten for the declarer of
 * 4♠, four for its defender — lit as each is taken. The count is the segments and
 * nothing else: a numeral in the middle was drawn and dropped, because once the
 * ring is discrete it already carries the number and the two together were saying
 * one thing twice.
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
 * **Reaching the target is the only thing that changes the drawing**: a green disc
 * with a check, on whichever ring got there. It marks that side achieving its own
 * goal, so it is the same mark for a contract made and a contract set — which is
 * why this component no longer needs to know whose ring it is. From your seat a
 * check on theirs is bad news, and it is still the true statement about them; the
 * news about *you* is carried by the sound, which is per-device where the rings are
 * per-seat.
 *
 * A ring is live and a disc is decided, which is what lets the check borrow a hue
 * without ambiguity: a green disc cannot be misread as progress, where a
 * nearly-complete green ring could be. **Only one of the pair can ever wear it**,
 * because the two targets sum to one more than the tricks in a deal.
 */
export interface TrickRingProps {
  readonly outlook: TrickOutlook;
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

export function TrickRing({ outlook, size = 24 }: TrickRingProps): React.JSX.Element {
  const centre = size / 2;
  const radius = size * 0.36;
  const width = size * 0.1;
  const reach = size * 0.15;
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
      {Array.from({ length: outlook.target }, (_, index) => (
        <path
          key={index}
          className={index < lit ? "stroke-amber-400" : "stroke-white/20"}
          d={arc(centre, radius, index * slot + gap / 2, (index + 1) * slot - gap / 2)}
          strokeLinecap="butt"
          strokeWidth={width}
        />
      ))}

      {decided ? (
        <>
          <circle
            className="fill-emerald-400"
            cx={centre}
            cy={centre}
            r={radius + width / 2}
          />
          <path
            className="stroke-table-dark"
            d={`M ${centre - reach} ${centre} L ${centre - reach * 0.2} ${centre + reach * 0.75} L ${centre + reach} ${centre - reach * 0.7}`}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={width * 1.3}
          />
        </>
      ) : null}
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
