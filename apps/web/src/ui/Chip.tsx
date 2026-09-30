export type ChipTone = "plain" | "vulnerable";

const TONE: Record<ChipTone, string> = {
  plain: "border-white/10 bg-white/8 text-white/60",
  vulnerable: "border-red-400/25 bg-red-500/20 text-red-200",
};

/**
 * A small mark attached to whatever it sits beside.
 *
 * A ground, a hairline and small caps are what say "this is a label on that" — faint
 * words alongside a contract read as a sentence that ran out of room, five things of
 * equal weight rather than a thing with notes on it. `VUL` is not a word in the
 * sentence; it is a mark.
 *
 * **`vulnerable` is red because every bridge scorecard ever printed draws it that
 * way**, which is the player's own language rather than a fourth vocabulary — and
 * vulnerability is the largest multiplier on any figure it appears next to. The tint
 * is on the ground rather than the letters, which is what keeps it clear of the one
 * rule red already has here: `text-red-400` means *this is a red suit*, and a red
 * word two characters from a red pip is a collision. A red-grounded badge is not a
 * glyph and cannot be taken for one.
 *
 * **Shared because the badge means one thing in both places it appears, and the
 * subject is whatever it is attached to.** On a seat label it qualifies a player —
 * *you are vulnerable* — and on a traveller row it qualifies a contract — *this one
 * was played vulnerable*. Those are the same fact seen from two sides, and they were
 * two chips with two different reds until this existed: `bg-red-500/25` on one and
 * `bg-red-400/12` plus a border on the other, already drifting a few hours after the
 * second was written.
 */
export function Chip({
  children,
  tone = "plain",
}: {
  readonly children: React.ReactNode;
  readonly tone?: ChipTone;
}): React.JSX.Element {
  return (
    <span
      className={`shrink-0 rounded border px-1 py-px text-[0.6rem] leading-[1.35] font-medium tracking-wide uppercase ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
