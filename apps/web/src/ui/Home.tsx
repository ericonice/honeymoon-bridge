import { useState } from "react";
import type { MatchFormat } from "@hb/engine";
import type { TableRole } from "@hb/protocol";
import type { Account } from "../game/account.js";
import { storedSession } from "../game/account.js";
import {
  MAX_SESSION_DEALS,
  MIN_SESSION_DEALS,
  SESSION_DEALS_STEP,
  SESSION_ORDERS,
  cleanSessionDeals,
  mirrorGames,
  queueFormat,
  rubberFormatFor,
  rubberGames,
  setMirrorGames,
} from "../game/identity.js";
import { formatName } from "../game/labels.js";
import { createTableUrl } from "../game/serverUrl.js";
import { AchievementIcon, HelpIcon, RecordIcon, SettingsIcon } from "./icons.js";

export interface HomeProps {
  /** Null when signed out, which is most of what this screen has to say. */
  readonly account: Account | null;
  readonly checkingAccount: boolean;
  readonly format: MatchFormat;
  onFormatChange(format: MatchFormat): void;
  /** How long a duplicate session runs, in deals. Only shown while one is chosen. */
  readonly sessionDeals: number;
  onSessionDealsChange(deals: number): void;
  onFindOpponent(): void;
  onJoinTable(code: string, role: TableRole): void;
  onPlayComputer(): void;
  onShowAccount(): void;
  onShowAchievements(): void;
  onShowHelp(): void;
  onShowRecord(): void;
  onShowSettings(): void;
  onSignIn(): void;
}

/**
 * The four that are not a way to start playing.
 *
 * An icon over a caption, which is the shape a phone has taught everybody to
 * read, and a tap target of 56px rather than the 20px a line of underlined text
 * gave. The caption stays: two of these have a universal symbol and the third
 * does not, and a row where one glyph is a guess is worse than a row of words.
 *
 * Deliberately *not* a tab bar, despite borrowing its vocabulary. A real one
 * carries its own background and a selected state, and it is the most
 * authoritative position an iPhone has — which would rank Settings above the
 * four buttons this screen exists for. It also promises somewhere you stay,
 * and these are three overlays you glance at and leave.
 */
function Secondary({
  icon,
  label,
  onClick,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  onClick(): void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-white/55"
      onClick={onClick}
    >
      {icon}
      <span className="text-[11px] leading-none">{label}</span>
    </button>
  );
}

/**
 * What you are about to play, above the buttons that start it.
 *
 * On Home rather than in Settings, and it is the only match set-up that moved.
 * The test is not *when* a setting is read — all of them are read once, when a
 * match starts — but **how often the answer changes**. This changes session to
 * session; how hard it plays, which computer and the two dials beside them are
 * set once and left for months, so they stay where they are and keep their
 * "takes effect on the next match" caveat, which is fair for something touched
 * twice a year.
 *
 * Two things a Settings row could not do. Duplicate gets *found*, which a mode
 * nobody has heard of does not when it lives behind a gear. And there is no
 * staleness to explain, because the row sits directly above the button that
 * consumes it.
 *
 * One row rather than one per action: play-the-computer and the two table
 * buttons would each carry their own copy of the same three options, and two
 * controls for one preference is a preference that can disagree with itself —
 * set duplicate on one, tap the other, get a rubber.
 */
/**
 * Which game, in two cells rather than three.
 *
 * **"One game" was never a third format — it is a rubber that stops at the first
 * game**, which is exactly what `RubberFormat`'s two values already say. Sitting it
 * beside Duplicate as a peer made the row mix categories: two of the three cells were
 * the same game at different lengths and the third was a different game. So the row
 * holds the two games that genuinely differ, and how long a rubber runs moves to the
 * line underneath, where duplicate's length already lives.
 *
 * Nothing about what is *stored* changes. `preferredFormat` still keeps `"game"` or
 * `"rubber"`, `matchNoun` still says which, and a single game is still recorded and
 * rated as one — this is a truer description of the same two values, not a
 * re-modelling of them. That matters because `ratings.ts` pools the formats and a
 * match recorded under a new name would quietly leave the pool.
 */
