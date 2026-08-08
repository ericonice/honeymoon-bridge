import { useRef, useState } from "react";
import { useAccount } from "./game/account.js";
import { readDevTools, writeDevTools } from "./game/devTools.js";
import { preferredFormat, setPreferredFormat } from "./game/identity.js";
import {
  clearLocationHash,
  codeFromLocation,
  setLocationCode,
  signInTokenFromLocation,
} from "./game/serverUrl.js";
import { applyTheme, readTheme, ThemeContext, writeTheme } from "./game/theme.js";
import { Home } from "./ui/Home.js";
import { Record } from "./ui/Record.js";
import { RobotGame } from "./ui/RobotGame.js";
import { Searching } from "./ui/Searching.js";
import { SettingsOverlay } from "./ui/SettingsOverlay.js";
import { SignIn } from "./ui/SignIn.js";
import { TableGame } from "./ui/TableGame.js";

/**
 * Which screen is up.
 *
 * A table lives in the URL hash rather than in a route, so an invite link is a
 * plain link that needs no server-side rewrite to work — and opening one goes
 * straight to the table instead of past a menu. A sign-in link is the same
 * trick, which is why it is a hash too rather than a path the server would have
 * to know about.
 */
type Screen =
  | "home"
  | "record"
  | "robot"
  | "searching"
  | { readonly code: string }
  | { readonly token: string };

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>(() => {
    // Checked before the table code: arriving with both would mean a stale hash,
    // and the link just opened is the one this person meant.
    const token = signInTokenFromLocation();
    if (token !== null) {
      return { token };
    }
    const code = codeFromLocation();
    return code === null ? "home" : { code };
  });
  const account = useAccount();
  const [showingSettings, setShowingSettings] = useState(false);
  const [peeking, setPeeking] = useState(false);
  // Read once, then owned here so Settings can change it without a reload.
  const [devTools, setDevTools] = useState(readDevTools);
  // A preference for the *next* match. A game in progress reads its format from
  // its own state, so changing this cannot alter one already under way.
  const [format, setFormat] = useState(preferredFormat);
  // Already on the document by now — main.tsx applies it before the first
  // render — so this is the same value again, for the card back to read.
  const [theme, setTheme] = useState(readTheme);
  // Set by the table screen while one is open. Leaving can be started from
  // Settings, which lives out here, so the exit has to be reachable from here.
  const leaveTable = useRef<(() => void) | null>(null);

  const showSettings = (): void => {
    setShowingSettings(true);
  };

  // Screens with no game behind them, so Settings must not offer to leave one.
  const noGame =
    screen === "home" || screen === "record" || (typeof screen === "object" && "token" in screen);

  const goHome = (): void => {
    // Give up the seat first, so the other player is told rather than left
    // watching a countdown for somebody who is not coming back.
    leaveTable.current?.();
    leaveTable.current = null;
    // Clears the table out of the URL too, or a refresh would rejoin it.
    setLocationCode(null);
    setScreen("home");
    setShowingSettings(false);
  };

  return (
    <ThemeContext value={theme}>
      {/* A fixed full-height frame, sized in dvh so the layout does not jump as
          Safari's URL bar hides, and inset so nothing sits under the notch or
          the home indicator. Each region scrolls on its own; the page never
          does.

          Capped at a phone's width and centred: every screen here is laid out
          for a hand holding a phone, and stretching that across a desktop
          monitor makes rows of buttons absurdly wide rather than usefully
          bigger. On a phone the cap never binds. */}
      <div
        className="table-surface relative mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden text-white"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
        }}
      >
        {screen === "home" ? (
          <Home
            onFindOpponent={() => {
              setScreen("searching");
            }}
            onJoinTable={(code) => {
              setLocationCode(code);
              setScreen({ code });
            }}
            onPlayComputer={() => {
              setScreen("robot");
            }}
            onShowRecord={() => {
              setScreen("record");
            }}
            onShowSettings={showSettings}
          />
        ) : screen === "record" ? (
          <Record
            signedIn={account.account !== null}
            onBack={() => {
              setScreen("home");
            }}
            onShowSettings={showSettings}
          />
        ) : screen === "searching" ? (
          <Searching
            onCancel={goHome}
            onMatched={(code) => {
              setLocationCode(code);
              setScreen({ code });
            }}
          />
        ) : screen === "robot" ? (
          <RobotGame devTools={devTools} peeking={peeking} onShowSettings={showSettings} />
        ) : "token" in screen ? (
          <SignIn
            token={screen.token}
            onDone={() => {
              // The token is spent either way, so the hash goes before anything
              // can retry it.
              clearLocationHash();
              account.refresh();
              setScreen("home");
            }}
          />
        ) : (
          <TableGame
            code={screen.code}
            devTools={devTools}
            peeking={peeking}
            registerLeave={(leave) => {
              leaveTable.current = leave;
            }}
            onLeave={goHome}
            onShowSettings={showSettings}
          />
        )}

        {showingSettings ? (
          <SettingsOverlay
            account={account.account}
            checkingAccount={account.checking}
            devTools={devTools}
            format={format}
            peeking={peeking}
            theme={theme}
            onClose={() => {
              setShowingSettings(false);
            }}
            onDevToolsChange={(enabled) => {
              writeDevTools(enabled);
              setDevTools(enabled);
            }}
            onFormatChange={(next) => {
              setPreferredFormat(next);
              setFormat(next);
            }}
            onPeekingChange={setPeeking}
            onSignOut={account.signOut}
            onThemeChange={(next) => {
              writeTheme(next);
              applyTheme(next);
              setTheme(next);
            }}
            // Abandoning a rubber loses it — there is nowhere to keep it — so this
            // is only offered while there is one to abandon.
            onLeaveGame={noGame ? null : goHome}
          />
        ) : null}
      </div>
    </ThemeContext>
  );
}
