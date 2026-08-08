import { useState } from "react";
import { nickname, setNickname } from "../game/identity.js";
import { createTableUrl } from "../game/serverUrl.js";

export interface HomeProps {
  onFindOpponent(): void;
  onJoinTable(code: string): void;
  onPlayComputer(): void;
  onShowRecord(): void;
  onShowSettings(): void;
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
  onFindOpponent,
  onJoinTable,
  onPlayComputer,
  onShowRecord,
  onShowSettings,
}: HomeProps): React.JSX.Element {
  const [name, setName] = useState(nickname);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remember = (value: string): void => {
    setName(value);
    setNickname(value);
  };

  const startTable = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(createTableUrl(), { method: "POST" });
      const body = (await response.json()) as { code: string };
      onJoinTable(body.code);
    } catch {
      setError("Could not reach the table server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 py-8">
      <div>
        <h1 className="text-3xl font-semibold">Honeymoon Bridge</h1>
        <p className="mt-1 text-sm text-white/55">Contract bridge for two.</p>
      </div>

      <div className="flex flex-col gap-3 py-6">
        <Choice
          primary
          label="Play the computer"
          description="On this device. Works offline, and needs nobody else."
          onClick={onPlayComputer}
        />

        <label className="block">
          <span className="text-xs tracking-wide text-white/45 uppercase">Your name</span>
          <input
            className="mt-1 w-full rounded-xl border border-white/25 bg-black/20 px-4 py-3 text-base"
            placeholder="Player"
            value={name}
            maxLength={20}
            onChange={(event) => {
              remember(event.target.value);
            }}
          />
        </label>

        <Choice
          label="Find an opponent"
          description="Get put together with whoever else is looking for a game."
          onClick={onFindOpponent}
        />

        <Choice
          label="Start a table"
          description="Create a table and send one particular person the link."
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

      <div className="flex gap-5">
        <button
          type="button"
          className="text-sm text-white/50 underline underline-offset-4"
          onClick={onShowSettings}
        >
          Settings
        </button>
        <button
          type="button"
          className="text-sm text-white/50 underline underline-offset-4"
          onClick={onShowRecord}
        >
          Your record
        </button>
      </div>
    </div>
  );
}
