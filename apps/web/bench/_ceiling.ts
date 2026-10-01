import { readFileSync } from "node:fs";
import { STRAINS, applyAction, cardId, createRng, opponentOf, startDeal, viewFor } from "@hb/engine";
import type { Card, Pair, PlayerId } from "@hb/engine";
import { chooseTake } from "../src/bot/drawDecision.js";
import { solve } from "../src/bot/solver.js";
const S = process.env.S!;
const J: any[] = JSON.parse(readFileSync(`${S}/joined.json`, "utf8"));
const BOARDS = Number(process.env.BOARDS ?? 80);
const SAMPLES = Number(process.env.SAMPLES ?? 150);

/**
 * The thirteen pairs seat 0 was offered — by set difference, never by position.
 * A hand is a list in whatever order the engine built it and `viewFor` sorts it,
 * so "the last card" is not the new one; reading it that way made the bot's own
 * hand unreconstructable and the sampled best came out below the person's.
 */
function offersFor(seed: number, starter: PlayerId): { pairs: Pair<Card>[]; bot: Card[] } {
  const pairs: Pair<Card>[] = [];
  let s = startDeal({ seed, starter });
  while (s.phase === "draw") {
    const seat = s.toAct;
    const v = viewFor(s, seat);
    const handBefore = new Set(v.hand.map(cardId));
    const discardBefore = new Set(s.discards[seat].map(cardId));
    const next = applyAction(s, seat, {
      type: "draw-decide",
      take: chooseTake({ countsLive: true, first: v.pending!, hand: v.hand, remembered: s.discards[seat] }),
    });
    if (seat === 0) {
      const after = next.initialHands === null ? viewFor(next, 0).hand : next.initialHands[0];
      const gained = after.filter((c) => !handBefore.has(cardId(c)));
      const thrown = next.discards[0].filter((c) => !discardBefore.has(cardId(c)));
      if (gained.length === 1 && thrown.length === 1) pairs.push([gained[0]!, thrown[0]!]);
    }
    s = next;
  }
  return { pairs, bot: pairs.map((p) => p[0]) };
}
const bestPar = (h: Pair<readonly Card[]>, d: PlayerId) =>
  Math.max(...STRAINS.map((x) => solve({ hands: h, leader: opponentOf(d), strain: x, trick: [] }).tricks[d]));

/** The control: the person's real hand must be one card from each pair. */
function constructible(pairs: readonly Pair<Card>[], hand: readonly Card[]): boolean {
  const held = new Set(hand.map(cardId));
  return pairs.length === 13 && pairs.every((p) => held.has(cardId(p[0])) !== held.has(cardId(p[1])));
}

const rows: { person: number; bot: number; best: number; worst: number; mean: number; pPct: number; bPct: number }[] = [];
let checked = 0, ok = 0;
for (let i = 0; i < Math.min(BOARDS, J.length); i++) {
  const x = J[i];
  const theirs: readonly Card[] = x.deal.initialHands[1];
  const { pairs, bot: botHand } = offersFor(x.board.seed, x.board.starter as PlayerId);
  checked += 1;
  if (!constructible(pairs, x.deal.initialHands[0])) continue;
  ok += 1;
  const rng = createRng(x.board.seed ^ 0xbeef);
  const scores: number[] = [];
  for (let s = 0; s < SAMPLES; s++) {
    scores.push(bestPar([pairs.map((p) => (rng.next() < 0.5 ? p[0] : p[1])), theirs], 0));
  }
  const person = bestPar([x.deal.initialHands[0], theirs], 0);
  const bot = bestPar([botHand, theirs], 0);
  scores.sort((a, b) => a - b);
  const pct = (v: number) => (scores.filter((q) => q < v).length / scores.length) * 100;
  rows.push({
    person, bot, best: scores[scores.length - 1]!, worst: scores[0]!,
    mean: scores.reduce((a, b) => a + b, 0) / scores.length, pPct: pct(person), bPct: pct(bot),
  });
}
console.log(`pairs reconstructed and the person's own hand built from them: ${ok}/${checked}\n`);
const avg = (f: (r: typeof rows[0]) => number) => rows.reduce((t, r) => t + f(r), 0) / rows.length;
console.log(`${rows.length} streams, ${SAMPLES} of each stream's 8,192 hands sampled\n`);
console.log(`  worst of the sampled hands       ${avg((r) => r.worst).toFixed(2)} tricks`);
console.log(`  a hand picked at random          ${avg((r) => r.mean).toFixed(2)}`);
console.log(`  THE BOT (v4)                     ${avg((r) => r.bot).toFixed(2)}   ${avg((r) => r.bPct).toFixed(0)}th percentile`);
console.log(`  THE PERSON                       ${avg((r) => r.person).toFixed(2)}   ${avg((r) => r.pPct).toFixed(0)}th percentile`);
console.log(`  best of the sampled hands        ${avg((r) => r.best).toFixed(2)}`);
console.log(`\n  bot -> person   +${(avg((r) => r.person) - avg((r) => r.bot)).toFixed(2)}`);
console.log(`  person -> best  +${(avg((r) => r.best) - avg((r) => r.person)).toFixed(2)}  (headroom still on the table)`);
