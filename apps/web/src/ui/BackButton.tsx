import { ChevronLeftIcon } from "./icons.js";

/**
 * A screen's own way back, in the corner an iPhone actually keeps it.
 *
 * A full-width button at the foot of the screen was never how iOS goes back —
 * that is a chevron in the top-left, and it stays there whatever the content
 * below does, which is why this sits above the scrollable area rather than
 * inside it. The thumb-reach argument for the bottom is real, but familiarity
 * lost to it: a control in an unfamiliar place reads as wrong before anybody
 * can say why.
 */
export function BackButton({ onBack }: { onBack(): void }): React.JSX.Element {
  return (
    <button
      type="button"
      className="-ml-2 flex items-center gap-0.5 self-start rounded-lg px-2 py-1 text-base text-white/70"
      onClick={onBack}
    >
      <ChevronLeftIcon className="h-5 w-5" />
      Back
    </button>
  );
}
