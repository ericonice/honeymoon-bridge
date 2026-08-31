/**
 * A plain on/off row — a label, a description, and a switch.
 *
 * No border or rounding of its own: this sits inside a `SettingsSection`, which
 * draws the card and the hairline between this row and its neighbours. A row
 * used on its own would need wrapping in one for the edges to read correctly.
 */
export function Toggle({
  description,
  label,
  on,
  onChange,
}: {
  readonly description: string;
  readonly label: string;
  readonly on: boolean;
  onChange(next: boolean): void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 px-4 py-3 text-left"
      aria-pressed={on}
      onClick={() => {
        onChange(!on);
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-white/55">{description}</span>
      </span>
      <span
        className={`mt-1 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 ${
          on ? "bg-emerald-400" : "bg-white/20"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white ${on ? "translate-x-4" : "translate-x-0"}`}
        />
      </span>
    </button>
  );
}
