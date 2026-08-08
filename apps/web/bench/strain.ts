import { STRAINS, buildDeck, cardId, createRng, shuffle } from "@hb/engine";
import type { Card, Rank, Suit } from "@hb/engine";
import { estimatedTricks } from "../src/bot/evaluate.js";
import { solve } from "../src/bot/solver.js";

/**
 * What one hand is actually worth in each strain, by measurement.
 *
 * Hand evaluation is full of judgments that sound convincing either way — is a
 * four-card suit headed by AK better as trumps or as two winners at no-trump?
 * The solver answers it: deal the other hand at random a few hundred times and
 * average. Written to settle exactly that question, and kept because the next
 * such argument is not far off.
 *
 *   npx vite-node bench/strain.ts "S:AK4 H:AK4 D:A43 C:AK32" [trials]
 */

function hand(spec: string): Card[] {
  const ranks: Record<string, Rank> = {
    A: 14, K: 13, Q: 12, J: 11, T: 10,
    "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
  };
  return spec.split(" ").flatMap((group) => {
    const [suit, cards] = group.split(":") as [Suit, string];
    return [...cards].map((rank) => ({ rank: ranks[rank]!, suit }));
  });
}

function run(spec: string, trials: number): void {
  const mine = hand(spec);
  const held = new Set(mine.map(cardId));
  const pool = buildDeck().filter((card) => !held.has(cardId(card)));
  const rng = createRng(4242);

  // The same opponent hands for every strain. Drawing fresh ones per strain
  // buries a difference of a tenth of a trick under the variance of the deal,
  // which is exactly the size of difference worth asking about.
  const opponents = Array.from({ length: trials }, () => shuffle(pool, rng).slice(0, 13));

  console.log(`${spec} — ${mine.length} cards`);
  console.log(`par tricks as declarer over ${trials} shared opponent hands, against the estimate\n`);

  for (const strain of STRAINS) {
    let total = 0;
    for (const theirs of opponents) {
      total += solve({ hands: [mine, theirs], leader: 1, strain, trick: [] }).tricks[0];
    }
    const measured = total / trials;
    const estimated = estimatedTricks(mine, strain);
    console.log(
      `  ${strain.padEnd(3)} measured ${measured.toFixed(2)}   estimated ${estimated.toFixed(2)}   ` +
        `${estimated - measured >= 0 ? "+" : ""}${(estimated - measured).toFixed(2)}`,
    );
  }
}

run(process.argv[2] ?? "S:AK4 H:AK4 D:A43 C:AK32", Number(process.argv[3] ?? 300));
