const STORAGE_KEY = "hb.devTools";

function readStored(): boolean | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === null ? null : value === "1";
  } catch {
    // Safari in private mode throws rather than returning null.
    return null;
  }
}

/** `?dev=1` turns the shortcuts on, `?dev=0` off, anything else leaves them alone. */
function readQuery(): boolean | null {
  const value = new URLSearchParams(window.location.search).get("dev");
  if (value === null) {
    return null;
  }
  return value !== "0" && value !== "false";
}

export function writeDevTools(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Nothing to do; the setting still holds for this session.
  }
}

/**
 * Whether the development shortcuts are available.
 *
 * They used to be compiled out of any deployed build, which was tidy and wrong:
 * the phone is where the game is actually judged, and the shortcuts were
 * unavailable exactly where they were most needed.
 *
 * So a deployed build carries them, switched off, and Settings turns them on.
 * The choice is remembered — an installed PWA launches at its start URL with no
 * query string, so a URL flag alone would not survive being installed. `?dev=1`
 * still works and wins over the remembered value, which is the quickest way in
 * on a device where reaching Settings is itself the problem.
 *
 * This is safe to ship because the shortcuts cannot show anything a player is
 * not entitled to see. They decide both seats at random through the ordinary
 * `applyAction` path; they fast-forward the game, they do not open it up. When
 * the networked version arrives the server is the authority, so a client-side
 * skip is simply refused, which is the test of whether a control belongs here.
 *
 * `peek` is the one that reads like a failure of that test and is not: over a
 * network the other hand never reaches the device at all, so there is nothing
 * for it to reveal and nothing for the server to refuse. It ships as its own
 * setting rather than as one of these — see `LocalSessionOptions`.
 *
 * Resolution order: the query string, then a remembered choice, then the dev
 * server default. So `?dev=0` also gives a clean run locally.
 */
export function readDevTools(): boolean {
  const fromQuery = readQuery();
  if (fromQuery !== null) {
    writeDevTools(fromQuery);
    return fromQuery;
  }
  return readStored() ?? import.meta.env.DEV;
}
