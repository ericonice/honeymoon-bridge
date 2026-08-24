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
function stride(): number {
  const arg = process.argv.find((one) => one.startsWith("every="));
  const asked = arg === undefined ? EVERY : Number(arg.slice("every=".length));
  return Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : EVERY;
}

export function createProgress(total: number, label: string): Progress {
  const started = performance.now();
  const every = stride();

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
