import { netFor } from "@hb/engine";
import type { Contract, FieldBoard, FieldEntry, FieldResult, Pair, PlayerId } from "@hb/engine";
import { storedSession } from "./account.js";
import { enqueue } from "./outbox.js";
import { fieldBoardsUrl, fieldReferenceUrl, fieldResultUrl } from "./serverUrl.js";

/**
 * The client's half of the field corpus — §1.8a.
 *
 * Three calls, and the shape of them is the format's central rule rather than an
 * arrangement of convenience. **Boards arrive without their history**, because a
 * board's recorded results name the contract and say how it went, which is the
 * largest hint anybody could be handed about a deal they are about to bid. **A
 * result goes out through the outbox**, because a board somebody played must not
 * depend on the network at the moment it ended — the failure `outbox.ts` exists to
 * prevent. **The history is fetched afterwards**, and never waited on: §1.8a
 * requires the deal scored and the comparison blank rather than the other way round.
 */

/**
 * The fallback length, for a caller that has no preference to hand.
 *
 * The real answer is the stepper under the format row — a field session is as long
 * as the row says, in boards, and §1.8a spends one deal a board where §1.8 spends
 * two. The server keeps its own ceiling regardless.
 */
export const FIELD_BOARDS = 8;

/**
 * Boards to play, or null when there are none to be had.
 *
 * Null covers every way this can fail — signed out, offline, a server too old to
 * know the route — because they are one situation from the screen's point of view:
 * there is no session to start. It deliberately does **not** fall back to a rubber.
 * That was the shape of the bug that shipped Mirror broken, where the row said one
 * thing and the game was another.
 */
export async function fetchFieldBoards(count = FIELD_BOARDS): Promise<readonly FieldBoard[] | null> {
  const session = storedSession();
  if (session === null) {
    return null;
  }
  try {
    const response = await fetch(fieldBoardsUrl(count), {
      headers: { Authorization: `Bearer ${session}` },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { readonly boards?: readonly FieldBoard[] };
    const boards = body.boards ?? [];
    return boards.length === 0 ? null : boards;
  } catch {
    return null;
  }
}

/**
 * Files what this seat made of a board.
 *
 * Queued rather than sent, like every other report here. The seat's own score is
 * what goes: a board fixes which stream is being played, so the server needs no seat
 * and cannot be handed the wrong one.
 */
export function reportFieldResult(options: {
  readonly board: FieldBoard;
  readonly contract: Contract | null;
  readonly me: PlayerId;
  readonly points: Pair<number>;
  readonly tricks: Pair<number>;
}): void {
  enqueue({
    kind: "Field board",
    url: fieldResultUrl(),
    // The only report here that needs one: boards are chosen by what this account
    // has already met, so an anonymous result would have nothing to be excluded from.
    withSession: true,
    body: JSON.stringify({
      boardId: options.board.id,
      contract: options.contract,
      // The **net** from this seat, not its own total — see `netFor`. A defender's
      // own total is nought whether the contract scraped home or made an overtrick,
      // so filing that would put a score in the corpus that cannot be ranked.
      points: netFor(options.points, options.me),
      tricks: options.tricks,
    }),
  });
}

/**
 * Every other result on a board, or null while the field is not available.
 *
 * Null for the ordinary case as well as every failure: the server answers 404 until
 * this account has a result recorded on the board, and just after a deal that is
 * usually a report still in flight rather than anything wrong. So the caller retries
 * once the outbox has drained rather than treating it as an answer.
 *
 * An **empty list** is a different answer and has to survive as one: a board whose
 * only result is yours is unranked, not lost.
 */
export async function fetchFieldEntries(boardId: string): Promise<readonly FieldEntry[] | null> {
  const session = storedSession();
  if (session === null) {
    return null;
  }
  try {
    const response = await fetch(fieldReferenceUrl(boardId), {
      headers: { Authorization: `Bearer ${session}` },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { readonly field?: readonly FieldEntry[] };
    return body.field ?? null;
  } catch {
    return null;
  }
}

/** Boards this session has played and not yet been given a field for. */
export function unrankedBoards(results: readonly FieldResult[]): readonly FieldBoard[] {
  return results.filter((one) => one.field === null).map((one) => one.board);
}
