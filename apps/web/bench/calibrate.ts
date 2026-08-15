import { STRAINS, SUITS, applyAction, createRng, opponentOf, startDeal } from "@hb/engine";
import type { Card, Pair, PlayerId, Strain } from "@hb/engine";
import { cardsIn, defenseFromRaw, rawTricks, topRun, tricksFromRaw } from "../src/bot/evaluate.js";
import { createHeuristicBot } from "../src/bot/heuristicBot.js";
import { solve } from "../src/bot/solver.js";
import { botActionFor, loveAll } from "../src/game/botTurn.js";

/**
 * Refits the map from counted winners to tricks actually taken.
 *
 * Every previous fit had to be taken from deals the bot had bid and played,
 * which made it circular twice over: the contracts in the sample were the ones
 * the old constants chose, and the tricks in it were the ones the old card play
 * managed. The solver removes both. Par is computable for *every* hand in
 * *every* strain, whether or not anything would bid it, so the sample is the
 * hands themselves rather than the auctions they happened to produce.
 *
 * Par is a fair target for this bot specifically because measurement says it is:
 * declarer and defender now give away almost exactly the same amount, so the
 * tricks the declarer actually takes land within a rounding error of par. That
 * equivalence is a property of the current bot, not a law — if the two sides
 * ever diverge, this has to go back to measuring played deals.
 *
 *   npx vite-node bench/calibrate.ts [deals]
 */

interface Observation {
  /** The hand this observation's raw and par were computed from — for the shape breakdown. */
  readonly hand: readonly Card[];
  readonly par: number;
  readonly raw: number;
  /** Whether this hand was declaring the strain or defending against it. */
  readonly role: "declare" | "defend";
  readonly strain: Strain;
}

interface Fit {
  readonly intercept: number;
  readonly rSquared: number;
  readonly slope: number;
}

/** Runs the draw with the bot's own policy, then stops. The auction is not wanted. */
function dealHands(seed: number, starter: PlayerId): Pair<readonly Card[]> | null {
  const bot = createHeuristicBot(createRng(seed));
  let state = startDeal({ seed, starter });
  while (state.phase === "draw") {
    state = applyAction(state, state.toAct, botActionFor({ bot, seat: state.toAct, standing: loveAll(), state }));
  }
  return state.initialHands;
}

function observationsFrom(deals: number): Observation[] {
  const observations: Observation[] = [];

  for (let seed = 1; seed <= deals; seed++) {
    const hands = dealHands(seed, (seed % 2) as PlayerId);
    if (hands === null) {
      continue;
    }

    for (const declarer of [0, 1] as const) {
      const defender = opponentOf(declarer);
      let chosen: Observation | null = null;
      let chosenRaw = -Infinity;

      for (const strain of STRAINS) {
        const tricks = solve({
          hands,
          leader: opponentOf(declarer),
          strain,
          trick: [],
        }).tricks;
        observations.push({
          hand: hands[declarer],
          par: tricks[declarer],
          raw: rawTricks({ declaring: true, hand: hands[declarer], strain }),
          role: "declare",
          strain,
        });

        // Defense gets one observation per deal, not five, and it is the strain
        // the declarer would actually pick. Fitting it across all five instead
        // looks more thorough and is wrong: the strain that gets bid is the one
        // *they* are long in, which is disproportionately one this hand is short
        // in, so an unconditional fit is systematically too optimiztic about
        // defending against the contracts that really turn up.
        //
        // Passing declaring:true here too matters: it is the same question
        // `estimatedTricks` asks when the bidder chooses a strain, so leaving it
        // off would pick a different "declarer's choice" than the bidder actually
        // would.
        const declarerRaw = rawTricks({ declaring: true, hand: hands[declarer], strain });
        if (declarerRaw > chosenRaw) {
          chosenRaw = declarerRaw;
          chosen = {
            hand: hands[defender],
            par: tricks[defender],
            raw: rawTricks({ hand: hands[defender], strain }),
            role: "defend",
            strain,
          };
        }
      }

      if (chosen !== null) {
        observations.push(chosen);
      }
    }
  }

  return observations;
}

