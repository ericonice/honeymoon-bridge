import type { MatchFormat, Unlock } from "@hb/engine";
import { useEffect, useState } from "react";
import {
  DIFFICULTIES,
  DIFFICULTY_BLURB,
  DIFFICULTY_LABEL,
} from "../bot/difficulty.js";
import type { Difficulty } from "../bot/difficulty.js";
import { BOT_RELEASES, LATEST_RELEASE } from "../bot/release.js";
import { runBidTiming } from "../game/bidCost.js";
import { preferredRelease } from "../game/identity.js";
import { botAnchor } from "../game/records.js";
import type { CardColor } from "../game/cardColor.js";
import type { Boldness, Density, DrawStyle, Pace } from "../game/identity.js";
import { flush, outboxState } from "../game/outbox.js";
import type { Theme } from "../game/theme.js";
import { playAchievement } from "../game/soundEffects.js";
import { AchievementToast } from "./AchievementToast.js";
import { HandLogsOverlay } from "./HandLogsOverlay.js";

/**
 * What a rung plays like, and what beating it is worth.
 *
 * The rating is the same number the play screen shows beside the computer's seat
 * and the same one the server rated the last match with — it comes down with the
 * record rather than being kept here, so there is one anchor table and it lives
 * where the rating walk can see it. Omitted entirely when nothing has been
 * fetched that says, which is the offline case and the never-signed-in case;
 * a guessed rating is worse than none, because it is the number somebody would
 * quote at the dinner table.
 *
 * Only the chosen rung's, rather than a figure against each of the four. Four
 * numbers in the picker would invite reading the gaps between them as measured,
 * and they are not: the ladder is a first guess that is known to need re-spacing.
 */
function describeRung(rung: Difficulty): string {
  const rating = botAnchor(preferredRelease().version, rung);
  const blurb = DIFFICULTY_BLURB[rung];
  return rating === null ? blurb : `${blurb} Rated ${rating}.`;
}

/**
 * One of each tier for the preview below, from three different families so the
 * titles are not three variations of one line. Real, existing unlocks rather
 * than invented ones, so what the preview shows is what an unlock looks like.
 */
const PREVIEW_UNLOCKS: readonly Unlock[] = [
  { achievement: "slam", tier: "gold" },
  { achievement: "hands-played", tier: "silver" },
  { achievement: "two-suiter", tier: "bronze" },
];

export interface SettingsOverlayProps {
  readonly cardColor: CardColor;
  readonly devTools: boolean;
  /** Takes effect on the next match; changing it cannot alter one under way. */
  readonly format: MatchFormat;
  /** The house variant, likewise only from the next match onwards. */
  readonly drawStyle: DrawStyle;
  /**
   * Whether to offer the settings that are still being decided.
   *
   * Comes from the server, off the signed-in account, and is not a permission —
   * everything behind it changes how the computer plays on this device. It keeps
   * unfinished behavior away from people who did not volunteer for it.
   */
  readonly playtester: boolean;
  /** Offered to playtesters only; reveals the computer's cards and nobody else's. */
  readonly peeking: boolean;
  /** Temporary, while it is being decided whether the ambiguity works on a person. */
  readonly disguise: boolean;
  readonly boldness: Boldness;
  readonly difficulty: Difficulty;
  readonly opponent: number;
  readonly density: Density;
  readonly pace: Pace;
  readonly sound: boolean;
  readonly tapToSelect: boolean;
  /** Whether the play screen draws each side's trick countdown. */
  readonly trickCount: boolean;
  onBoldnessChange(next: Boldness): void;
  onDifficultyChange(next: Difficulty): void;
  onOpponentChange(next: number): void;
  onCardColorChange(next: CardColor): void;
  onDensityChange(next: Density): void;
  onPaceChange(next: Pace): void;
  onSoundChange(enabled: boolean): void;
  onTapToSelectChange(enabled: boolean): void;
  onTrickCountChange(enabled: boolean): void;
  readonly theme: Theme;
  onClose(): void;
  onDevToolsChange(enabled: boolean): void;
  onFormatChange(format: MatchFormat): void;
  onDrawStyleChange(next: DrawStyle): void;
  onPeekingChange(enabled: boolean): void;
  onDisguiseChange(enabled: boolean): void;
  onShowHelp(): void;
  onThemeChange(theme: Theme): void;
}

