import { COUNTER_THRESHOLDS, unlockKey } from "@hb/engine";
import type { AchievementId, CounterKey, Tier } from "@hb/engine";
import { ACHIEVEMENT_ORDER, ACHIEVEMENTS, tierLabel } from "../game/labels.js";
import type { AchievementSnapshot } from "../game/achievements.js";
import { useAchievements } from "../game/achievements.js";
import { FamilyIcon } from "./icons.js";
import { TIER_FILL, TIER_INK, TIER_UNHELD, bestHeld } from "./tiers.js";

export interface AchievementsProps {
  readonly signedIn: boolean;
  onBack(): void;
  onSignIn(): void;
}

const TIERS: readonly Tier[] = ["bronze", "silver", "gold"];

function isCounterBacked(id: AchievementId): id is CounterKey {
  return Object.hasOwn(COUNTER_THRESHOLDS, id);
}

/** The next threshold not yet reached, and how close the current count is to it. */
function progressToward(id: CounterKey, count: number): { readonly next: number; readonly tier: Tier } | null {
  const thresholds = COUNTER_THRESHOLDS[id];
  const tiers: readonly [Tier, number][] = [
    ["bronze", thresholds[0]],
    ["silver", thresholds[1]],
    ["gold", thresholds[2]],
  ];
  const upcoming = tiers.find(([, threshold]) => count < threshold);
  return upcoming === undefined ? null : { next: upcoming[1], tier: upcoming[0] };
}

function FamilyCard({
  held,
  id,
  snapshot,
}: {
  readonly held: ReadonlySet<string>;
  readonly id: AchievementId;
  readonly snapshot: AchievementSnapshot;
}): React.JSX.Element {
  const info = ACHIEVEMENTS[id];
  const earnedTiers = TIERS.filter((tier) => tier in info.tiers);
  // The family's own icon takes the metal of the *best* tier held rather than a
  // flat "any of them". Scanning this screen is mostly asking "where am I doing
  // well", and one glance down a column of metals answers it where a column of
  // identical amber never could.
  const best = bestHeld((tier) => held.has(unlockKey({ achievement: id, tier })));

  return (
    <div className="rounded-xl border border-white/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <FamilyIcon
          achievement={id}
          className={`mt-0.5 h-6 w-6 shrink-0 ${best === null ? "text-white/25" : TIER_INK[best]}`}
        />
        <div className="min-w-0 flex-1">
          <span className="block text-base font-semibold">{info.name}</span>
          <span className="mt-0.5 block text-xs text-white/45">{info.description}</span>

          {/* A grid rather than wrapped chips: a badge sized to its own text
              wraps unevenly once descriptions differ in length — two tiers
              fit a row and the third is orphaned onto its own, and every
              family wraps at a different point. Equal-width columns, one per
              tier this family actually has, wrap each description inside its
              own cell instead, so every card lines up the same way. */}
          <div
            className="mt-2 grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${earnedTiers.length}, 1fr)` }}
          >
            {earnedTiers.map((tier) => {
              const unlocked = held.has(unlockKey({ achievement: id, tier }));
              return (
                <div
                  key={tier}
                  className={`rounded-lg px-2 py-1.5 text-center ${
                    unlocked ? `${TIER_FILL[tier]} ${TIER_INK[tier]}` : TIER_UNHELD
                  }`}
                >
                  <div className="text-[11px] font-semibold">{tierLabel(tier)}</div>
                  <div className="mt-0.5 text-[10px] leading-tight">{info.tiers[tier]}</div>
                </div>
              );
            })}
          </div>

          {isCounterBacked(id) ? (
            <p className="mt-2 text-xs text-white/40">
              {(snapshot.counters[id] ?? 0).toLocaleString()} so far
              {(() => {
                const upcoming = progressToward(id, snapshot.counters[id] ?? 0);
                return upcoming === null
                  ? " — every tier reached"
                  : `, ${upcoming.next.toLocaleString()} for ${tierLabel(upcoming.tier)}`;
              })()}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Body({
  signedIn,
  onSignIn,
}: {
  readonly signedIn: boolean;
  onSignIn(): void;
}): React.JSX.Element {
  const { loading, snapshot } = useAchievements(signedIn);

  if (!signedIn) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-white/60">
          Achievements attach to your account, so they follow you rather than the browser you
          happened to be playing in. Sign in to start collecting them.
        </p>
        <button
          type="button"
          className="rounded-xl border border-white/25 px-4 py-3 text-base text-white"
          onClick={onSignIn}
        >
          Sign in
        </button>
      </div>
    );
  }
  if (loading && snapshot === null) {
    return <p className="text-sm text-white/40">Looking up your achievements…</p>;
  }
  if (snapshot === null) {
    return <p className="text-sm text-white/40">Could not load your achievements.</p>;
  }

  const held = new Set(snapshot.unlocked.map(unlockKey));

  return (
    <div className="flex flex-col gap-3">
      {ACHIEVEMENT_ORDER.map((id) => (
        <FamilyCard key={id} held={held} id={id} snapshot={snapshot} />
      ))}
    </div>
  );
}

/**
 * What has been unlocked and what has not, in one list rather than tucked
 * behind a running total — every tier is shown, locked ones dimmed rather than
 * hidden, so this also serves as the list of what there is to go for.
 *
 * Its own screen for the same reason `Record` is one rather than a panel in
 * Settings: this grows with play, and Settings is a list of things to change.
 */
export function Achievements({ onBack, onSignIn, signedIn }: AchievementsProps): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-8">
        <h1 className="text-2xl font-semibold">Achievements</h1>
        <Body signedIn={signedIn} onSignIn={onSignIn} />
      </div>

      <div className="px-6 pb-6">
        <button
          type="button"
          className="w-full rounded-xl border border-white/25 px-4 py-3.5 text-base text-white"
          onClick={onBack}
        >
          Back
        </button>
      </div>
    </div>
  );
}