const CELLS = ["rubber", "mirror", "duplicate"] as const;

function Format({
  format,
  onChange,
}: {
  readonly format: MatchFormat;
  onChange(format: MatchFormat): void;
}): React.JSX.Element {
  const labels = { duplicate: "Duplicate", mirror: "Mirror", rubber: "Rubber" } as const;
  // A single game is the rubber cell at a length of one, so both live under it.
  const chosen = format === "duplicate" || format === "mirror" ? format : "rubber";

  return (
    <div className="flex gap-1 rounded-xl bg-white/5 p-1">
      {CELLS.map((cell) => (
        <button
          key={cell}
          type="button"
          aria-pressed={chosen === cell}
          className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium ${
            chosen === cell ? "bg-white/15 text-white" : "text-white/55"
          }`}
          onClick={() => {
            // Coming back to Rubber restores the length last chosen for it, rather
            // than defaulting to two — which is what a trip through Duplicate used to
            // do, silently promoting a single game to a full rubber.
            onChange(cell === "rubber" ? rubberFormatFor(rubberGames()) : cell);
          }}
        >
          {labels[cell]}
        </button>
      ))}
    </div>
  );
}

/**
 * How long a format-dependent line may be before it needs a third line.
 *
 * The narrowest phone gives this text about 42 characters a line, so two lines is
 * roughly 84. Anything under that wraps to at most two wherever it is read, which is
 * what the pinned heights are sized for. Asserted in `homeFormat.test.ts` rather than
 * trusted: these strings are edited far more often than the heights are.
 */
export const DESCRIPTION_LIMIT = 84;

/** "1 board" rather than "1 boards", which the shortest session would otherwise read as. */
function boardWord(boards: number): string {
  return `${boards} ${boards === 1 ? "board" : "boards"}`;
}

/**
 * What each format means, in the one line under the row that picks it.
 *
 * Short on purpose. The first version of this line ran to sixty characters, which
 * wraps to two at 12px in a phone's column — so choosing Duplicate *shrank* the
 * block and moved the primary button, which is the exact fault the line was added
 * to fix. Its height is pinned in CSS as well, so no future edit can reintroduce it.
 */
/** The line's height, pinned so nothing below it can ever move. */
const NOTE_HEIGHT = "flex h-6 items-center";

/**
 * Which way the line under the row leans, so it reads as being *about* the option
 * that is selected.
 *
 * The row is three equal cells, so the selected one's centre sits at a sixth, a
 * half, or five sixths across. Leaning the text that way points at it without
 * drawing anything, and costs nothing when the line is longer than a third of the
 * width — which every one of them is, so actually centring under the cell would
 * mean wrapping three short lines instead of one.
 *
 * Derived from the option's position rather than listed per format, so a fourth
 * format needs nothing here.
 */
function leanFor(index: number, count: number): string {
  if (index === 0) {
    return "justify-start text-left";
  }
  return index === count - 1 ? "justify-end text-right" : "justify-center text-center";
}

/**
 * The line under the format row: what the chosen format means, or — for a session —
 * how long it runs.
 *
 * **One line, always, whatever is chosen.** The length control used to appear only
 * for duplicate, inserting a row above the primary button and moving "Play the
 * computer" out from under the thumb reaching for it. A control that shifts the
 * thing you are about to tap is worse than one slightly out of place.
 *
 * It is not a placeholder for the other two formats either: what a rubber is and
 * what a single game is were explained by the Settings row's own description until
 * that row moved to Home, and the explanation had nowhere to go. So the constant
 * height costs nothing — the space was already earning its keep for two of three.
 *
 * **A stepper rather than a row of lengths**, which is the third shape this took. A
 * fixed list was five tap targets competing for a phone's width, which capped the
 * session at whatever fitted; two arrows reach any length, take one line, and leave
 * room for the sentence around them to say what the number *is*.
 */
function FormatNote({
  deals,
  format,
  onDealsChange,
  onFormatChange,
  onMirrorGamesChange,
}: {
  readonly deals: number;
  readonly format: MatchFormat;
  onDealsChange(deals: number): void;
  onFormatChange(format: MatchFormat): void;
  onMirrorGamesChange(games: 1 | 2): void;
}): React.JSX.Element {
  const lean = leanFor(CELLS.indexOf(format === "game" ? "rubber" : format), CELLS.length);

  if (format === "mirror") {
    // The same stepper the rubber gets, asking the same question of a different thing:
    // how long each *side* of the comparison runs. One game is what the format is for —
    // the pair is then about six deals — and a rubber a side is the long version.
    const games = mirrorGames();
    return (
      <div className={`${NOTE_HEIGHT} ${lean} gap-1 px-1 text-xs text-white/45`}>
        <span>Each side, first to</span>
        <Step
          label="One game each side"
          disabled={games === 1}
          onClick={() => {
            onMirrorGamesChange(1);
          }}
        >
          &lsaquo;
        </Step>
        <output className="w-4 text-center font-semibold tabular-nums text-white/90">
          {games}
        </output>
        <Step
          label="A rubber each side"
          disabled={games === 2}
          onClick={() => {
            onMirrorGamesChange(2);
          }}
        >
          &rsaquo;
        </Step>
        <span>{games === 1 ? "game" : "games"}</span>
      </div>
    );
  }

  if (format !== "duplicate") {
    // **A stepper with two stops, for the same reason duplicate has one.** Two arrows
    // to move between exactly two values is more machinery than a toggle needs — and
    // one vocabulary for "how long is this" beats two, on a line whose whole job is
    // that question. The two formats state their length the same way now.
    const games = format === "game" ? 1 : 2;
    return (
      <div className={`${NOTE_HEIGHT} ${lean} gap-1 px-1 text-xs text-white/45`}>
        <span>First to</span>
        <Step
          label="One game only"
          disabled={games === 1}
          onClick={() => {
            onFormatChange("game");
          }}
        >
          &lsaquo;
        </Step>
        <output className="w-4 text-center font-semibold tabular-nums text-white/90">{games}</output>
        <Step
          label="Best of three"
          disabled={games === 2}
          onClick={() => {
            onFormatChange("rubber");
          }}
        >
          &rsaquo;
        </Step>
        <span>{games === 1 ? "game" : "games"}</span>
      </div>
    );
  }

  return (
    <div className={`${NOTE_HEIGHT} ${lean} gap-1 px-1 text-xs text-white/45`}>
      <span>A session of</span>
      <Step
        label="Shorter session"
        disabled={deals <= MIN_SESSION_DEALS}
        onClick={() => {
          onDealsChange(cleanSessionDeals(deals - SESSION_DEALS_STEP));
        }}
      >
        &lsaquo;
      </Step>
      <output className="w-6 text-center font-semibold tabular-nums text-white/90">{deals}</output>
      <Step
        label="Longer session"
        disabled={deals >= MAX_SESSION_DEALS}
        onClick={() => {
          onDealsChange(cleanSessionDeals(deals + SESSION_DEALS_STEP));
        }}
      >
        &rsaquo;
      </Step>
      <span>deals</span>
    </div>
  );
}

/**
 * One arrow of the stepper.
 *
 * Padded well past the glyph it draws: a chevron at this size is a four-pixel target
 * and §1.5 allocates size by how badly a mis-tap hurts — a wrong step here is
 * harmless and instantly undone, so it does not need the draw's 64px, but it does
 * need to be hittable. The negative margin gives the padding back to the layout so
 * growing the target cannot push the sentence around.
 */
function Step({
  children,
  disabled,
  label,
  onClick,
}: {
  readonly children: React.ReactNode;
  readonly disabled: boolean;
  readonly label: string;
  onClick(): void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className="-my-2 -mx-1 px-2 py-2 text-base leading-none text-white/70 disabled:text-white/20"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Who you are, at the top of the screen rather than inside Settings.
 *
 * Settings is a list of things to change and every other row in it is a toggle;
 * being signed in is neither a preference nor a thing you set, and since §3.7 it
 * is what stands between somebody and half of what this app does. Hiding that
 * behind a gear made the app's answer to "why can't I play?" a place nobody
 * would think to look.
 */
function Identity({
  account,
  checking,
  onShowAccount,
  onSignIn,
}: {
  readonly account: Account | null;
  readonly checking: boolean;
  onShowAccount(): void;
  onSignIn(): void;
}): React.JSX.Element {
  if (checking) {
    return <p className="text-sm text-white/40">Checking your account…</p>;
  }

  if (account === null) {
    return (
      <button
        type="button"
        className="w-full rounded-xl border border-white/25 px-4 py-3 text-left"
        onClick={onSignIn}
      >
        <span className="block text-base font-medium">Sign in</span>
        <span className="mt-0.5 block text-xs text-white/55">
          Needed to play another person. The computer never asks.
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="w-full rounded-xl border border-white/15 px-4 py-3 text-left"
      onClick={onShowAccount}
    >
      <span className="block text-xs tracking-wide text-white/45 uppercase">Playing as</span>
      <span className="mt-0.5 block truncate text-base font-medium">
        {account.name ?? "Choose a name"}
      </span>
    </button>
  );
}

/**
 * One of the three ways to reach a person, as a cell rather than a row.
 *
 * **Three full-width buttons with a line of description each cost 240px, and the
 * screen did not have it.** They were stacked because they are three different
 * things; they are a row now because they are three different things *of the same
 * kind* — every one of them ends with somebody else at the table, and every one
 * needs an account. The primary button stays full width, because it is the one
 * that needs nothing and is what most taps are.
 *
 * Two lines rather than one. A bare "Find" does not say what it finds, and a shared
 * caption underneath reading "whoever is looking · send a link · enter a code" makes
 * the reader match three phrases to three buttons by position — which is a puzzle,
 * not a label.
 */
function TableAction({
  disabled,
  label,
  onClick,
  sub,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly sub: string;
  onClick(): void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="min-w-0 flex-1 rounded-xl border border-white/25 px-2 py-2.5 text-center disabled:opacity-35"
      disabled={disabled === true}
      onClick={onClick}
    >
      <span className="block truncate text-sm font-semibold">{label}</span>
      <span className="mt-0.5 block truncate text-[11px] leading-tight text-white/55">{sub}</span>
    </button>
  );
}

function Choice({
  description,
  disabled,
  label,
  onClick,
  primary,
}: {
  readonly description: string;
  readonly disabled?: boolean;
  readonly label: string;
  readonly primary?: boolean;
  onClick(): void;
}): React.JSX.Element {
  const tone =
    primary === true
      ? "bg-white text-stone-900"
      : "border border-white/25 text-white disabled:opacity-35";

  return (
    <button
      type="button"
      className={`w-full rounded-xl px-4 py-4 text-left ${tone}`}
      disabled={disabled === true}
      onClick={onClick}
    >
      <span className="block text-lg font-semibold">{label}</span>
      {/* **Two lines' worth, whether it uses them or not.** This description changes
          with the format and the two are different lengths, so on a wide enough phone
          one wrapped to two lines and the other did not — which moved everything below
          the moment you tapped between Rubber and Duplicate. The same fault the note
          line above has been pinned against twice, in a place nobody thought to look,
          because the thing that moves is not the thing that changed.

          `min-h-8` is two lines of `text-xs`; `DESCRIPTION_LIMIT` is what stops either
          string ever needing a third. */}
      <span
        className={`mt-0.5 block min-h-8 text-xs ${
          primary === true ? "text-stone-600" : "text-white/55"
        }`}
      >
        {description}
      </span>
    </button>
  );
}

/**
 * The first screen.
 *
 * The app used to open straight into a deal against the computer, which was
 * right while that was the only thing it could do. With a second mode there is
 * a choice to make before anything can start, and burying it inside a game in
 * progress would make the networked game the hidden one.
 */
export function Home({
  account,
  checkingAccount,
  format,
  onFindOpponent,
  onFormatChange,
  onJoinTable,
  onSessionDealsChange,
  sessionDeals,
  onPlayComputer,
  onShowAccount,
  onShowAchievements,
  onShowHelp,
  onShowRecord,
  onShowSettings,
  onSignIn,
}: HomeProps): React.JSX.Element {
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // Held here only so the stepper redraws; `mirrorGames` remains the single source, read
  // fresh on every render and when a match starts.
  const [, setMirrorLength] = useState(mirrorGames);
  const [error, setError] = useState<string | null>(null);
  // Read once, the same as every other setting here — it is set on the Searching
  // screen, which is a fresh mount away, so Home never needs to react to it changing
  // out from under a screen that is still up.
  const [findsFormat] = useState(queueFormat);

  const startTable = async (): Promise<void> => {
    // Minting a code needs an account, so ask before spending a round trip on
    // being refused. Joining a table or the queue is gated on the way in to
    // that screen instead, where the destination is worth keeping hold of.
    const session = storedSession();
    if (session === null) {
      onSignIn();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(createTableUrl(), {
        headers: { Authorization: `Bearer ${session}` },
        method: "POST",
      });
      if (!response.ok) {
        onSignIn();
        return;
      }
      const body = (await response.json()) as { code: string };
      onJoinTable(body.code, "host");
    } catch {
      setError("Could not reach the table server.");
    } finally {
      setBusy(false);
    }
  };

  // **`overflow-y-auto` is a safety net, not the plan.** This screen is meant to fit
  // without scrolling and the spacing is chosen for that — but a phone smaller than
  // any I can test on, or a text size somebody has turned up, would otherwise clip the
  // footer with no way to reach it. Clipped is worse than scrolled.
  return (
    <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 pt-6 pb-3">
      <div>
        <h1 className="text-3xl font-semibold">Honeymoon Bridge</h1>
        <p className="mt-1 text-sm text-white/55">Contract bridge for two.</p>
      </div>

      {/* Above every choice rather than among them, now that §3.7 makes this
          the thing standing between somebody and half of what the screen
          below offers. Its own margin instead of the choices' shared `gap-3`
          keeps it from reading as one more item in that list. */}
      <div className="mt-5">
        <Identity
          account={account}
          checking={checkingAccount}
          onShowAccount={onShowAccount}
          onSignIn={onSignIn}
        />
      </div>

      <div className="flex flex-col gap-3 py-5">
        {/* **Boxed rather than merely grouped by spacing**, because a gap says
            "these happen to be near each other" and a border says "these are
            one thing" — which is the actual claim: playing the computer or
            sending an invite means *you* decide the sitting, the host's whole
            ask wins outright once somebody joins (see `formatFor`), and the
            picker above is what that decision draws on. Find and Join are both
            "somebody else already decided" and sit outside the box entirely,
            on the plain background, rather than inside it looking governed by
            a setting that does not apply to them. No fill on the box itself —
            the picker's own `bg-white/5` is the only tint here, and stacking a
            second one on top of it would read as one tint bleeding into another
            rather than as two distinct surfaces. */}
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 p-3">
          {/* The row and its one line of explanation are one control, so they sit close
              to each other — and well clear of the buttons below, which act on the
              choice rather than being part of making it. Without that gap the note read
              as a caption on the primary button. */}
          <div className="mb-2 flex flex-col gap-1.5">
            {/* **The row said nothing about what it was choosing.** Three words sat at
                the top of the screen and the line underneath explained the one that was
                selected, so somebody who had never seen it could read "Best of three
                games" and still not know that was one of three answers to a question
                nobody had asked. The label is the question. */}
            <p className="px-1 text-xs tracking-wide text-white/45 uppercase">
              What you&rsquo;re playing
            </p>
            <Format format={format} onChange={onFormatChange} />
            <FormatNote
              deals={sessionDeals}
              format={format}
              onDealsChange={onSessionDealsChange}
              onFormatChange={onFormatChange}
              onMirrorGamesChange={(games) => {
                setMirrorGames(games);
                setMirrorLength(games);
              }}
            />
          </div>

          <Choice
            primary
            label="Play the computer"
            description={
              format === "duplicate"
                ? `On this device. ${sessionDeals} deals: ${boardWord(sessionDeals / 2)}, each played twice from both sides.`
                : format === "mirror"
                  ? "On this device. The same deals from both sides; the total wins."
                  : "On this device. Works offline, and needs nobody else."
            }
            onClick={onPlayComputer}
          />

          <Choice
            disabled={busy}
            label="Invite"
            description={
              format === "duplicate"
                ? `Send a link. ${sessionDeals} deals: ${boardWord(sessionDeals / 2)}, each played twice from both sides.`
                : format === "mirror"
                  ? "Send a link. The same deals from both sides; the total wins."
                  : "Send a link. Whoever opens it plays what you chose."
            }
            onClick={() => {
              void startTable();
            }}
          />
        </div>

        {/* Neither of these is shut for duplicate: a table can run a session now.
            Find still needs both strangers to have asked for one — duplicate is
            last in `formatFor`'s precedence, so nothing outranks a seat that did
            not ask for it, since being put into a session unasked is a worse
            mistake than getting the rubber you know. Join needs nothing from
            this seat at all: the host already decided, duplicate included, and
            what this seat has set above plays no part in it. */}
        <div className="flex gap-2">
          <TableAction
            label="Find"
            sub={findsFormat === null ? "whoever is free" : `only ${formatName(findsFormat).toLowerCase()}`}
            onClick={onFindOpponent}
          />
          <TableAction
            label="Join"
            sub="with a code"
            onClick={() => {
              setJoining(true);
            }}
          />
        </div>

        {/* Opens under the row rather than replacing a button, which is what it did
            when there was a full-width button to replace. */}
        {joining ? (
          <div className="flex gap-2">
            <input
              autoFocus
              className="min-w-0 flex-1 rounded-xl border border-white/25 bg-black/20 px-4 py-3 font-mono text-lg tracking-[0.2em] uppercase"
              placeholder="CODE"
              value={code}
              maxLength={6}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
              }}
            />
            <button
              type="button"
              className="rounded-xl bg-white px-5 text-base font-semibold text-stone-900 disabled:opacity-35"
              disabled={code.length !== 6}
              onClick={() => {
                onJoinTable(code, "guest");
              }}
            >
              Join
            </button>
          </div>
        ) : null}

        {error === null ? null : <p className="text-sm text-amber-200">{error}</p>}
      </div>

      {/* Kept at the bottom, where a thumb is. A hairline rather than a filled
          bar: enough to read as the foot of the screen, short of claiming to be
          the chrome that a tab bar is. */}
      <div className="flex gap-1 border-t border-white/10 pt-2">
        {/* First of the four: the only one answering a question somebody has
            before they have played rather than after. */}
        <Secondary icon={<HelpIcon />} label="How to play" onClick={onShowHelp} />
        {/* "Record" rather than "Your record": the screen holds the standings as
            well now, and half of that is not yours. Also the shorter label, which
            is what keeps all four captions on one line. */}
        <Secondary icon={<RecordIcon />} label="Record" onClick={onShowRecord} />
        <Secondary icon={<AchievementIcon />} label="Achievements" onClick={onShowAchievements} />
        <Secondary icon={<SettingsIcon />} label="Settings" onClick={onShowSettings} />
      </div>
    </div>
  );
}
