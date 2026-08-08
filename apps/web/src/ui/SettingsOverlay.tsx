import type { MatchFormat } from "@hb/engine";
import { useState } from "react";
import { BOT_RELEASE } from "../bot/release.js";
import type { Boldness, Pace, Strength } from "../game/identity.js";
import type { Theme } from "../game/theme.js";
import { checkForUpdate, reinstall } from "../game/update.js";

export interface SettingsOverlayProps {
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
  /** Temporary, while it is being decided whether psyching works on a person. */
  readonly psychs: boolean;
  readonly boldness: Boldness;
  readonly pace: Pace;
  readonly strength: Strength;
  onBoldnessChange(next: Boldness): void;
  onPaceChange(next: Pace): void;
  onStrengthChange(next: Strength): void;
  readonly theme: Theme;
  onClose(): void;
  onDevToolsChange(enabled: boolean): void;
  onFormatChange(format: MatchFormat): void;
  onPeekingChange(enabled: boolean): void;
  onPsychsChange(enabled: boolean): void;
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
 * `current` is the interesting one: it is the state in which somebody is
 * looking at a build they believe is stale and has just been told it is not.
 * That is exactly when the reinstall is worth offering, and the only time.
 */
type UpdateState = "checking" | "current" | "failed" | "idle" | "reinstalling" | "updating";

/**
 * The manual half of staying current.
 *
 * `registerServiceWorker` already checks on every return to the app, so this
 * button is for the case where somebody has reason to doubt it — a deploy that
 * just went out, or a screen that looks wrong. It reports the answer either
 * way, because "nothing happened" is indistinguishable from "the check is
 * broken", which is the position this whole feature was written from.
 */
function UpdateControl(): React.JSX.Element {
  const [state, setState] = useState<UpdateState>("idle");

  async function check(): Promise<void> {
    setState("checking");
    // On an update the page is about to reload underneath this, so that state
    // is only ever seen for a moment.
    setState(await checkForUpdate());
  }

  if (state === "updating") {
    return <p className="mt-3 text-xs text-emerald-300">A new build is on its way — reloading.</p>;
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        className="w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        disabled={state === "checking" || state === "reinstalling"}
        onClick={() => {
          void check();
        }}
      >
        {state === "checking" ? "Checking…" : "Check for updates"}
      </button>

      {state === "failed" ? (
        <p className="mt-2 text-xs text-white/40">
          Could not reach the server, so there is no answer either way.
        </p>
      ) : null}

      {state === "reinstalling" ? (
        <p className="mt-2 text-xs text-white/40">Reinstalling…</p>
      ) : null}

      {state === "current" ? (
        <p className="mt-2 text-xs text-white/40">
          This is the latest build.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setState("reinstalling");
              void reinstall();
            }}
          >
            Reinstall
          </button>{" "}
          to download the whole app again.
        </p>
      ) : null}
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
  devTools,
  format,
  onBoldnessChange,
  onClose,
  onDevToolsChange,
  onFormatChange,
  onPaceChange,
  onPeekingChange,
  onPsychsChange,
  onShowHelp,
  onStrengthChange,
  onThemeChange,
  pace,
  peeking,
  playtester,
  psychs,
  strength,
  theme,
}: SettingsOverlayProps): React.JSX.Element {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-table-dark/97">
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

        {/* Above the theme because it changes the game rather than the look of
            it, and it is the one setting somebody might come here to change
            before sitting down to play. */}
        <div className="w-full max-w-sm">
          <Toggle
            label="Play a single game"
            description="A match ends as soon as somebody reaches 100 below the line, worth 300, instead of running to the best of three games. Nobody is ever vulnerable. At a table with somebody else, one game wins if either of you wants it."
            on={format === "game"}
            onChange={(on) => {
              onFormatChange(on ? "game" : "rubber");
            }}
          />
        </div>

        <div className="w-full max-w-sm">
          <Toggle
            label="Hockey theme"
            description="An arena palette and a face-off card back. Turn it off for the green baize a card game usually comes on."
            on={theme === "hockey"}
            onChange={(on) => {
              onThemeChange(on ? "hockey" : "felt");
            }}
          />
        </div>

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
                label="Let the computer bluff"
                description="It will sometimes name a suit it does not hold, hoping you place its cards wrongly for the rest of the deal. Against itself this costs more than it gains; whether it works on a person is the open question. Takes effect on the next match."
                on={psychs}
                onChange={onPsychsChange}
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
          <UpdateControl />
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
