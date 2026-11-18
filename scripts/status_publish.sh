#!/usr/bin/env bash
# Runs one status check and stores the readings on the status-data branch.
# Used by .github/workflows/status-check.yml and status-timer.yml. Needs STATUS_REMOTE (a git URL it can push to).
#
# The branch gets a new commit only when a problem starts or ends (history.json changes).
# Routine re-checks replace the latest commit instead, so the branch stays small.
set -euo pipefail

remote="${STATUS_REMOTE:?Set STATUS_REMOTE to the repository URL}"
branch="status-data"
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

git init -q "$work"
cd "$work"
git remote add origin "$remote"
git config user.name "status-check"
git config user.email "status-check@users.noreply.github.com"

# Two commits deep, so the latest commit can be replaced without losing the one before it.
if git fetch -q --depth 2 origin "$branch" 2>/dev/null; then
  git checkout -q -B "$branch" FETCH_HEAD
  base="$(git rev-parse FETCH_HEAD)"
  first_run=false
else
  git checkout -q --orphan "$branch"
  base=""
  first_run=true
fi

# Several things can ask for a check (the timers, GitHub's scheduler, a push to the site).
# Skip unless the last check is old enough (STATUS_MIN_GAP_SECONDS, default nine minutes)
# or the job was started by hand (STATUS_FORCE=1).
if [ "$first_run" = false ] && [ "${STATUS_FORCE:-}" != "1" ]; then
  age="$(python3 -c '
import datetime as dt, json
try:
    checked = json.load(open("status.json"))["checked_at"]
    then = dt.datetime.strptime(checked, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
    print(int((dt.datetime.now(dt.timezone.utc) - then).total_seconds()))
except Exception:
    print(999999)
')"
  if [ "$age" -lt "${STATUS_MIN_GAP_SECONDS:-540}" ]; then
    echo "Last check was ${age} seconds ago. Nothing to do yet."
    exit 0
  fi
fi

python3 "$root/scripts/status_check.py" run --data "$work"

# Never publish an empty or broken reading.
python3 -c 'import json,sys; d=json.load(open("status.json")); h=json.load(open("history.json")); sys.exit(0 if d.get("services") and "episodes" in h else 1)'

# Store the readings, but only if the branch is still as this check found it. If another
# check stored its own while this one was running, leave those in place: they are just as
# fresh, and overwriting them could lose a recorded change.
store() {
  if [ -n "$base" ]; then
    set -- --force-with-lease="$branch:$base"
  fi
  if git push -q "$@" origin "$branch"; then
    return 0
  fi
  latest="$(git ls-remote origin "refs/heads/$branch" | cut -f1)"
  if [ -n "$base" ] && [ -n "$latest" ] && [ "$latest" != "$base" ]; then
    echo "Another check stored its readings first. Nothing more to do."
    exit 0
  fi
  echo "Could not store the readings." >&2
  exit 1
}

git add status.json history.json
if git diff --cached --quiet; then
  echo "Nothing changed."
elif [ "$first_run" = false ] && git diff --cached --quiet -- history.json; then
  git commit -q --amend -m "Latest status readings"
  store
  echo "Readings refreshed."
else
  git commit -q -m "Status change recorded"
  store
  echo "Status change recorded."
fi