function Toggle({
  description,
  label,
  on,
  onChange,
}: {
  readonly description: string;
  readonly label: string;
  readonly on: boolean;
  onChange(next: boolean): void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-xl border border-white/15 px-4 py-3 text-left"
      aria-pressed={on}
      onClick={() => {
        onChange(!on);
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-white/55">{description}</span>
      </span>
      <span
        className={`mt-1 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 ${
          on ? "bg-emerald-400" : "bg-white/20"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white ${on ? "translate-x-4" : "translate-x-0"}`}
        />
      </span>
    </button>
  );
}

/**
 * A choice between three, for the testing rows.
 *
 * A toggle cannot say "more or less of this", and every one of those settings
 * is a number whose right value is unknown rather than a thing to be on or off.
 */
function Choice<T extends string>({
  description,
  label,
  onChange,
  options,
  value,
}: {
  readonly description: string;
  readonly label: string;
  onChange(next: T): void;
  readonly options: readonly { readonly label: string; readonly value: T }[];
  readonly value: T;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-white/15 px-4 py-3">
      <span className="block text-base font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-white/55">{description}</span>
      <div className="mt-2.5 flex gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium ${
              option.value === value ? "bg-white text-stone-900" : "border border-white/15"
            }`}
            onClick={() => {
              onChange(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Settings, reachable from every screen.
 *
 * Only ever offers controls that are safe in a build anyone can open — see
 * `readDevTools`. Anything that could show a player cards they are not entitled
 * to is compiled out of production rather than hidden behind a switch here.
 *
 * Everything in here changes a preference and nothing acts on the match in
 * progress. Leaving one used to sit at the bottom of this list, which is both
 * the wrong category and the wrong place to look for it; it lives in the top
 * bar of the board now, where a phone puts the way back.
 */
/**
 * Anything played but not yet filed with the server.
 *
 * Renders nothing at all when the outbox is empty, which is nearly always — this
 * is not a status light, it is the answer to "my rubber did not save". Down here
 * with the build stamp rather than behind the playtester flag on purpose: the
 * person who needs to read it out is whoever the game went missing for.
 *
 * `stuck` is the interesting half. Waiting means the network was down and it will
 * land; stuck means the server read the report and refused it, which is a bug
 * rather than a connection, and the status is the first useful thing to know
 * about it.
 */
function Unsent(): React.JSX.Element | null {
  const [state, setState] = useState(outboxState);

  useEffect(() => {
    // Opening Settings is as good a moment as any to try again, and somebody
    // looking for a missing result is very likely to be here.
    void flush().then(() => {
      setState(outboxState());
    });
  }, []);

  const pending = [...state.stuck, ...state.waiting];
  if (pending.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/5 px-3 py-2">
      <p className="text-sm text-amber-100/90">
        {pending.length === 1 ? "1 result not sent yet" : `${pending.length} results not sent yet`}
      </p>
      {/* One line each, with what actually happened. The first version said only
          "they will be filed the next time the app has a connection", which is a
          guess dressed as an explanation — a report failing every attempt for some
          other reason looked identical to one waiting out a tunnel. The status and
          the try count are the whole difference between a diagnosis and a shrug. */}
      <ul className="mt-1 flex flex-col gap-0.5">
        {pending.slice(0, 5).map((item) => (
          <li key={item.id} className="text-xs text-white/55">
            {item.kind} · queued {sinceQueued(item.queuedAt)} ·{" "}
            {item.attempts === 0
              ? "not tried yet"
              : `${item.attempts === 1 ? "1 try" : `${item.attempts} tries`}, last: ${item.status}`}
            {item.permanent ? " · refused" : ""}
          </li>
        ))}
        {pending.length > 5 ? (
          <li className="text-xs text-white/35">and {pending.length - 5} more</li>
        ) : null}
      </ul>
      <button
        type="button"
        className="mt-2 rounded-lg border border-white/20 px-3 py-1 text-xs text-white/80"
        onClick={() => {
          void flush().then(() => {
            setState(outboxState());
          });
        }}
      >
        Try again now
      </button>
    </div>
  );
}

/** How long a report has been waiting, in the roundest useful terms. */
function sinceQueued(at: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function SettingsOverlay({
  boldness,
  difficulty,
  opponent,
  cardColor,
  density,
  devTools,
  disguise,
  format,
  onBoldnessChange,
  onDifficultyChange,
  onOpponentChange,
  onCardColorChange,
  onClose,
  onDevToolsChange,
  onDensityChange,
  onDisguiseChange,
  onDrawStyleChange,
  onFormatChange,
  onPaceChange,
  onPeekingChange,
  onShowHelp,
  onSoundChange,
  onTapToSelectChange,
  onTrickCountChange,
  onThemeChange,
  drawStyle,
  pace,
  peeking,
  playtester,
  sound,
  tapToSelect,
  trickCount,
  theme,
}: SettingsOverlayProps): React.JSX.Element {
  const [showingHandLogs, setShowingHandLogs] = useState(false);
  const [previewUnlocks, setPreviewUnlocks] = useState<readonly Unlock[]>([]);
  const [bidCost, setBidCost] = useState<string | null>(null);

  return (
    <div className="safe-inset absolute inset-0 z-30 flex flex-col bg-table-dark/97">
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-5 py-6">
        <h2 className="w-full max-w-sm text-lg font-semibold">Settings</h2>

        {/* Not a setting, and here anyway: the gear is the only control on the
            board, so this is the one place the rules can be reached from inside
            a game — which is where the question gets asked. */}
        <button
          type="button"
          className="w-full max-w-sm rounded-xl border border-white/15 px-4 py-3 text-left"
          onClick={onShowHelp}
        >
          <span className="block text-base font-medium">How to play</span>
          <span className="mt-0.5 block text-xs text-white/55">
            What this game does differently from bridge.
          </span>
        </button>

        {/* The one setting somebody might come here to change before sitting
            down to play, so it's first. Named as a choice between the two
            words a player actually needs, rather than a toggle whose "off"
            position had to be inferred from what "on" said it wasn't. */}
        <div className="w-full max-w-sm">
          <Choice
            label="Match length"
            description="Rubber runs to the best of three games and carries vulnerability once a game is won. A single game ends the moment either side reaches 100 points below the line, worth 300, and nobody is ever vulnerable. At a table with somebody else, one game wins if either of you wants it."
            value={format}
            onChange={onFormatChange}
            options={[
              { label: "Rubber", value: "rubber" },
              { label: "Single game", value: "game" },
            ]}
          />
        </div>

        {/* How hard the computer plays, and the one control that replaced four.
            Strength, boldness, the disguise and the opponent picker all changed
            the difficulty, none of them said so, and using them meant knowing
            what a sample count is. */}
        <div className="w-full max-w-sm">
          <Choice
            label="How hard it plays"
            description={describeRung(difficulty)}
            value={difficulty}
            onChange={onDifficultyChange}
            options={DIFFICULTIES.map((one) => ({
              label: DIFFICULTY_LABEL[one],
              value: one,
            }))}
          />
        </div>

        {/* Directly under match length, because it is the same kind of setting —
            something to decide before sitting down, not while playing — and the
            only other one here that changes the game rather than the computer or
            the look of it. A choice rather than a toggle for the same reason match
            length is one: "take their discard, off" leaves the player to work out
            what off does, where naming both sides says it outright. */}
        <div className="w-full max-w-sm">
          <Choice
            label="Draw style"
            description="How many cards a draw turn offers you, of which you take one. Two is the game as written: the face-up card, or the face-down one sight-unseen. Three is a house rule that adds the top of the discard pile, face up — so the card you throw away is a card they can pick up, and turning down a good card is no longer free. Takes effect on the next match."
            value={drawStyle}
            onChange={onDrawStyleChange}
            options={[
              { label: "Two cards", value: "two-card" },
              { label: "Three cards", value: "three-card" },
            ]}
          />
        </div>

        {/* The app is a fixed frame with nothing scrollable in it, so a screen
            that does not fit is cut off and there is nothing to scroll to reach
            it — and on a 667px phone it does not fit. Compact is what buys the
            room back.

            **Its default is the viewport, not a stored value**, which is the
            whole reason this is worth a row rather than a media query: somebody
            whose phone cannot afford the room should never have to find this,
            and somebody whose phone can should not lose the roomier layout to a
            phone they do not own. The row exists for the two cases automatic
            cannot serve — a large phone whose owner wants more board, and a
            small one whose owner would rather have the fuller scoring and live
            with it. */}
        <div className="w-full max-w-sm">
          <Choice
            label="Layout"
            description="How much room the scoring and the chrome around the board may take. Normal spells the standing out over several lines; compact puts the same figures on one. Starts on whichever suits this screen, and stays wherever you put it."
            value={density}
            onChange={onDensityChange}
            options={[
              { label: "Normal", value: "normal" },
              { label: "Compact", value: "compact" },
            ]}
          />
        </div>

        {/* Out of the testing panel, where it sat while it was still a question —
            twenty-six turns of the same decision either read as deliberate or as
            waiting, and no bench has an opinion about which. Playing it answered
            fast, which is what it already defaulted to, so the question is closed
            and what is left is an ordinary preference. It belongs out here now that
            the game is shared beyond the family: the fastest pace is not the right
            one for somebody meeting the draw for the first time, which is exactly
            who the walkthrough is for. */}
        <div className="w-full max-w-sm">
          <Choice
            label="Game speed"
            description="How fast the draw's twenty-six turns play out, and how long a finished trick sits before the next one starts — one pace for both. Fast is the default; slower is worth a try while you are still learning the draw."
            value={pace}
            onChange={onPaceChange}
            options={[
              { label: "Fast", value: "fast" },
              { label: "Normal", value: "normal" },
              { label: "Slow", value: "slow" },
            ]}
          />
        </div>

        {/* An ordinary preference, and it spent one release in the testing panel by
            mistake — where nobody who is not a playtester could reach it, which is
            everybody the setting exists for. Nothing here is under test: the
            question "how many tricks do I need" is asked out loud every deal, and
            whether you want it answered for you is a matter of taste. */}
        <div className="w-full max-w-sm">
          <Toggle
            label="Count the tricks each side needs"
            description="A small ring beside each played card: one segment per trick that side has to take — ten to make 4♠, four to set it — filling as they take them. It turns orange when one more lost trick would put them on the edge, and closes when the deal is decided, which is often several tricks before the last card. Off if you would rather keep the count yourself."
            on={trickCount}
            onChange={onTrickCountChange}
          />
        </div>

        <div className="w-full max-w-sm">
          <Toggle
            label="Sound"
            description="A few short cues — a call in the auction, a made or a down contract, the rubber won. Works against the computer and at a table with somebody else."
            on={sound}
            onChange={onSoundChange}
          />
        </div>

        {/* Only under the theme it was curated for — felt's blue-on-green
            never had the contrast problem these are picked to solve, so
            there is nothing yet to offer it. Offered to everyone rather than
            gated with the theme toggle itself: the theme is still unsettled,
            but whichever one somebody is on, this is a real preference. */}
        {theme === "hockey" ? (
          <div className="w-full max-w-sm">
            <Choice
              label="Card back"
              description="A few options, each checked for contrast against the rink."
              value={cardColor}
              onChange={onCardColorChange}
              options={[
                { label: "Gold", value: "gold" },
                { label: "Crimson", value: "crimson" },
                { label: "Pewter", value: "pewter" },
              ]}
            />
          </div>
        ) : null}

        {playtester ? (
          <div className="w-full max-w-sm rounded-2xl border border-amber-300/30 bg-amber-300/5 p-3">
            {/* Padded to match the rows below. Each of those is a bordered box
                with its own px-4, so heading text sitting at the panel's own
                padding edge lands on a different left edge from every label
                underneath it. */}
            <div className="px-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">
                Testing only
              </p>
              <p className="mt-1 text-xs text-white/50">
                Not preferences. Some of these change how the computer plays while the right setting
                is still being worked out; the rest just show what it is up to. All of them will
                change or disappear.
              </p>
            </div>

            {/* One stack with one gap, so no row can drift out of step with the
                others as they are added and removed. */}
            <div className="mt-3 space-y-3">
              <Toggle
                label="Hockey theme"
                description="An arena palette and a face-off card back. Turn it off for the green baize a card game usually comes on. Still settling on a look, which is why it's here rather than a permanent preference."
                on={theme === "hockey"}
                onChange={(on) => {
                  onThemeChange(on ? "hockey" : "felt");
                }}
              />

              <Toggle
                label="Noah's tap-to-play"
                description="Tap a card to raise it, tap it again to play it. Tapping a different card just moves the raise there instead. Off plays a card as soon as you lift your finger from it."
                on={tapToSelect}
                onChange={onTapToSelectChange}
              />

              <Toggle
                label="Let the computer bid unpredictably"
                description="It will sometimes name a decent suit rather than its objectively best one, so a bid alone can't be read as this hand's exact shape. It will never name a suit with fewer than three cards, and rarely one with only three. Takes effect on the next match."
                on={disguise}
                onChange={onDisguiseChange}
              />

              {/* A measurement tool now rather than a preference. It was the best
                  difficulty lever in here until there was a difficulty setting;
                  now it answers "which opponent", which only matters when
                  comparing one release against another. */}
              {BOT_RELEASES.length > 1 ? (
                <div className="w-full max-w-sm">
                  <Choice
              label="Which computer you play"
              description="Each is a version of the computer as it was when that version shipped, kept playable so the older, gentler opponent stays available. Takes effect on the next match."
              value={String(opponent)}
              onChange={(next) => {
                onOpponentChange(Number(next));
              }}
              options={BOT_RELEASES.map((release) => ({
                label: `${release.name} (v${release.version})`,
                value: String(release.version),
              }))}
                  />
                </div>
              ) : null}

              <Choice
                label="How boldly it bids"
                description="What a game in hand is worth to it. Measured against itself the answer came out higher than what is shipped, because a computer that never doubles you cannot punish overbidding — and you can."
                value={boldness}
                onChange={onBoldnessChange}
                options={[
                  { label: "Cautious", value: "cautious" },
                  { label: "Normal", value: "normal" },
                  { label: "Bold", value: "bold" },
                ]}
              />

              {/* Only ever the computer's cards, and only in the game against
                  it. Over a network the server does not send the other hand at
                  all, so this cannot reveal a person's cards however it is set —
                  see `networkSession`, which holds `opponentHand` at null. */}
              <Toggle
                label="Reveal the computer's cards"
                description="Shows the bot's hand, the card it is deciding on, and names both cards of its last draw. Only against the computer — at a table with a person their cards are never sent to your device at all."
                on={peeking}
                onChange={onPeekingChange}
              />

              <Toggle
                label="Developer shortcuts"
                description="Adds a control that plays the current phase out at once, for reaching the auction or the scoring without playing every turn."
                on={devTools}
                onChange={onDevToolsChange}
              />

              {/* An unlock is a rare event — the counter families cross at 50,
                  250 and 1000, and most of the rest are once-ever — so the one
                  thing that cannot be checked by playing is the notification
                  itself. This shows all three tiers at once, which is also the
                  only way to compare the metals side by side, and plays the
                  sound.

                  It exercises the toast and the cue, not the detection: whether
                  a real unlock reaches `justUnlocked` is `useAchievementTracker`
                  and the server's business, and nothing here stands in for it. */}
              <button
                type="button"
                className="w-full rounded-xl border border-white/15 px-4 py-3 text-left"
                onClick={() => {
                  setPreviewUnlocks(PREVIEW_UNLOCKS);
                  playAchievement();
                }}
              >
                <span className="block text-base font-medium">Preview an unlock</span>
                <span className="mt-0.5 block text-xs text-white/55">
                  Shows the notification with a bronze, a silver and a gold, and plays the sound it
                  arrives with.
                </span>
              </button>

              {/* The one measurement that cannot be taken anywhere but here.
                  `bench/bidcost.ts` runs the identical code on a desktop; what
                  decides whether bidding can search is the ratio between the two,
                  and phones vary by a factor of two either way. */}
              <button
                type="button"
                className="w-full rounded-xl border border-white/15 px-4 py-3 text-left"
                onClick={() => {
                  setBidCost(runBidTiming());
                }}
              >
                <span className="block text-base font-medium">Time a bid search</span>
                <span className="mt-0.5 block text-xs text-white/55">
                  {bidCost === null
                    ? "Guesses the other hand 25 times and solves each, which is what bidding by search would cost. Blocks for a second or two on purpose."
                    : bidCost}
                </span>
              </button>

              {/* Raw for now — see `HandLogsOverlay`. What a later pass will
                  actually assess the bot against, not a preference. */}
              <button
                type="button"
                className="w-full rounded-xl border border-white/15 px-4 py-3 text-left"
                onClick={() => {
                  setShowingHandLogs(true);
                }}
              >
                <span className="block text-base font-medium">Logged hands</span>
                <span className="mt-0.5 block text-xs text-white/55">
                  Every robot-game deal reported so far, raw.
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {/* From a phone there is otherwise no way to tell a fresh deployment
            from a service worker still serving the last one. */}
        <div className="w-full max-w-sm pt-2 text-xs text-white/40">
          {/* Which computer opponent this is. Named here and only here — across
              the table it stays the computer. */}
          <p className="text-sm text-white/55">
            Bot version v{LATEST_RELEASE.version} ({LATEST_RELEASE.name})
          </p>
          <p className="mt-2 text-sm text-white/55">Version {__APP_VERSION__}</p>
          <Unsent />
          <p className="mt-0.5">
            Build {__BUILD_ID__} · {__BUILD_TIME__} UTC
          </p>
          <p className="mt-1 text-white/30">
            A trailing + means the build had uncommitted changes.
          </p>
        </div>
      </div>

      <div className="px-5 pb-5">
        <button
          type="button"
          className="w-full rounded-xl bg-white px-4 py-3.5 text-base font-semibold text-stone-900"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <AchievementToast
        unlocked={previewUnlocks}
        onDismiss={() => {
          setPreviewUnlocks([]);
        }}
      />

      {showingHandLogs ? (
        <HandLogsOverlay
          onClose={() => {
            setShowingHandLogs(false);
          }}
        />
      ) : null}
    </div>
  );
}
