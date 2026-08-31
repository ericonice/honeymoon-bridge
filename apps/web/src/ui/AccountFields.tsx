import { useState } from "react";
import { setAccountName, setHideFromLeaderboard } from "../game/account.js";
import { nickname, setNickname } from "../game/identity.js";
import { deleteAccount } from "../game/records.js";
import { Toggle } from "./Toggle.js";

export interface AccountFieldsProps {
  readonly email: string;
  readonly hideFromLeaderboard: boolean;
  /** Null before a name has ever been chosen, which is what makes the button say "That's me". */
  readonly existing: string | null;
  /** The account is gone server-side; the caller still owns signing out locally. */
  onDeleted(): void;
  onLeaderboardVisibilityChange(): void;
  onSaved(): void;
  onSignOut(): void;
}

/**
 * The account fields themselves — name, leaderboard visibility, sign out, delete
 * — with no screen chrome of their own.
 *
 * Shared between two places that could not share a whole screen: `AccountScreen`,
 * the forced first-sign-in prompt (its own back button, its own heading, not
 * dismissible without a name), and `SettingsOverlay`'s own Account section,
 * reached any time from either the gear icon or Home's "Playing as" row — the
 * standard iOS shape of putting account info at the top of the one Settings
 * screen rather than behind a separate destination. Extracting exactly the parts
 * that differ (the wrapper, the heading, whether leaving is even allowed) from
 * the parts that do not (everything below) is what lets both exist without a
 * second copy of the name-saving or account-deleting logic.
 *
 * Four flat rows, no border of their own — both callers wrap this in a
 * `SettingsSection`, which is what draws the card and the hairlines between
 * them, the same as every other settings row now.
 */
export function AccountFields({
  email,
  existing,
  hideFromLeaderboard,
  onDeleted,
  onLeaderboardVisibilityChange,
  onSaved,
  onSignOut,
}: AccountFieldsProps): React.JSX.Element {
  const [name, setName] = useState(() => existing ?? nickname());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(hideFromLeaderboard);
  const [hiddenError, setHiddenError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async (): Promise<void> => {
    setDeleting(true);
    setDeleteError(null);
    try {
      if (await deleteAccount()) {
        onDeleted();
      } else {
        setDeleteError("Could not reach the server. Try again in a moment.");
        setDeleting(false);
      }
    } catch {
      setDeleteError("Could not reach the server. Try again in a moment.");
      setDeleting(false);
    }
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      if (await setAccountName(name.trim())) {
        // Kept on the device too: the game against the computer has no server
        // to ask, and should not start calling you something else.
        setNickname(name);
        onSaved();
      } else {
        setError("That name was not accepted. Try another.");
      }
    } catch {
      setError("Could not reach the server. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  // Optimistic, and reverted on failure — a switch that waited for the network
  // before moving would read as broken, where the name save's own "Saving…"
  // state is fine because a button press already expects a beat before it does
  // something.
  const toggleHidden = async (next: boolean): Promise<void> => {
    setHidden(next);
    setHiddenError(null);
    try {
      if (await setHideFromLeaderboard(next)) {
        onLeaderboardVisibilityChange();
      } else {
        setHidden(!next);
        setHiddenError("Could not save that. Try again in a moment.");
      }
    } catch {
      setHidden(!next);
      setHiddenError("Could not reach the server. Try again in a moment.");
    }
  };

  return (
    <>
      <div className="px-4 py-3">
        <input
          autoFocus={existing === null}
          className="w-full rounded-xl border border-white/25 bg-black/20 px-4 py-3 text-base"
          placeholder="Eric"
          value={name}
          maxLength={20}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <button
          type="button"
          className="mt-2 w-full rounded-xl bg-white px-4 py-3 text-base font-semibold text-stone-900 disabled:opacity-35"
          disabled={saving || name.trim() === ""}
          onClick={() => {
            void save();
          }}
        >
          {saving ? "Saving…" : existing === null ? "That's me" : "Save"}
        </button>
        {error === null ? null : <p className="mt-1 text-sm text-amber-200">{error}</p>}
      </div>

      <div>
        <Toggle
          description="Other players won't see you on the Everyone standings. You'll still see your own row."
          label="Hide my name on the leaderboard"
          on={hidden}
          onChange={(next) => {
            void toggleHidden(next);
          }}
        />
        {hiddenError === null ? null : (
          <p className="px-4 pb-3 text-sm text-amber-200">{hiddenError}</p>
        )}
      </div>

      <div className="px-4 py-3">
        <span className="block text-xs tracking-wide text-white/45 uppercase">Signed in as</span>
        <span className="mt-0.5 block truncate text-base font-medium">{email}</span>
        <button
          type="button"
          className="mt-2 text-sm text-white/50 underline underline-offset-4"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </div>

      <div className="px-4 py-3">
        {confirmingDelete ? (
          <>
            <span className="block text-sm font-medium text-red-200">
              Delete your account for good?
            </span>
            <p className="mt-1 text-xs text-white/55">
              Your matches stay on the people you played — only your own identity and name are
              removed. This cannot be undone.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-lg border border-white/25 px-3 py-2 text-sm text-white disabled:opacity-35"
                disabled={deleting}
                onClick={() => {
                  setConfirmingDelete(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-red-500/90 px-3 py-2 text-sm font-semibold text-white disabled:opacity-35"
                disabled={deleting}
                onClick={() => {
                  void confirmDelete();
                }}
              >
                {deleting ? "Deleting…" : "Delete account"}
              </button>
            </div>
            {deleteError === null ? null : (
              <p className="mt-2 text-sm text-amber-200">{deleteError}</p>
            )}
          </>
        ) : (
          <button
            type="button"
            className="text-sm text-red-300/80 underline underline-offset-4"
            onClick={() => {
              setConfirmingDelete(true);
            }}
          >
            Delete account
          </button>
        )}
      </div>
    </>
  );
}
