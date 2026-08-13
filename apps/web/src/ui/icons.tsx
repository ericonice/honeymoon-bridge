/**
 * The handful of glyphs the app needs, drawn inline.
 *
 * Inline SVG rather than an icon package, for three icons that would otherwise
 * pull in a dependency and a build step's worth of tree-shaking to use a
 * fraction of a percent of. They take their color from the text around them
 * and scale with it, which a glyph like `⚙` does not — that renders as whatever
 * the platform feels like, and differently on the phone this is built for than
 * on the desktop it is developed on.
 *
 * Hidden from assistive technology on purpose: every one of these sits directly
 * above its own caption, so announcing it would read the label twice.
 */
function Glyph({
  children,
  className = "h-6 w-6",
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function HelpIcon({
  className = "h-6 w-6",
}: { readonly className?: string } = {}): React.JSX.Element {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.4a2.8 2.8 0 1 1 3.2 3.4c-.6.2-.9.7-.9 1.3v.5" />
      <circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function SettingsIcon({
  className = "h-6 w-6",
}: { readonly className?: string } = {}): React.JSX.Element {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="3.1" />
      <circle cx="12" cy="12" r="7.2" opacity="0.5" />
      <path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.5 1.6M6.9 17.1l-1.5 1.5M18.6 18.6l-1.5-1.5M6.9 6.9 5.4 5.4" />
    </Glyph>
  );
}

/**
 * A scoreboard has no universal symbol the way a gear and a question mark do,
 * which is the reason the caption underneath is not optional here.
 */
export function RecordIcon({
  className = "h-6 w-6",
}: { readonly className?: string } = {}): React.JSX.Element {
  return (
    <Glyph className={className}>
      <path d="M3.6 19.6h16.8" />
      <rect x="5.4" y="11" width="3.6" height="6" rx="1.2" />
      <rect x="10.2" y="6.8" width="3.6" height="10.2" rx="1.2" />
      <rect x="15" y="13.4" width="3.6" height="3.6" rx="1.2" />
    </Glyph>
  );
}

export function AchievementIcon({
  className = "h-6 w-6",
}: { readonly className?: string } = {}): React.JSX.Element {
  return (
    <Glyph className={className}>
      <path d="M8 4h8v5.2a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5.5H5.6a1.4 1.4 0 0 0-1.4 1.4v.6a3 3 0 0 0 3 3H8M16 5.5h2.4a1.4 1.4 0 0 1 1.4 1.4v.6a3 3 0 0 1-3 3H16" />
      <path d="M12 13.2v3.4M9.4 20h5.2M10.4 16.6h3.2v1.5a1.6 1.6 0 0 1-1.6 1.6h0a1.6 1.6 0 0 1-1.6-1.6z" />
    </Glyph>
  );
}
