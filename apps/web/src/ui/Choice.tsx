/**
 * A choice between a few named values, as a row of buttons under a label.
 *
 * A toggle cannot say "more or less of this", and every setting that reaches
 * for this is a value with more than two states rather than a thing to be on
 * or off. No border or rounding of its own — see `Toggle`'s own doc for why:
 * this sits inside a `SettingsSection`, which draws the card these rows share.
 */
export function Choice<T extends string>({
  description,
  label,
  onChange,
  options,
  value,
}: {
  readonly description: string;
  readonly label: string;
  onChange(next: T): void;
  readonly options: readonly { readonly label: string; readonly value: T }[];
  readonly value: T;
}): React.JSX.Element {
  return (
    <div className="px-4 py-3">
      <span className="block text-base font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-white/55">{description}</span>
      <div className="mt-2.5 flex gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium ${
              option.value === value ? "bg-white text-stone-900" : "border border-white/15"
            }`}
            onClick={() => {
              onChange(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
