import type { FieldBoard } from "@hb/engine";
import { useEffect, useState } from "react";
import { fetchFieldBoards } from "../game/fieldCorpus.js";
import { preferredFormat, sessionDeals } from "../game/identity.js";
import { matchNoun } from "../game/labels.js";
import { useLocalSession } from "../game/localSession.js";
import { loadRobotMatch } from "../game/robotPersistence.js";
import type { Density } from "../game/identity.js";
import { clearRobotMatch } from "../game/robotPersistence.js";
import { knownRatings, useBotAnchor } from "../game/records.js";
import { GameBoard } from "./GameBoard.js";

export interface RobotGameProps {
  /** How much room the chrome may take — see `Density`. */
  readonly density: Density;
  readonly devTools: boolean;
  /** Whether a tap through a hand's own breakdown goes on to show the match pad. */
  readonly matchDetail: boolean;
  readonly peeking: boolean;
  readonly sound: boolean;
  readonly tapToSelect: boolean;
  /** Whether the play screen draws each side's trick countdown. */
  readonly trickCount: boolean;
  onLeave(): void;
  onShowSettings(): void;
}

/**
 * A match against the computer, running entirely in this browser.
 *
 * **Two components because a field session has to be fetched before it can start.**
 * Its boards come from the corpus rather than from a seed — §1.8a — and a hook
 * cannot decline to run, so `useLocalSession` is kept out of the mount that is still
 * waiting. Every other format skips the wait entirely: `boardsNeeded` is false and
 * the table mounts on the first render, exactly as it always did.
 */
export function RobotGame(props: RobotGameProps): React.JSX.Element {
  // Read once a mount, like every other setting this screen resolves. A resumed
  // match brings its own boards, so only a *new* field session has to wait.
  const [needed] = useState(() => preferredFormat() === "field" && loadRobotMatch() === null);
  const [boards, setBoards] = useState<readonly FieldBoard[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!needed) {
      return;
    }
    let live = true;
    // The length the row asked for, not a constant of this component's own — the
    // stepper under the format row is where "how long is this" is answered, and a
    // second answer here is how the two come to disagree.
    void fetchFieldBoards(sessionDeals()).then((found) => {
      if (!live) {
        return;
      }
      if (found === null) {
        setFailed(true);
      } else {
        setBoards(found);
      }
    });
    return () => {
      live = false;
    };
  }, [needed]);

  if (needed && failed) {
    // **Said rather than swapped for a rubber.** The row says Field; starting
    // something else would be the bug that shipped Mirror broken, where the choice
    // and the game disagreed with nothing erroring anywhere.
    //
    // Being signed out is no longer one of the ways to arrive here — `gateFor` sends
    // that case to the sign-in wall, because the app knew what was wrong and this
    // screen could only say that something was.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-white/70">
          No boards to play. A field session is played on boards the server already
          holds results for, and there are none to be had — either every one has been
          played on this account, or the server cannot be reached.
        </p>
        <button
          type="button"
          className="rounded-xl bg-white px-4 py-3 font-semibold text-stone-900"
          onClick={props.onLeave}
        >
          Back
        </button>
      </div>
    );
  }

  if (needed && boards === null) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-white/60">
        Finding boards…
      </div>
    );
  }

  return <RobotTable {...props} fieldBoards={boards ?? []} />;
}

/** The match itself, mounted only once there is something for it to play. */
function RobotTable({
  density,
  devTools,
  matchDetail,
  onLeave,
  onShowSettings,
  peeking,
  sound,
  fieldBoards,
  tapToSelect,
  trickCount,
}: RobotGameProps & { readonly fieldBoards: readonly FieldBoard[] }): React.JSX.Element {
  // Read once a mount. It changes only when a match ends, and this screen is one match.
  const cached = knownRatings();
  const session = useLocalSession({ fieldBoards, peek: peeking });
  // Which opponent this is: the release, and the rung it is set to play at.
  // Read off the session itself rather than the current setting a second
  // time — `useLocalSession` is what actually pinned these, whether this
  // match just started or was resumed from one already under way, and a
  // second, independent read here is how the two come to disagree.
  const opponent = useBotAnchor(session.releaseVersion, session.rung, session.format);
  const noun = matchNoun(session.format);

  return (
    <GameBoard
      density={density}
      devTools={devTools}
      matchDetail={matchDetail}
      // Nobody is kept waiting and nobody is told, so the warning is only about
      // what this browser is about to throw away — which `clearRobotMatch` is
      // what actually makes true. Without it, the warning would be a promise
      // a reload could quietly keep anyway.
      exit={{
        leave: () => {
          clearRobotMatch();
          onLeave();
        },
        title: `Leave this ${noun}?`,
        warning: "The deals played so far are lost — an unfinished match is not kept anywhere.",
      }}
      peeking={peeking}
      // Both sides are knowable here and only here: the computer's rating is
      // pinned server-side and yours came down with the record, so neither costs
      // a request the robot game is not allowed to make. The opponent's is looked
      // up per rung rather than taken from the last match played, since the whole
      // point of the setting is that those are different opponents.
      ratings={{ mine: cached.mine, opponent }}
      session={session}
      sound={sound}
      tapToSelect={tapToSelect}
      trickCount={trickCount}
      // Only here. At a table the other player would be sitting watching somebody
      // read three notes, and the draw phase has no clock to protect them with.
      walkthrough
      onShowSettings={onShowSettings}
    />
  );
}
