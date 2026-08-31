import { Chevron } from "./Chevron.js";

/**
 * A labelled group of settings rows, merged into one card with hairlines
 * between them rather than each row wearing its own separate border.
 *
 * Replaces a screen where every row — a toggle, a picker, a button — was its
 * own bordered box regardless of what it belonged with, which read as a list
 * of unrelated things rather than a few related groups. `accent` is the one
 * variant: the same shape, tinted amber, for the "Testing only" panel, which
 * needs to keep reading as not-a-normal-setting even inside the same layout.
 *
 * **Collapsed by default, the same reasoning `HelpOverlay`'s own `Section`
 * was built on**: a list of headings reads as a table of contents rather than
 * a page to scroll past to find one row in. Each section owns its own open
 * state rather than an accordion closing its neighbours — opening one to
 * check something should not hide whatever else was already open.
 */
export function SettingsSection({
  accent = false,
  children,
  description,
  onToggle,
  open,
  title,
}: {
  readonly accent?: boolean;
  readonly children: React.ReactNode;
  /** Shown under the title whether the section is open or closed, so it can inform the decision to open it. */
  readonly description?: string;
  onToggle(): void;
  readonly open: boolean;
  readonly title: string;
}): React.JSX.Element {
  return (
    <div className="w-full max-w-sm">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 px-1 pb-2 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>
          <span
            className={`block text-xs tracking-wide uppercase ${
              accent ? "text-amber-200/80" : "text-white/40"
            }`}
          >
            {title}
          </span>
          {description === undefined ? null : (
            <span className="mt-1 block text-xs text-white/50">{description}</span>
          )}
        </span>
        <Chevron open={open} />
      </button>
      {open ? (
        <div
          className={`divide-y overflow-hidden rounded-xl border ${
            accent
              ? "divide-amber-300/15 border-amber-300/25 bg-amber-300/5"
              : "divide-white/10 border-white/12 bg-white/[0.03]"
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
