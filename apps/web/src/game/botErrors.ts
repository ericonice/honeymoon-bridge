import { readStored, writeStored } from "./storage.js";

/**
 * One turn the computer failed to decide, kept for whoever reads it out.
 *
 * Nothing here may be the reason a game hangs — that is the whole point of
 * catching whatever this is a record of. Best-effort in exactly the way
 * `fetchTiming.ts` is: a diagnostic must never itself be the thing that
 * throws.
 */
export interface BotErrorSample {
  readonly board: number | null;
  readonly message: string;
  readonly phase: string;
  readonly stack: string | null;
  readonly when: number;
}

const KEY = "hb.botErrors";
const KEPT = 3;

export function recordBotError(context: {
  readonly board: number | null;
  readonly error: unknown;
  readonly phase: string;
}): void {
  try {
    const { board, error, phase } = context;
    const sample: BotErrorSample = {
      board,
      message: error instanceof Error ? error.message : String(error),
      phase,
      // Truncated: this is a hint for a person reading Settings, not a full trace.
      stack: error instanceof Error && error.stack !== undefined ? error.stack.slice(0, 500) : null,
      when: Date.now(),
    };
    const kept = [sample, ...readBotErrors()].slice(0, KEPT);
    writeStored(KEY, JSON.stringify(kept));
  } catch {
    // Best-effort, per the doc above.
  }
}

export function readBotErrors(): readonly BotErrorSample[] {
  const raw = readStored(KEY);
  if (raw === null) {
    return [];
  }
  try {
    return JSON.parse(raw) as BotErrorSample[];
  } catch {
    return [];
  }
}
