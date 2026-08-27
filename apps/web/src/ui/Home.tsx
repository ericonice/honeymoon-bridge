import { useState } from "react";
import type { DuplicateSchedule, MatchFormat } from "@hb/engine";
import type { Account } from "../game/account.js";
import { storedSession } from "../game/account.js";
import {
  MAX_SESSION_DEALS,
  MIN_SESSION_DEALS,
  SESSION_DEALS_STEP,
  SESSION_ORDERS,
  cleanSessionDeals,
} from "../game/identity.js";
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
  /** How a duplicate session orders its deals. Only shown while one is chosen. */
  readonly sessionOrder: DuplicateSchedule;
  onSessionOrderChange(order: DuplicateSchedule): void;
  onFindOpponent(): void;
  onJoinTable(code: string): void;
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
function Format({
  format,
  onChange,
}: {
  readonly format: MatchFormat;
  onChange(format: MatchFormat): void;
}): React.JSX.Element {
  const labels: Record<MatchFormat, string> = {
    duplicate: "Duplicate",
    game: "One game",
    rubber: "Rubber",
  };
  const options = FORMAT_ORDER.map((value) => ({ label: labels[value], value }));

  return (
    <div className="flex gap-1 rounded-xl bg-white/5 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={format === option.value}
          className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium ${
            format === option.value ? "bg-white/15 text-white" : "text-white/55"
          }`}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** "1 board" rather than "1 boards", which the shortest session would otherwise read as. */
/**
 * How the session orders its deals, on the second of the two lines under the format
 * row.
 *
 * **Two lines, always, whichever format is chosen**, and the second is empty for the
 * two rubber formats. That is not waste: it is what keeps the block a fixed height so
 * nothing below it can move — a fault this control has already had twice — and the
 * space it leaves is the separation between choosing what to play and the buttons
 * that act on the choice, which the group wanted anyway.
 *
 * The three orders are different *games* rather than three arrangements of one. Back
 * to back makes the comparison immediate and the strategy about beating a line you
 * have just seen; halves is what a duplicate evening actually is, everybody playing
 * every board once before they come round again; shuffled makes recognising the board
 * part of it. Which is better is not something a bench has an opinion about, so it is
 * a setting rather than a decision.
 */
function OrderRow({
  format,
  onChange,
  order,
}: {
  readonly format: MatchFormat;
  onChange(order: DuplicateSchedule): void;
  readonly order: DuplicateSchedule;
}): React.JSX.Element {
  if (format !== "duplicate") {
    return <div className={NOTE_HEIGHT} aria-hidden="true" />;
  }

  return (
    <div className={`${NOTE_HEIGHT} gap-2 px-1 text-xs text-white/45`}>
      <span className="whitespace-nowrap">Order</span>
      <div className="flex flex-1 gap-1">
        {SESSION_ORDERS.map((one) => (
          <button
            key={one}
            type="button"
            aria-pressed={order === one}
            className={`flex-1 truncate rounded-md py-0.5 text-xs font-medium ${
              order === one ? "bg-white/15 text-white" : "text-white/45"
            }`}
            onClick={() => {
              onChange(one);
            }}
          >
            {ORDER_LABEL[one]}
          </button>
        ))}
      </div>
    </div>
  );
}

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
/** The order the row draws them, which is also what `leanFor` reads. */
const FORMAT_ORDER: readonly MatchFormat[] = ["game", "rubber", "duplicate"];

const FORMAT_NOTE: Record<"game" | "rubber", string> = {
  game: "First to 100 below the line",
  rubber: "Best of three games",
};

/** The line's height, pinned so nothing below it can ever move. */
const NOTE_HEIGHT = "flex h-6 items-center";

/** What each order is called on the row, and what it means underneath. */
const ORDER_LABEL: Record<DuplicateSchedule, string> = {
  adjacent: "Back to back",
  halves: "Halves",
  random: "Shuffled",
};

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
}: {
  readonly deals: number;
  readonly format: MatchFormat;
  onDealsChange(deals: number): void;
}): React.JSX.Element {
  const lean = leanFor(FORMAT_ORDER.indexOf(format), FORMAT_ORDER.length);

  if (format !== "duplicate") {
    return (
      <p className={`${NOTE_HEIGHT} ${lean} px-1 text-xs text-white/45`}>{FORMAT_NOTE[format]}</p>
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
      <span
        className={`mt-0.5 block text-xs ${primary === true ? "text-stone-600" : "text-white/55"}`}
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
  onSessionOrderChange,
  sessionDeals,
  sessionOrder,
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
  const [error, setError] = useState<string | null>(null);

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
      onJoinTable(body.code);
    } catch {
      setError("Could not reach the table server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 pt-8 pb-4">
      <div>
        <h1 className="text-3xl font-semibold">Honeymoon Bridge</h1>
        <p className="mt-1 text-sm text-white/55">Contract bridge for two.</p>
      </div>

      {/* Above every choice rather than among them, now that §3.7 makes this
          the thing standing between somebody and half of what the screen
          below offers. Its own margin instead of the choices' shared `gap-3`
          keeps it from reading as one more item in that list. */}
      <div className="mt-6">
        <Identity
          account={account}
          checking={checkingAccount}
          onShowAccount={onShowAccount}
          onSignIn={onSignIn}
        />
      </div>

      <div className="flex flex-col gap-3 py-6">
        {/* The row and its one line of explanation are one control, so they sit close
            to each other — and well clear of the buttons below, which act on the
            choice rather than being part of making it. Without that gap the note read
            as a caption on the primary button. */}
        <div className="mb-2 flex flex-col gap-1.5">
          <Format format={format} onChange={onFormatChange} />
          <FormatNote deals={sessionDeals} format={format} onDealsChange={onSessionDealsChange} />
          <OrderRow format={format} order={sessionOrder} onChange={onSessionOrderChange} />
        </div>

        <Choice
          primary
          label="Play the computer"
          description={
            format === "duplicate"
              ? `On this device. ${sessionDeals} deals: ${boardWord(sessionDeals / 2)}, each played twice from both sides.`
              : "On this device. Works offline, and needs nobody else."
          }
          onClick={onPlayComputer}
        />

        {/* No longer shut for duplicate: a table can run a session now. It still
            takes *both* seats to have asked for one — a session is a different game
            rather than a longer or shorter one, so being put into it unasked is a
            worse mistake than getting the rubber you know. See `formatFor` on the
            server, which is where that rule lives. */}
        <Choice
          label="Find an opponent"
          description={
            format === "duplicate"
              ? "Get put together with whoever else is looking. A session needs you both to want one."
              : "Get put together with whoever else is looking for a game."
          }
          onClick={onFindOpponent}
        />

        <Choice
          label="Start a table"
          description={
            format === "duplicate"
              ? "Send one person the link. A session needs you both to want one."
              : "Create a table and send one particular person the link."
          }
          disabled={busy}
          onClick={() => {
            void startTable();
          }}
        />

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
                onJoinTable(code);
              }}
            >
              Join
            </button>
          </div>
        ) : (
          <Choice
            label="Join a table"
            description="Enter a code, or just open the link you were sent."
            onClick={() => {
              setJoining(true);
            }}
          />
        )}

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
