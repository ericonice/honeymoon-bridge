import type { MatchFormat } from "@hb/engine";
import type { Account } from "../game/account.js";
import type { Theme } from "../game/theme.js";
import { AccountPanel } from "./AccountPanel.js";

export interface SettingsOverlayProps {
  readonly account: Account | null;
  readonly checkingAccount: boolean;
  readonly devTools: boolean;
  /** Takes effect on the next match; changing it cannot alter one under way. */
  readonly format: MatchFormat;
  /** Development builds only; the row is compiled out of anything that ships. */
  readonly peeking: boolean;
  readonly theme: Theme;
  /** Null when there is no game to leave. */
  readonly onLeaveGame: (() => void) | null;
  onClose(): void;
  onDevToolsChange(enabled: boolean): void;
  onFormatChange(format: MatchFormat): void;
  onPeekingChange(enabled: boolean): void;
  onSignOut(): void;
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
 * Settings, reachable from every screen.
 *
 * Only ever offers controls that are safe in a build anyone can open — see
 * `readDevTools`. Anything that could show a player cards they are not entitled
 * to is compiled out of production rather than hidden behind a switch here.
 */
export function SettingsOverlay({
  account,
  checkingAccount,
  devTools,
  format,
  onClose,
  onDevToolsChange,
  onFormatChange,
  onLeaveGame,
  onPeekingChange,
  onSignOut,
  onThemeChange,
  peeking,
  theme,
}: SettingsOverlayProps): React.JSX.Element {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-table-dark/97">
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-5 py-6">
        <h2 className="w-full max-w-sm text-lg font-semibold">Settings</h2>

        <div className="w-full max-w-sm">
          <AccountPanel account={account} checking={checkingAccount} onSignOut={onSignOut} />
        </div>

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

        <div className="w-full max-w-sm">
          <Toggle
            label="Developer shortcuts"
            description="Adds a control that plays the current phase out at once, for reaching the auction or the scoring without playing every turn."
            on={devTools}
            onChange={onDevToolsChange}
          />
        </div>

        {/* Guarded on DEV so the whole row folds away rather than merely being
            hidden. Unlike the shortcuts above, this one shows cards a player is
            not entitled to see, so it must never reach a build anyone can open
            — the line drawn in REQUIREMENTS §3.6. */}
        {import.meta.env.DEV ? (
          <div className="w-full max-w-sm">
            <Toggle
              label="Reveal opponent's cards"
              description="Shows the bot's hand, the card it is deciding on, and names both cards of its last draw. Local development only — never in a deployed build."
              on={peeking}
              onChange={onPeekingChange}
            />
          </div>
        ) : null}

        {onLeaveGame === null ? null : (
          <div className="w-full max-w-sm pt-2">
            <button
              type="button"
              className="w-full rounded-xl border border-white/25 px-4 py-3 text-base text-white"
              onClick={onLeaveGame}
            >
              Leave game
            </button>
            {/* Deliberately not naming the format: this panel knows the setting
                for the *next* match, which is not necessarily the one being
                abandoned. Saying neither is better than saying the wrong one. */}
            <p className="mt-1 text-xs text-white/40">
              Whatever has been played is lost — there is nowhere to keep it yet.
            </p>
          </div>
        )}

        {/* From a phone there is otherwise no way to tell a fresh deployment
            from a service worker still serving the last one. */}
        <div className="w-full max-w-sm pt-2 text-xs text-white/40">
          <p>
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
