import type { MatchFormat } from "@hb/engine";
import { BOT_RELEASE } from "../bot/release.js";
import type { CardColor } from "../game/cardColor.js";
import type { Boldness, Pace, Strength } from "../game/identity.js";
import type { Theme } from "../game/theme.js";

export interface SettingsOverlayProps {
  readonly cardColor: CardColor;
  readonly devTools: boolean;
  /** Takes effect on the next match; changing it cannot alter one under way. */
  readonly format: MatchFormat;
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
  readonly pace: Pace;
  readonly sound: boolean;
  readonly strength: Strength;
  readonly tapToSelect: boolean;
  onBoldnessChange(next: Boldness): void;
  onCardColorChange(next: CardColor): void;
  onPaceChange(next: Pace): void;
  onSoundChange(enabled: boolean): void;
  onStrengthChange(next: Strength): void;
  onTapToSelectChange(enabled: boolean): void;
  readonly theme: Theme;
  onClose(): void;
  onDevToolsChange(enabled: boolean): void;
  onFormatChange(format: MatchFormat): void;
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
export function SettingsOverlay({
  boldness,
  cardColor,
  devTools,
  disguise,
  format,
  onBoldnessChange,
  onCardColorChange,
  onClose,
  onDevToolsChange,
  onDisguiseChange,
  onFormatChange,
  onPaceChange,
  onPeekingChange,
  onShowHelp,
  onSoundChange,
  onStrengthChange,
  onTapToSelectChange,
  onThemeChange,
  pace,
  peeking,
  playtester,
  sound,
  strength,
  tapToSelect,
  theme,
}: SettingsOverlayProps): React.JSX.Element {
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

              <Choice
                label="How strong it is"
                description="How many hands it guesses at before each card. Fewer makes an opponent that is unsure rather than one that blunders on purpose. Takes effect on the next match."
                value={strength}
                onChange={onStrengthChange}
                options={[
                  { label: "Weaker", value: "weak" },
                  { label: "Normal", value: "normal" },
                  { label: "Stronger", value: "strong" },
                ]}
              />

              <Choice
                label="How fast the draw runs"
                description="Twenty-six turns of the same decision, which either reads as deliberate or as waiting. Nothing but playing it can say which."
                value={pace}
                onChange={onPaceChange}
                options={[
                  { label: "Brisk", value: "brisk" },
                  { label: "Normal", value: "normal" },
                  { label: "Slow", value: "slow" },
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
            </div>
          </div>
        ) : null}

        {/* From a phone there is otherwise no way to tell a fresh deployment
            from a service worker still serving the last one. */}
        <div className="w-full max-w-sm pt-2 text-xs text-white/40">
          {/* Which computer opponent this is. Named here and only here — across
              the table it stays the computer. */}
          <p className="text-sm text-white/55">
            Bot version v{BOT_RELEASE.version} ({BOT_RELEASE.name})
          </p>
          <p className="mt-2 text-sm text-white/55">Version {__APP_VERSION__}</p>
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
    </div>
  );
}
