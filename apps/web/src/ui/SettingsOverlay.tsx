import type { MatchFormat } from "@hb/engine";
import { useState } from "react";
import type { Account } from "../game/account.js";
import type { Theme } from "../game/theme.js";
import { checkForUpdate, reinstall } from "../game/update.js";
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
  account,
  checkingAccount,
  devTools,
  format,
  onClose,
  onDevToolsChange,
  onFormatChange,
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

        {/* From a phone there is otherwise no way to tell a fresh deployment
            from a service worker still serving the last one. */}
        <div className="w-full max-w-sm pt-2 text-xs text-white/40">
          <p className="text-sm text-white/55">Version {__APP_VERSION__}</p>
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
