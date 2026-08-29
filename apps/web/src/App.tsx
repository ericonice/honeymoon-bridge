import { useState } from "react";
import { useAccount } from "./game/account.js";
import { applyCardColor, readCardColor, writeCardColor } from "./game/cardColor.js";
import type { Density } from "./game/identity.js";
import type { Destination } from "./game/destination.js";
import { destinationFromWire, HOME, takeDestination } from "./game/destination.js";
import { readDevTools, writeDevTools } from "./game/devTools.js";
import {
  boldness,
  difficulty,
  preferredRelease,
  density as storedDensity,
  disguiseEnabled,
  pace,
  peeking as storedPeeking,
  preferredFormat,
  sessionDeals,
  sessionOrder,
  setBoldness,
  setDifficulty,
  setPreferredRelease,
  setDensity,
  setDisguiseEnabled,
  setPace,
  setPeeking as storePeeking,
  setPreferredFormat,
  setSessionDeals,
  setSessionOrder,
  setSoundEnabled,
  setTapToSelectEnabled,
  setTrickCountEnabled,
  soundEnabled,
  tapToSelectEnabled,
  trickCountEnabled,
} from "./game/identity.js";
import {
  clearLocationHash,
  codeFromLocation,
  setLocationCode,
  signInFromLocation,
} from "./game/serverUrl.js";
import { applyTheme, readTheme, ThemeContext, writeTheme } from "./game/theme.js";
import { AccountScreen } from "./ui/AccountScreen.js";
import { Achievements } from "./ui/Achievements.js";
import { HelpOverlay } from "./ui/HelpOverlay.js";
import { Home } from "./ui/Home.js";
import { Record } from "./ui/Record.js";
import { RobotGame } from "./ui/RobotGame.js";
import { Searching } from "./ui/Searching.js";
import { SettingsOverlay } from "./ui/SettingsOverlay.js";
import { SignIn } from "./ui/SignIn.js";
import { SignInWall } from "./ui/SignInWall.js";
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
  | { readonly kind: "account" }
  | { readonly kind: "achievements" }
  | { readonly kind: "home" }
  | { readonly kind: "record" }
  | { readonly kind: "redeem"; readonly to: Destination | null; readonly token: string }
  | { readonly kind: "robot" }
  | { readonly kind: "searching" }
  | { readonly destination: Destination; readonly kind: "signin" }
  | { readonly code: string; readonly kind: "table" };

/**
 * What an account is needed for here, and where to come back to afterwards.
 *
 * §3.7 gates playing a person and nothing else, so this is the whole of the
 * rule in one function — and returning the destination rather than a boolean is
 * what lets the sign-in link bring somebody back to the table they were invited
 * to rather than to a home screen.
 */
