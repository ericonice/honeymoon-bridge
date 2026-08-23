import type { AchievementId } from "@hb/engine";

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

/**
 * A hand of cards, the base for the three lifetime-count families.
 *
 * Played, Won and Lost are one family of three and are drawn as one: the same
 * three cards, with a chevron up for won and down for lost, and nothing for
 * played — which is right, since played is the superset of the other two.
 */
const CARDS = (
  <>
    <rect x="3.5" y="3.5" width="5" height="11" rx="1.2" />
    <rect x="9.5" y="3.5" width="5" height="11" rx="1.2" />
    <rect x="15.5" y="3.5" width="5" height="11" rx="1.2" />
  </>
);

/**
 * One glyph per achievement family.
 *
 * The trophy stood for all thirteen until now, which made a Grand Slam and
 * Hands Played identical on both screens that show them — so the notification
 * announced a title without saying which kind of thing it was.
 *
 * Drawn from rectangles, straight lines and simple polygons rather than fitted
 * curves. At 24 to 32 pixels a suit pip or a chair rendered in beziers is a
 * smudge, and a shape built from primitives is one whose result can be predicted
 * from reading it — which matters for thirteen glyphs that all have to work at
 * badge size and at 6px in a list.
 */
const FAMILY_GLYPHS: Record<AchievementId, React.ReactNode> = {
  // A die: the gamble of taking card 2 sight-unseen, which is what this counts.
  "against-the-odds": (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
      <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  // Setting a contract, and the name is already the picture.
  axe: (
    <>
      <path d="M11.6 5.2 19.2 8.4 15.6 12.6 9.8 9.8Z" />
      <path d="M10.6 10.9 6.4 19.6" />
    </>
  ),
  // Losing the first game and winning anyway: down, then up and out.
  "down-but-not-out": (
    <>
      <path d="M4 8.6 9.6 15.8 13.6 11.8 20 5.6" />
      <path d="M15.2 5.6H20v4.8" />
    </>
  ),
  "hands-lost": (
    <>
      {CARDS}
      <path d="M9 17.6 12 20.6 15 17.6" />
    </>
  ),
  "hands-played": CARDS,
  "hands-won": (
    <>
      {CARDS}
      <path d="M9 20.6 12 17.6 15 20.6" />
    </>
  ),
  // They doubled it and it made: the double, then the tick.
  insult: (
    <>
      <path d="M5.4 6.4 11.4 12.4M11.4 6.4 5.4 12.4" />
      <path d="M12.4 15.4 15.4 18.4 20.6 11.4" />
    </>
  ),
  // Rubbers finished, over and over: a finish pennant.
  marathon: (
    <>
      <path d="M7 3.8v16.4" />
      <path d="M7 5.2h10.6l-2.7 3.3 2.7 3.3H7Z" />
    </>
  ),
  // A hand nobody would bid: the deal, struck out.
  "nobody-wanted-it": (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="2" />
      <path d="M8.2 18.4 15.8 5.6" />
    </>
  ),
  // Sitting flesh — the German is literally the endurance to stay in the chair,
  // so the glyph is the time it takes rather than the chair.
  sitzfleisch: <path d="M7 4h10l-5 8 5 8H7l5-8Z" />,
  // The highest thing you can bid and make.
  slam: <path d="M4.4 18.6 5.8 8.4l4.2 4L12 6l2 6.4 4.2-4 1.4 10.2Z" />,
  // The trophy stays with the one achievement that is actually the trophy.
  "take-the-rubber": (
    <>
      <path d="M8 4h8v5.2a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5.5H5.6a1.4 1.4 0 0 0-1.4 1.4v.6a3 3 0 0 0 3 3H8M16 5.5h2.4a1.4 1.4 0 0 1 1.4 1.4v.6a3 3 0 0 1-3 3H16" />
      <path d="M12 13.2v3.4M9.4 20h5.2M10.4 16.6h3.2v1.5a1.6 1.6 0 0 1-1.6 1.6h0a1.6 1.6 0 0 1-1.6-1.6z" />
    </>
  ),
  // Two suits and no more: two pips, so the count is the picture.
  "two-suiter": (
    <>
      <path d="M7.6 5.6 10.8 10.4 7.6 15.2 4.4 10.4Z" />
      <circle cx="16.6" cy="8.4" r="2.1" />
      <circle cx="14.3" cy="12" r="2.1" />
      <circle cx="18.9" cy="12" r="2.1" />
      <path d="M16.6 14v3.2M14.7 17.6h3.8" />
    </>
  ),
};

/**
 * The glyph for one achievement family, at whatever size it is given.
 *
 * Separate from `AchievementIcon` rather than an optional prop on it: that one
 * is the trophy standing for the whole idea, on the Home button that opens the
 * list, and it should not need a family it does not have.
 */
export function FamilyIcon({
  achievement,
  className = "h-6 w-6",
}: {
  readonly achievement: AchievementId;
  readonly className?: string;
}): React.JSX.Element {
  return <Glyph className={className}>{FAMILY_GLYPHS[achievement]}</Glyph>;
}
