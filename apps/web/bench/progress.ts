/**
 * Says how a long run is going while it is still going.
 *
 * These benches take minutes and used to print nothing until they finished, so
 * a run that was working and a run that had wedged looked identical. That is a
 * bad property in a tool whose whole job is to be trusted about slow things.
 *
 * Note that piping one of these through `grep` or `tail` will re-buffer stdout
 * and hide the progress again. Watch a run raw, or `tail -f` the file it is
 * writing to.
 */

const EVERY = 25;

export interface Progress {
  (done: number, note?: string): void;
}

/**
 * `every=1` reports each step instead of every twenty-fifth.
 *
 * Worth having for more than impatience: watching a win rate wander between 20%
 * and 70% over the first dozen rubbers and then settle is the most direct cure
 * there is for reading a result into an early number — which is a mistake this
 * project has made repeatedly, and one an error bar printed beside the tally
 * makes hard to keep making.
 */
function stride(fallback: number): number {
  const arg = process.argv.find((one) => one.startsWith("every="));
  const asked = arg === undefined ? fallback : Number(arg.slice("every=".length));
  return Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : fallback;
}

/**
 * `fallback` is what to report every when nothing was asked for on the command line.
 *
 * Twenty-five suits a bench whose step is a deal or a rubber. It suits a bench whose
 * step is *minutes* very badly: the corpus generator spends about two minutes a seed,
 * so a 24-seed run printed one line at the start and nothing else for half an hour —
 * which is exactly the property this module exists to prevent, arrived at from the
 * other direction. A caller whose steps are slow says so.
 */
export function createProgress(total: number, label: string, fallback = EVERY): Progress {
  const started = performance.now();
  const every = stride(fallback);

  return (done: number, note = "") => {
    if (done % every !== 0 && done !== total) {
      return;
    }
    const elapsed = (performance.now() - started) / 1000;
    const remaining = elapsed <= 0 ? 0 : (elapsed / done) * (total - done);
    const suffix = done === total ? "" : ` ~${remaining.toFixed(0)}s left`;
    console.log(`  ${label} ${done}/${total}${note === "" ? "" : `  ${note}`}${suffix}`);
  };
}
