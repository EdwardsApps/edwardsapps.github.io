#!/usr/bin/env bash
# Runs one status check and stores the readings on the status-data branch.
# Used by .github/workflows/status-check.yml. Needs STATUS_REMOTE (a git URL it can push to).
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

if git fetch -q --depth 1 origin "$branch" 2>/dev/null; then
  git checkout -q -B "$branch" FETCH_HEAD
  first_run=false
else
  git checkout -q --orphan "$branch"
  first_run=true
fi

# The timer asks more often than a check is needed. Skip unless the last one is old enough
# (STATUS_MIN_GAP_SECONDS, default nine minutes) or the job was started by hand (STATUS_FORCE=1).
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

git add status.json history.json
if git diff --cached --quiet; then
  echo "Nothing changed."
elif [ "$first_run" = false ] && git diff --cached --quiet -- history.json; then
  git commit -q --amend -m "Latest status readings"
  git push -q --force origin "$branch"
  echo "Readings refreshed."
else
  git commit -q -m "Status change recorded"
  git push -q origin "$branch"
  echo "Status change recorded."
fi