function fit(observations: readonly Observation[]): Fit {
  const count = observations.length;
  const meanRaw = observations.reduce((total, one) => total + one.raw, 0) / count;
  const meanPar = observations.reduce((total, one) => total + one.par, 0) / count;

  const covariance = observations.reduce(
    (total, one) => total + (one.raw - meanRaw) * (one.par - meanPar),
    0,
  );
  const variance = observations.reduce((total, one) => total + (one.raw - meanRaw) ** 2, 0);
  const slope = covariance / variance;
  const intercept = meanPar - slope * meanRaw;

  const residual = observations.reduce(
    (total, one) => total + (one.par - (intercept + slope * one.raw)) ** 2,
    0,
  );
  const totalSquares = observations.reduce((total, one) => total + (one.par - meanPar) ** 2, 0);

  return { intercept, rSquared: 1 - residual / totalSquares, slope };
}

/** The strain each hand is worth most in, which is the one the bidder is really choosing between. */
function bestStrainOnly(observations: readonly Observation[]): Observation[] {
  const best: Observation[] = [];
  for (let index = 0; index < observations.length; index += STRAINS.length) {
    const group = observations.slice(index, index + STRAINS.length);
    best.push(group.reduce((top, one) => (one.raw > top.raw ? one : top)));
  }
  return best;
}

function report(
  label: string,
  observations: readonly Observation[],
  predict: (raw: number) => number,
): void {
  const result = fit(observations);
  const error =
    observations.reduce((total, one) => total + Math.abs(one.par - predict(one.raw)), 0) /
    observations.length;
  const bias =
    observations.reduce((total, one) => total + (predict(one.raw) - one.par), 0) /
    observations.length;

  console.log(`${label} — ${observations.length} observations`);
  console.log(`  best fit          intercept ${result.intercept.toFixed(2)}, slope ${result.slope.toFixed(3)}`);
  console.log(`  r-squared         ${result.rSquared.toFixed(3)}`);
  console.log(`  current error     ${error.toFixed(2)} tricks on average`);
  console.log(`  current bias      ${bias >= 0 ? "+" : ""}${bias.toFixed(2)} tricks (positive is over-bidding)`);

  // One affine map serves every strain, so a bias that differs by strain is a
  // bias the calibration structurally cannot remove — it would show up as the
  // bot preferring one denomination over another for no reason in the cards.
  for (const strain of STRAINS) {
    const group = observations.filter((one) => one.strain === strain);
    if (group.length === 0) {
      continue;
    }
    const strainBias =
      group.reduce((total, one) => total + (predict(one.raw) - one.par), 0) / group.length;
    console.log(
      `    ${strain.padEnd(3)} ${strainBias >= 0 ? "+" : ""}${strainBias.toFixed(2)}  over ${group.length}`,
    );
  }

  // A single affine fit minimizes error averaged over every hand, which is
  // exactly what lets it hide a bias that grows with the hand rather than with
  // the strain: an outlier hand's error washes out in the mean the same way an
  // outlier deal does. Bucketing by raw — a stand-in for "how strong is this
  // hand" — is what a strain-only breakdown structurally cannot show.
  const BUCKETS = 4;
  const byStrength = [...observations].sort((a, b) => a.raw - b.raw);
  const bucketSize = Math.ceil(byStrength.length / BUCKETS);
  for (let index = 0; index < BUCKETS; index++) {
    const group = byStrength.slice(index * bucketSize, (index + 1) * bucketSize);
    if (group.length === 0) {
      continue;
    }
    const range = `${group[0]!.raw.toFixed(1)}-${group[group.length - 1]!.raw.toFixed(1)}`;
    const bucketBias =
      group.reduce((total, one) => total + (predict(one.raw) - one.par), 0) / group.length;
    console.log(
      `    raw ${range.padEnd(11)} ${bucketBias >= 0 ? "+" : ""}${bucketBias.toFixed(2)}  over ${group.length}`,
    );
  }

  // Raw is one scalar, so a 6-3-2-2 hand and a 5-4-2-2 hand can land on the
  // same raw with the strength split differently across suits — a bias tied to
  // that split would wash out in the raw buckets above the same way a strain
  // bias washes out of the overall average. The second-longest suit is what
  // tells them apart: a hand with a real second suit can win length tricks
  // there too, on top of whatever raw already credited its first suit.
  for (let length = 0; length <= 6; length++) {
    const group = observations.filter((one) => {
      const actual = secondSuitLength(one.hand);
      return length === 6 ? actual >= 6 : actual === length;
    });
    if (group.length === 0) {
      continue;
    }
    const shapeBias =
      group.reduce((total, one) => total + (predict(one.raw) - one.par), 0) / group.length;
    console.log(
      `    2nd suit ${length}${length === 6 ? "+" : " "}       ${shapeBias >= 0 ? "+" : ""}${shapeBias.toFixed(2)}  over ${group.length}`,
    );
  }

  // A short side suit is where a spare trump can ruff a loser instead of
  // conceding it — a mechanism nowhere in `rawTricks` for any strain. If that
  // is what the second-suit-length trend above is actually tracking (a longer
  // second suit usually means a shorter third or fourth one), it should show
  // up keyed directly on shortness rather than on the unrelated suit's length.
  for (let length = 0; length <= 3; length++) {
    const group = observations.filter((one) => {
      const actual = shortestSideSuit(one.hand, one.strain);
      return length === 3 ? actual >= 3 : actual === length;
    });
    if (group.length === 0) {
      continue;
    }
    const shortBias =
      group.reduce((total, one) => total + (predict(one.raw) - one.par), 0) / group.length;
    console.log(
      `    shortest side ${length}${length === 3 ? "+" : " "}   ${shortBias >= 0 ? "+" : ""}${shortBias.toFixed(2)}  over ${group.length}`,
    );
  }

  // Second-suit length is a proxy, and a noisy one: most five-card suits are
  // 87654, not AKQ54, so the bucket above is mostly hands `extraRun` never
  // touches at all, diluting whatever it does to the ones it does. This is the
  // condition it actually keys on — an unbroken run of three or more honors
  // sitting in a suit other than the one being bid — asked directly instead of
  // through a length that only sometimes implies it.
  for (const has of [false, true]) {
    const group = observations.filter((one) => hasLongSideRun(one.hand, one.strain) === has);
    if (group.length === 0) {
      continue;
    }
    const runBias =
      group.reduce((total, one) => total + (predict(one.raw) - one.par), 0) / group.length;
    console.log(
      `    3+ side run ${has ? "yes" : "no "} ${runBias >= 0 ? "+" : ""}${runBias.toFixed(2)}  over ${group.length}`,
    );
  }
  console.log("");
}

