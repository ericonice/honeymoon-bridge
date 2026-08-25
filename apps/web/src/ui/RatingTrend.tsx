import type { RatingPoint } from "../game/records.js";
import { STARTING_RATING } from "../game/records.js";

/**
 * How the rating got where it is, one point per rated match.
 *
 * **This is the one chart in the app, and it earned that by being the one series
 * that is not noise.** A per-match points margin is a random walk — one doubled
 * contract swings it hundreds — so a line through it would be fiction. A rating is
 * the opposite: it moves only by `K × (result − expected)`, so it is bounded,
 * ordered, and evenly spaced by match. The line is the quantity rather than an
 * inference laid over it.
 *
 * Plotted against matches, not time. A rating changes only when you play, so a time
 * axis would be long flat stretches meaning "did not play this week".
 */
export interface RatingTrendProps {
  readonly history: readonly RatingPoint[];
}

/**
 * Matches before the line means anything.
 *
 * Everybody starts at `STARTING_RATING`, and the first results move by nearly a
 * whole step each because the expectation is still wrong — so the opening
 * stretch ramps whatever the player did. **Shaded rather than trimmed**: hiding
 * it would make the line start at an unexplained height, where saying "settling"
 * explains both the shape and why it should be ignored.
 *
 * Ten because that is the server's `PROVISIONAL_MATCHES` — the stretch where a
 * result really does move the rating twice as far, so the band marks a fact
 * about the arithmetic rather than a caution somebody chose. The two are not
 * imported from one place, because they live in different workspaces; if the
 * server's changes, this has to follow, and the band is the more forgiving of
 * the two to be wrong.
 */
const SETTLING = 10;

/** Enough points that a line is a line. Below this it is two dots and a guess. */
const MINIMUM = 4;

const WIDTH = 336;
const HEIGHT = 54;
const PAD = 4;

/**
 * Every point where the opponent stopped being the same opponent — see
 * `bot/release.ts`.
 *
 * **All of them, and it used to be the first one only.** This returned a single
 * index and the chart drew a single rule, which was indistinguishable from correct
 * for as long as there had been exactly one release change in anybody's history.
 * The moment v3 shipped, a line spanning v1, v2 and v3 drew the v1-to-v2 rule and
 * silently dropped the one somebody had just created. A "the" in a function name
 * is worth suspecting whenever the thing it names can happen twice.
 */
function versionChanges(history: readonly RatingPoint[]): readonly number[] {
  const changes: number[] = [];
  for (let index = 1; index < history.length; index += 1) {
    const before = history[index - 1]!.botVersion;
    const now = history[index]!.botVersion;
    // Only a change between two *known* bots is an event. Null is a person, and
    // "person, then computer" is not a change of opponent strength worth a rule.
    if (before !== null && now !== null && before !== now) {
      changes.push(index);
    }
  }
  return changes;
}

export function RatingTrend({ history }: RatingTrendProps): React.JSX.Element | null {
  if (history.length < MINIMUM) {
    return null;
  }

  const ratings = history.map((point) => point.rating);
  // The average is the reference because it is the one that lands *inside* the
  // data. Drawing the computer's own anchor was tried and fails on real numbers:
  // a player 300 clear of it squashes the whole line into the top fifth and loses
  // the shape they came to see. A reference has to be in range to be worth its
  // space, so the bot's rating is a caption instead.
  const low = Math.min(...ratings, STARTING_RATING) - 8;
  const high = Math.max(...ratings, STARTING_RATING) + 8;

  const x = (index: number): number => (index / (history.length - 1)) * (WIDTH - 2) + 1;
  const y = (rating: number): number =>
    HEIGHT - PAD - ((rating - low) / (high - low)) * (HEIGHT - PAD * 2);

  const path = ratings
    .map((rating, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(rating).toFixed(1)}`)
    .join(" ");
  const changes = versionChanges(history);
  const settling = Math.min(SETTLING, history.length - 1);

  return (
    <svg
      aria-hidden="true"
      className="w-full"
      height={HEIGHT}
      preserveAspectRatio="none"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
    >
      {settling <= 0 ? null : (
        <>
          <rect className="fill-white/5" height={HEIGHT} width={x(settling)} x={0} y={0} />
          <text
            className="fill-white/30 font-mono"
            fontSize="7.5"
            letterSpacing="0.08em"
            x={3}
            y={HEIGHT - 3}
          >
            SETTLING
          </text>
        </>
      )}

      <line
        className="stroke-white/20"
        strokeDasharray="3 3"
        x1={0}
        x2={WIDTH}
        y1={y(STARTING_RATING)}
        y2={y(STARTING_RATING)}
      />
      <text
        className="fill-white/35 font-mono"
        fontSize="8"
        textAnchor="end"
        x={WIDTH - 2}
        y={y(STARTING_RATING) - 3}
      >
        {STARTING_RATING}
      </text>

      {changes.map((changed) => (
        <g key={changed}>
          <line
            className="stroke-amber-300/45"
            x1={x(changed)}
            x2={x(changed)}
            y1={PAD - 2}
            y2={HEIGHT - PAD + 2}
          />
          <text className="fill-amber-300/70 font-mono" fontSize="7.5" x={x(changed) + 3} y={PAD + 6}>
            v{history[changed]!.botVersion}
          </text>
        </g>
      ))}

      <path
        className="stroke-emerald-300"
        d={path}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
      <circle
        className="fill-emerald-300"
        cx={x(history.length - 1)}
        cy={y(ratings[ratings.length - 1]!)}
        r={2.4}
      />
    </svg>
  );
}
