import { useState } from "react";
import { setAccountName } from "../game/account.js";
import { nickname, setNickname } from "../game/identity.js";
import { deleteAccount } from "../game/records.js";
import { useSwipeBack } from "../game/swipeBack.js";
import { BackButton } from "./BackButton.js";

export interface AccountScreenProps {
  readonly email: string;
  /** Null before a name has ever been chosen, which is what makes this a prompt. */
  readonly existing: string | null;
  onBack(): void;
  /** The account is gone server-side; the caller still owns signing out locally. */
  onDeleted(): void;
  onSaved(): void;
  onSignOut(): void;
}

/**
 * Who you are, and what other players will call you.
 *
 * The name is asked for once, immediately after a first sign-in, rather than at
 * the table: a table has somebody else already sitting at it, and keeping them
 * waiting while their opponent fills in a form is the wrong moment for a
 * question whose answer lasts years. Afterwards this same screen is where it is
 * changed, since there is nothing else to say about an account.
 *
 * The device's own nickname seeds it, so somebody who has been playing the
 * computer as themselves is not asked from scratch.
 */
export function AccountScreen({
  email,
  existing,
  onBack,
  onDeleted,
  onSaved,
  onSignOut,
}: AccountScreenProps): React.JSX.Element {
  const [name, setName] = useState(() => existing ?? nickname());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useSwipeBack(onBack);

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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="px-4 pt-4">
        <BackButton onBack={onBack} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-2 pb-8">
        <div>
          <h1 className="text-2xl font-semibold">
            {existing === null ? "What should people call you?" : "Your name"}
          </h1>
          <p className="mt-2 text-sm text-white/55">
            This is what your opponent sees across the table, and what your record shows against them
            afterwards.
          </p>
        </div>

        <div className="py-6">
          <input
            autoFocus
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

          <div className="mt-6 rounded-xl border border-white/15 px-4 py-3">
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

          <div className="mt-4 rounded-xl border border-red-400/25 px-4 py-3">
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
        </div>
      </div>
    </div>
  );
}
