export interface SegmentedProps<T extends string> {
  onChange(next: T): void;
  readonly options: readonly { readonly label: string; readonly value: T }[];
  readonly value: T;
}

/**
 * A row of buttons where exactly one is chosen, and the rest is up to the caller.
 *
 * The app already had this twice over — as the button row inside `Choice`, which a
 * settings row wraps in a label and a description, and as the You / Everyone switch
 * on the record, which wraps it in nothing. A third use wanted it without either, so
 * it is its own control rather than a second copy of the same three classes.
 *
 * Real `button`s with `aria-pressed`, which is the rule this app keeps arriving at:
 * a decorated `div` leaves the keyboard and a screen reader with no way to know
 * there is a choice here at all.
 */
export function Segmented<T extends string>({
  onChange,
  options,
  value,
}: SegmentedProps<T>): React.JSX.Element {
  return (
    <div className="flex gap-2">
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
  );
}
