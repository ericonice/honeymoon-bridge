export interface LeaveConfirmProps {
  readonly title: string;
  /** What leaving costs, in words the caller can honestly use. */
  readonly warning: string;
  onCancel(): void;
  onConfirm(): void;
}

/**
 * Asked before walking out of a match in progress.
 *
 * The exit used to be buried in Settings, where nobody found it and nothing
 * could be hit by accident. Putting it in the top bar fixes the first problem
 * and creates the second, so it is worth one tap to be sure — a rubber cannot
 * be resumed once it is given up.
 *
 * Staying is the weighted button. The destructive choice should be the one that
 * takes a deliberate look.
 */
export function LeaveConfirm({
  onCancel,
  onConfirm,
  title,
  warning,
}: LeaveConfirmProps): React.JSX.Element {
  return (
    <div className="safe-inset absolute inset-0 z-40 flex flex-col justify-end bg-black/70 px-5 pb-5">
      <div className="flex flex-col gap-4 rounded-2xl bg-table-dark px-5 py-5">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-white/55">{warning}</p>
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
          Leave
        </button>
      </div>
    </div>
  );
}
