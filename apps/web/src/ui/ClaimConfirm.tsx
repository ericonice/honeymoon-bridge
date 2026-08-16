export interface ClaimConfirmProps {
  onCancel(): void;
  onConfirm(): void;
}

/**
 * Asked before offering a claim.
 *
 * A card play is final on release and a bid gets a confirm tap to guard
 * against a misclick; a claim is a bigger tap than either — it exposes your
 * hand the instant it is offered, whether or not the other player agrees with
 * it. Staying is the weighted button, the same rule `LeaveConfirm` follows:
 * the deliberate, harder-to-take-back choice should be the one that takes a
 * second, unhurried look.
 */
export function ClaimConfirm({ onCancel, onConfirm }: ClaimConfirmProps): React.JSX.Element {
  return (
    <div className="safe-inset absolute inset-0 z-40 flex flex-col justify-end bg-black/70 px-5 pb-5">
      <div className="flex flex-col gap-4 rounded-2xl bg-table-dark px-5 py-5">
        <div>
          <h2 className="text-lg font-semibold">Claim the rest?</h2>
          <p className="mt-1 text-sm text-white/55">Are you sure?</p>
        </div>
        <button
          type="button"
          className="w-full rounded-xl bg-white px-4 py-3.5 text-base font-semibold text-stone-900"
          onClick={onCancel}
        >
          Keep playing
        </button>
        <button
          type="button"
          className="w-full rounded-xl border border-amber-300/40 px-4 py-3.5 text-base text-amber-100"
          onClick={onConfirm}
        >
          Claim
        </button>
      </div>
    </div>
  );
}