function gateFor(screen: Screen): Destination | null {
  switch (screen.kind) {
    case "searching": {
      return { kind: "queue" };
    }
    case "table": {
      return { code: screen.code, kind: "table" };
    }
    default: {
      return null;
    }
  }
}

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>(() => {
    // Checked before the table code: arriving with both would mean a stale hash,
    // and the link just opened is the one this person meant.
    const signIn = signInFromLocation();
    if (signIn !== null) {
      return { kind: "redeem", to: destinationFromWire(signIn.to), token: signIn.token };
    }
    const code = codeFromLocation();
    return code === null ? { kind: "home" } : { code, kind: "table" };
  });
  const account = useAccount();
  const [showingSettings, setShowingSettings] = useState(false);
  // An overlay rather than a screen, so the rules can be checked from inside a
  // game. Anybody wondering whether a pass ends the auction is in an auction.
  const [showingHelp, setShowingHelp] = useState(false);
  const [peeking, setPeeking] = useState(storedPeeking);
  // Read once, then owned here so Settings can change it without a reload.
  const [devTools, setDevTools] = useState(readDevTools);
  // A preference for the *next* match. A game in progress reads its format from
  // its own state, so changing this cannot alter one already under way.
  const [format, setFormat] = useState(preferredFormat);
  // How long a duplicate session runs. A preference for the *next* match for the
  // same reason the format is: a session carries its own board list, so changing
  // this cannot alter one already under way.
  const [deals, setDeals] = useState(sessionDeals);
  // How a session orders its deals, on the same terms as the length: a preference for
  // the next match, since a session carries its own schedule.
  const [order, setOrder] = useState(sessionOrder);
  const [disguise, setDisguise] = useState(disguiseEnabled);
  // Testing settings, kept in state only so the rows re-render when tapped; the
  // stored value is what anything actually reads.
  const [bold, setBold] = useState(boldness);
  const [opponent, setOpponent] = useState(() => preferredRelease().version);
  const [hardness, setHardness] = useState(difficulty);
  const [speed, setSpeed] = useState(pace);
  const [sound, setSound] = useState(soundEnabled);
  const [tapToSelect, setTapToSelect] = useState(tapToSelectEnabled);
  const [trickCount, setTrickCount] = useState(trickCountEnabled);
  // Read once at mount, like every other setting here. Its *default* comes from
  // the viewport rather than storage — see `density` — so an untouched install
  // follows the device it launched on and a deliberate choice sticks.
  const [layout, setLayout] = useState<Density>(storedDensity);
  // Already on the document by now — main.tsx applies it before the first
  // render — so this is the same value again, for the card back to read.
  const [theme, setTheme] = useState(readTheme);
  const [cardColor, setCardColor] = useState(readCardColor);

  const showSettings = (): void => {
    setShowingSettings(true);
  };

  const showHelp = (): void => {
    setShowingSettings(false);
    setShowingHelp(true);
  };

  // Only ever the last step of leaving. Giving up the seat is the table
  // screen's own job, since it is the one holding the socket and the only one
  // that knows what to warn about before it does.
  const goHome = (): void => {
    // Clears the table out of the URL too, or a refresh would rejoin it.
    setLocationCode(null);
    setScreen({ kind: "home" });
    setShowingSettings(false);
  };

  const goTo = (destination: Destination): void => {
    switch (destination.kind) {
      case "home": {
        goHome();
        return;
      }
      case "queue": {
        setLocationCode(null);
        setScreen({ kind: "searching" });
        return;
      }
      case "robot": {
        setLocationCode(null);
        setScreen({ kind: "robot" });
        return;
      }
      case "table": {
        setLocationCode(destination.code);
        setScreen({ code: destination.code, kind: "table" });
        return;
      }
    }
  };

  /**
   * The gate, applied where the screen is chosen rather than where it is
   * reached.
   *
   * Deriving it means signing in *reveals* what was behind it — the account
   * arrives, this runs again, and the table is simply there — instead of
   * needing somebody to be navigated back to where they already were.
   */
  const renderGated = (gate: Destination, screenElement: React.JSX.Element): React.JSX.Element => {
    if (account.checking) {
      return (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-sm text-white/40">One moment…</p>
        </div>
      );
    }
    if (account.account === null) {
      return (
        <SignInWall destination={gate} onBack={goHome} onSignedIn={account.refresh} />
      );
    }
    if (account.account.name === null) {
      return (
        <AccountScreen
          email={account.account.email}
          existing={null}
          onBack={goHome}
          onSaved={account.refresh}
          onSignOut={account.signOut}
        />
      );
    }
    return screenElement;
  };

  const screenElement = ((): React.JSX.Element => {
    switch (screen.kind) {
      case "account": {
        return account.account === null ? (
          <SignInWall destination={HOME} onBack={goHome} onSignedIn={account.refresh} />
        ) : (
          <AccountScreen
            email={account.account.email}
            existing={account.account.name}
            onBack={goHome}
            onSaved={() => {
              account.refresh();
              goHome();
            }}
            onSignOut={() => {
              account.signOut();
              goHome();
            }}
          />
        );
      }
      case "achievements": {
        return (
          <Achievements
            signedIn={account.account !== null}
            onBack={goHome}
            onSignIn={() => {
              setScreen({ destination: HOME, kind: "signin" });
            }}
          />
        );
      }
      case "home": {
        return (
          <Home
            account={account.account}
            checkingAccount={account.checking}
            format={format}
            onFormatChange={(next) => {
              setPreferredFormat(next);
              setFormat(next);
            }}
            sessionDeals={deals}
            onSessionDealsChange={(next) => {
              setSessionDeals(next);
              setDeals(next);
            }}
            onFindOpponent={() => {
              setScreen({ kind: "searching" });
            }}
            onJoinTable={(code) => {
              setLocationCode(code);
              setScreen({ code, kind: "table" });
            }}
            onPlayComputer={() => {
              // Nothing gates this, per §3.7. The game against the computer needs no
              // account, no server and no network, and it is what somebody sees
              // before deciding whether this is worth handing over an email address
              // for — so asking first is asking at the one moment there is nothing
              // yet to answer with. It gated on a stored session for a while, which
              // also had the home screen promising "the computer never asks"
              // directly above a button that then asked.
              setScreen({ kind: "robot" });
            }}
            onShowAccount={() => {
              setScreen({ kind: "account" });
            }}
            onShowAchievements={() => {
              setScreen({ kind: "achievements" });
            }}
            onShowRecord={() => {
              setScreen({ kind: "record" });
            }}
            onShowHelp={showHelp}
            onShowSettings={showSettings}
            onSignIn={() => {
              setScreen({ destination: HOME, kind: "signin" });
            }}
          />
        );
      }
      case "record": {
        return (
          <Record
            signedIn={account.account !== null}
            onBack={goHome}
            onSignIn={() => {
              setScreen({ destination: HOME, kind: "signin" });
            }}
          />
        );
      }
      case "redeem": {
        return (
          <SignIn
            token={screen.token}
            onDone={() => {
              // The token is spent either way, so the hash goes before anything
              // can retry it.
              clearLocationHash();
              account.refresh();
              // The link's own destination first, then whatever this device
              // remembered. They differ when the mail was opened somewhere else.
              goTo(screen.to ?? takeDestination() ?? HOME);
            }}
          />
        );
      }
      case "robot": {
        return (
          <RobotGame
            devTools={devTools}
            peeking={peeking}
            sound={sound}
            density={layout}
            tapToSelect={tapToSelect}
            trickCount={trickCount}
            onLeave={goHome}
            onShowSettings={showSettings}
          />
        );
      }
      case "searching": {
        return (
          <Searching
            onCancel={goHome}
            onMatched={(code) => {
              setLocationCode(code);
              setScreen({ code, kind: "table" });
            }}
          />
        );
      }
      case "signin": {
        return (
          <SignInWall
            destination={screen.destination}
            onBack={goHome}
            onSignedIn={() => {
              // Leaving the screen is the acknowledgement. Refreshing alone left
              // somebody looking at the same code box after it had worked, so
              // the obvious next move was to enter the code again — which
              // genuinely fails, and reported a working sign-in as a broken one.
              account.refresh();
              goTo(screen.destination);
            }}
          />
        );
      }
      case "table": {
        return (
          <TableGame
            code={screen.code}
            devTools={devTools}
            peeking={peeking}
            sound={sound}
            density={layout}
            tapToSelect={tapToSelect}
            trickCount={trickCount}
            onLeave={goHome}
            onShowSettings={showSettings}
          />
        );
      }
    }
  })();

  const gate = gateFor(screen);

  return (
    <ThemeContext value={theme}>
      {/* A fixed full-height frame, sized in dvh so the layout does not jump as
          Safari's URL bar hides, and inset so nothing sits under the notch or
          the home indicator. Each region scrolls on its own; the page never
          does.

          Capped at a phone's width and centered: every screen here is laid out
          for a hand holding a phone, and stretching that across a desktop
          monitor makes rows of buttons absurdly wide rather than usefully
          bigger. On a phone the cap never binds.

          On a window bigger than a phone the *height* is capped too and this
          becomes a card on a ground — see `.viewport-height`'s media query. The
          width cap alone left a 28rem column stretched to the whole window,
          which is a strip rather than a phone. */}
      <div
        className="table-surface viewport-height relative mx-auto flex w-full max-w-md flex-col overflow-hidden text-white"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
        }}
      >
        {gate === null ? screenElement : renderGated(gate, screenElement)}

        {showingSettings ? (
          <SettingsOverlay
            sessionOrder={order}
            onSessionOrderChange={(next) => {
              setSessionOrder(next);
              setOrder(next);
            }}
            boldness={bold}
            opponent={opponent}
            difficulty={hardness}
            cardColor={cardColor}
            devTools={devTools}
            pace={speed}
            playtester={account.playtester}
            peeking={peeking}
            disguise={disguise}
            sound={sound}
            density={layout}
            tapToSelect={tapToSelect}
            trickCount={trickCount}
            theme={theme}
            onClose={() => {
              setShowingSettings(false);
            }}
            onShowHelp={showHelp}
            onDevToolsChange={(enabled) => {
              writeDevTools(enabled);
              setDevTools(enabled);
            }}
            onPeekingChange={(enabled) => {
              storePeeking(enabled);
              setPeeking(enabled);
            }}
            onDisguiseChange={(enabled) => {
              setDisguiseEnabled(enabled);
              setDisguise(enabled);
            }}
            onBoldnessChange={(next) => {
              setBoldness(next);
              setBold(next);
            }}
            onOpponentChange={(next) => {
              setPreferredRelease(next);
              setOpponent(next);
            }}
            onDifficultyChange={(next) => {
              setDifficulty(next);
              setHardness(next);
            }}
            onCardColorChange={(next) => {
              writeCardColor(next);
              applyCardColor(next);
              setCardColor(next);
            }}
            onPaceChange={(next) => {
              setPace(next);
              setSpeed(next);
            }}
            onSoundChange={(enabled) => {
              setSoundEnabled(enabled);
              setSound(enabled);
            }}
            onDensityChange={(next) => {
              setDensity(next);
              setLayout(next);
            }}
            onTapToSelectChange={(enabled) => {
              setTapToSelectEnabled(enabled);
              setTapToSelect(enabled);
            }}
            onTrickCountChange={(enabled) => {
              setTrickCountEnabled(enabled);
              setTrickCount(enabled);
            }}
            onThemeChange={(next) => {
              writeTheme(next);
              applyTheme(next);
              setTheme(next);
            }}
          />
        ) : null}

        {/* Above Settings in the stack, since Settings is one of the places it
            is opened from. */}
        {showingHelp ? (
          <HelpOverlay
            onClose={() => {
              setShowingHelp(false);
            }}
          />
        ) : null}
      </div>
    </ThemeContext>
  );
}
