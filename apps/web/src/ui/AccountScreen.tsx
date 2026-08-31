import { useSwipeBack } from "../game/swipeBack.js";
import { AccountFields } from "./AccountFields.js";
import { BackButton } from "./BackButton.js";

export interface AccountScreenProps {
  readonly email: string;
  readonly hideFromLeaderboard: boolean;
  /** Null before a name has ever been chosen, which is what makes this a prompt. */
  readonly existing: string | null;
  onBack(): void;
  /** The account is gone server-side; the caller still owns signing out locally. */
  onDeleted(): void;
  onLeaderboardVisibilityChange(): void;
  onSaved(): void;
  onSignOut(): void;
}

/**
 * The forced first-sign-in prompt: who you are, asked once, before anything else.
 *
 * A table has somebody else already sitting at it, and keeping them waiting
 * while their opponent fills in a form is the wrong moment for a question whose
 * answer lasts years — so it is asked here, immediately after a first sign-in,
 * as a screen nothing else can be reached around. Afterwards, the same fields
 * are reachable any time from Settings — see `AccountFields`, which this and
 * `SettingsOverlay` both render — since a gate that only ever fires once is not
 * where an ongoing setting belongs.
 *
 * The device's own nickname seeds the name field, so somebody who has been
 * playing the computer as themselves is not asked from scratch.
 */
export function AccountScreen({
  email,
  existing,
  hideFromLeaderboard,
  onBack,
  onDeleted,
  onLeaderboardVisibilityChange,
  onSaved,
  onSignOut,
}: AccountScreenProps): React.JSX.Element {
  useSwipeBack(onBack);

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

        {/* The same card `SettingsSection` draws, but not collapsible — this
            screen has exactly one thing to show and nothing to fold away. */}
        <div className="py-6">
          <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/12 bg-white/[0.03]">
            <AccountFields
              email={email}
              existing={existing}
              hideFromLeaderboard={hideFromLeaderboard}
              onDeleted={onDeleted}
              onLeaderboardVisibilityChange={onLeaderboardVisibilityChange}
              onSaved={onSaved}
              onSignOut={onSignOut}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