/** Length of the second-longest suit — the shape a single raw scalar cannot distinguish. */
function secondSuitLength(hand: readonly Card[]): number {
  const lengths = SUITS.map((suit) => cardsIn(hand, suit).length).sort((a, b) => b - a);
  return lengths[1] ?? 0;
}

/** Whether some suit other than `strain` holds an unbroken run of three or more from the ace. */
function hasLongSideRun(hand: readonly Card[], strain: Strain): boolean {
  return SUITS.some((suit) => suit !== strain && topRun(cardsIn(hand, suit)) >= 3);
}

/** The shortest suit other than `strain` — a proxy for spare-trump ruffing potential. */
function shortestSideSuit(hand: readonly Card[], strain: Strain): number {
  return Math.min(...SUITS.filter((suit) => suit !== strain).map((suit) => cardsIn(hand, suit).length));
}

function run(deals: number): void {
  const started = performance.now();
  const observations = observationsFrom(deals);
  console.log(`${deals} deals, ${observations.length} hand-and-strain pairs, ${((performance.now() - started) / 1000).toFixed(0)}s\n`);

  const declaring = observations.filter((one) => one.role === "declare");
  const defending = observations.filter((one) => one.role === "defend");

  report("Declaring, every strain", declaring, tricksFromRaw);
  report("Declaring, best strain only", bestStrainOnly(declaring), tricksFromRaw);
  // No best-strain cut for defense: the defender does not pick the strain, so
  // every one of these is a hand it may actually have to defend against.
  report("Defending, against the strain they would pick", defending, defenseFromRaw);
}

run(Number(process.argv[2] ?? 300));
