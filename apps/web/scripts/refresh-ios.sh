#!/usr/bin/env bash
#
# Re-sign and reinstall the iOS app before its provisioning profile lapses.
#
# A free Apple developer account issues a **seven day** profile, and iOS refuses
# to launch the app the moment it expires — "Honeymoon Bridge Is No Longer
# Available", with nothing on screen saying why. The seven days cannot be
# extended: Apple stamps `ExpirationDate` at issue and signs the profile, so
# editing it only breaks the signature. What can be avoided is *meeting* the
# deadline, which is all this does.
#
# It is written to be run **daily and do nothing most days**. The expensive work
# is skipped while the installed build still has slack, so running it often costs
# one file read — and running it often is the point: the phone has to be reachable
# for an install to land, and a weekly job that fired while the phone was out of
# the house would miss its only chance. Daily gives REFRESH_WITHIN_DAYS attempts
# before anything actually expires.
#
# Exits 0 when there is nothing to do *and* when the phone is simply absent, so a
# launchd job does not report a failure for the ordinary case of somebody being
# out. A real build or install failure exits non-zero.
set -euo pipefail

BUNDLE_ID="com.ericonice.honeymoonbridge"
# Three days of slack, so the phone has three daily chances to be on the network
# before the build that is already on it stops working.
REFRESH_WITHIN_DAYS=3
DERIVED="${HOME}/Library/Caches/honeymoon-bridge-ios"
STATE="${DERIVED}/installed-profile-expiry"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web="$(dirname "$here")"

say() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# How many days the profile *embedded in the app on the phone* has left.
#
# **Not the profile cached on this Mac**, which is a different question and the
# one this script asked first. Xcode renews its own copy in the background, so the
# Mac can hold a profile good for seven days while the phone still runs a binary
# signed with last week's — the app is dead and the check says "nothing to do".
# Found exactly that way: a renewal landed at 13:00 and the first version of this
# reported seven days left while the dialog was still on screen.
#
# What the phone holds was decided at install time, so that is what gets recorded.
# Empty when this script has never installed anything, which is a reason to
# install rather than to give up.
installed_days_left() {
  [ -f "$STATE" ] || return 0
  /usr/bin/python3 -c '
import datetime, sys
try:
    exp = datetime.datetime.fromisoformat(sys.argv[1])
except Exception:
    sys.exit(0)
if exp.tzinfo is None:
    exp = exp.replace(tzinfo=datetime.timezone.utc)
print(f"{(exp - datetime.datetime.now(datetime.timezone.utc)).total_seconds() / 86400:.2f}")
' "$(cat "$STATE")"
}

# When the profile this Mac currently holds for the bundle runs out. Used only to
# stamp the state file after an install, since that is the profile the freshly
# signed binary carries.
profile_expiry() {
  /usr/bin/python3 -c '
import glob, os, plistlib, subprocess, sys
bundle = sys.argv[1]
best = None
for d in ("~/Library/Developer/Xcode/UserData/Provisioning Profiles",
          "~/Library/MobileDevice/Provisioning Profiles"):
    for path in glob.glob(os.path.expanduser(d) + "/*"):
        try:
            raw = subprocess.run(["security", "cms", "-D", "-i", path],
                                 capture_output=True, check=True).stdout
            plist = plistlib.loads(raw)
        except Exception:
            continue
        # The profile names the app as TEAMID.com.example.app, so a suffix match
        # identifies it without needing to know the team.
        app = plist.get("Entitlements", {}).get("application-identifier", "")
        if not app.endswith(bundle):
            continue
        exp = plist.get("ExpirationDate")
        if exp and (best is None or exp > best):
            best = exp
if best is not None:
    print(best.isoformat())
' "$BUNDLE_ID"
}

# The UDID of a paired iPhone reachable right now. Empty when the phone is off,
# asleep or elsewhere — not an error, just a day this cannot run.
reachable_device() {
  local out
  out="$(mktemp)"
  xcrun devicectl list devices --json-output "$out" >/dev/null 2>&1 || { rm -f "$out"; return 0; }
  /usr/bin/python3 -c '
import json, sys
try:
    devices = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception:
    sys.exit(0)
for d in devices:
    if d.get("hardwareProperties", {}).get("platform") != "iOS":
        continue
    # `connected` means a tunnel is up and an install can land. Anything else —
    # unavailable, disconnected — is a phone that is merely *known*.
    if d.get("connectionProperties", {}).get("tunnelState") == "connected":
        print(d["hardwareProperties"]["udid"])
        break
' "$out"
  rm -f "$out"
}

left="$(installed_days_left)"
if [ -n "$left" ]; then
  say "the build on the phone has ${left} days left"
  if awk "BEGIN { exit !($left > $REFRESH_WITHIN_DAYS) }"; then
    say "nothing to do"
    exit 0
  fi
else
  say "nothing installed by this script yet — installing"
fi

udid="$(reachable_device)"
if [ -z "$udid" ]; then
  say "no iPhone reachable; will try again tomorrow"
  exit 0
fi
say "refreshing onto ${udid}"

mkdir -p "$DERIVED"
cd "$web"
npm run sync:ios

# `-allowProvisioningUpdates` is the flag that does the real work: without it
# xcodebuild will not renew an expired profile, it just fails to sign.
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "id=${udid}" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  build

xcrun devicectl device install app --device "$udid" \
  "${DERIVED}/Build/Products/Debug-iphoneos/App.app"

# Stamped only after the install actually succeeded, so a failed run leaves the
# old value and the next run tries again rather than believing itself done.
profile_expiry > "$STATE"
say "installed; good until $(cat "$STATE")"
