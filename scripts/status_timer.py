#!/usr/bin/env python3
"""Keeps the status check running without relying on GitHub's scheduler.

GitHub's scheduled trigger runs late, skips slots and, on this repository, did not fire at
all in the hours after the status page went live. So the check keeps itself going: each run
of .github/workflows/status-timer.yml waits, starts the next run, then checks the services.
The wait is a "wait timer" on a GitHub environment, so no runner is used while it waits.
A chain of such runs is called a timer here.

There are two timers, so that each can restart the other:

  fast   waits 10 minutes   keeps the page fresh
  slow   waits 3 hours      far apart in time, so one outage rarely catches both

Rules that keep this safe:

  * A run that woke without really waiting never starts another, so a missing wait timer
    stops the chain instead of turning it into a tight loop.
  * A timer has one run in flight. A run that finds a newer run of its own timer stops
    quietly instead of starting another.
  * A run that has been around far longer than its wait is treated as stuck and ignored.
  * If too many runs are going at once, whatever they are called, nothing new is started.

Commands (all need GITHUB_TOKEN and GITHUB_REPOSITORY in the environment):

  tick LANE   Used by status-timer.yml after its wait. Also needs GITHUB_RUN_ID.
  ensure      Start any timer that is not running. Used by status-check.yml.
  show        Print what is in flight. Changes nothing.

Add --dry-run to tick or ensure to print what would be started without starting it.

To stop everything, disable the "Status timer" workflow in the repository's Actions tab.
To start it again, enable it and run "Status check" by hand.
"""

import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API = "https://api.github.com"
WORKFLOW = "status-timer.yml"
REF = "main"

# Minutes each timer waits. The wait itself is the wait timer on the GitHub environment
# status-timer-<name>; these figures must match it. They decide when a run counts as stuck.
LANES = {"fast": 10, "slow": 180}

MIN_WAIT_SECONDS = 300   # a run younger than this did not really wait
GRACE_MINUTES = 35       # a run this much older than its wait is treated as stuck
MAX_IN_FLIGHT = 8        # normally two to four; above this nothing new is started
TITLE = re.compile(r"^Status timer \((\w+)\)$")

APPEAR_CHECKS = 15       # how many times to look for a newly started run...
APPEAR_PAUSE = 4         # ...and the seconds between looks
START_ATTEMPTS = 3
RETRY_PAUSE = 30
PATIENCE_SECONDS = 3600  # how long a tick keeps trying when GitHub's API is failing


def utc_now():
    return dt.datetime.now(dt.timezone.utc)


def parse_time(text):
    return dt.datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)


def read_run(raw):
    title = raw.get("display_title") or ""
    match = TITLE.match(title)
    return {
        "id": raw["id"],
        "lane": match.group(1) if match else None,
        "title": title,
        "status": raw.get("status"),
        "created": parse_time(raw["created_at"]),
    }


def read_runs(payload):
    return [read_run(raw) for raw in (payload or {}).get("workflow_runs", [])]


def age_minutes(run, now):
    return (now - run["created"]).total_seconds() / 60


def in_flight(runs, now):
    """Runs of a known timer that are still going and not stuck."""
    return [run for run in runs
            if run["status"] != "completed" and run["lane"] in LANES
            and age_minutes(run, now) <= LANES[run["lane"]] + GRACE_MINUTES]


def crowded(runs, now):
    """True when too many runs are going at once, whatever they are called."""
    limit = max(LANES.values()) + GRACE_MINUTES
    going = [run for run in runs
             if run["status"] != "completed" and age_minutes(run, now) <= limit]
    return len(going) > MAX_IN_FLIGHT


def plan_tick(runs, mine, lane, now):
    """Decide whether this run should start the next one. Returns (go, fine, why)."""
    if mine["lane"] != lane:
        return (False, False,
                f"This run is titled '{mine['title']}', not 'Status timer ({lane})', so the "
                "timer cannot tell its runs apart. Nothing is started.")
    waited = (now - mine["created"]).total_seconds()
    if waited < MIN_WAIT_SECONDS:
        return (False, False,
                f"This run started after only {int(waited)} seconds. The wait timer on the "
                f"status-timer-{lane} environment is missing or was skipped, so no further "
                "run is started.")
    if any(run["lane"] == lane and run["id"] > mine["id"] for run in in_flight(runs, now)):
        return (False, True,
                f"A newer run of the {lane} timer is already in flight, so this one stops here.")
    if crowded(runs, now):
        return (False, False, "Too many timer runs are going at once. Nothing new is started.")
    return (True, True, f"Waited {int(waited // 60)} minutes. Starting the next {lane} run.")


def plan_ensure(runs, now, skip=None):
    """The timers that have nothing in flight and so need starting."""
    if crowded(runs, now):
        return []
    flying = in_flight(runs, now)
    return [lane for lane in LANES
            if lane != skip and not any(run["lane"] == lane for run in flying)]


class GitHub:
    def __init__(self, repo, token):
        self.repo = repo
        self.token = token

    def call(self, method, path, body=None):
        request = urllib.request.Request(
            API + path,
            method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "status-timer",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
        return json.loads(raw) if raw else None

    def runs(self):
        return read_runs(self.call(
            "GET", f"/repos/{self.repo}/actions/workflows/{WORKFLOW}/runs?per_page=100"))

    def run(self, run_id):
        return read_run(self.call("GET", f"/repos/{self.repo}/actions/runs/{run_id}"))

    def dispatch(self, lane):
        self.call("POST", f"/repos/{self.repo}/actions/workflows/{WORKFLOW}/dispatches",
                  {"ref": REF, "inputs": {"lane": lane}})


def worth_retrying(error):
    """True for trouble that usually passes: GitHub errors, rate limits, network faults."""
    if isinstance(error, urllib.error.HTTPError):
        if error.code >= 500 or error.code == 429:
            return True
        if error.code == 403:
            try:
                return "rate limit" in error.read().decode("utf-8", "replace").lower()
            except Exception:
                return False
        return False
    return isinstance(error, (urllib.error.URLError, TimeoutError, OSError))


def patiently(action, what, patience, pause=time.sleep):
    """Run action, retrying passing trouble for up to `patience` seconds."""
    spent = 0
    while True:
        try:
            return action()
        except Exception as error:
            if not worth_retrying(error) or spent >= patience:
                raise
            print(f"Could not {what} ({error}). Trying again in {RETRY_PAUSE} seconds.")
            pause(RETRY_PAUSE)
            spent += RETRY_PAUSE


def start(gh, lane, newer_than, patience, pause=time.sleep, clock=utc_now):
    """Start one run of a timer and make sure it really appeared."""
    for attempt in range(1, START_ATTEMPTS + 1):
        if crowded(patiently(gh.runs, "list the timer runs", patience, pause), clock()):
            print("Too many timer runs are going at once. Nothing new is started.")
            return False
        patiently(lambda: gh.dispatch(lane), f"start the {lane} timer", patience, pause)
        for _ in range(APPEAR_CHECKS):
            pause(APPEAR_PAUSE)
            runs = patiently(gh.runs, "list the timer runs", patience, pause)
            if any(run["lane"] == lane and run["id"] > newer_than
                   and run["status"] != "completed" for run in runs):
                print(f"The {lane} timer has its next run.")
                return True
        print(f"The new {lane} run did not appear (attempt {attempt} of {START_ATTEMPTS}).")
    return False


def newest_id(runs):
    return max((run["id"] for run in runs), default=0)


def ensure(gh, patience, dry_run=False, skip=None, pause=time.sleep, clock=utc_now):
    """Start every timer that has nothing in flight. Returns True unless a start failed."""
    runs = patiently(gh.runs, "list the timer runs", patience, pause)
    now = clock()
    if crowded(runs, now):
        print("Too many timer runs are going at once. Nothing new is started.")
        return False
    needed = plan_ensure(runs, now, skip)
    if not needed:
        print("The other timer is running." if skip else "Both timers are running.")
    fine = True
    for lane in needed:
        print(f"The {lane} timer is not running. Starting it.")
        if not dry_run:
            fine = start(gh, lane, newest_id(runs), patience, pause, clock) and fine
    return fine


def tick(gh, lane, run_id, patience, dry_run=False, pause=time.sleep, clock=utc_now):
    """What a timer run does when its wait is over. Returns the exit code."""
    mine = patiently(lambda: gh.run(run_id), "read this run", patience, pause)
    runs = patiently(gh.runs, "list the timer runs", patience, pause)
    go, fine, why = plan_tick(runs, mine, lane, clock())
    print(why)
    if go and not dry_run:
        try:
            fine = start(gh, lane, run_id, patience, pause, clock)
        except (urllib.error.URLError, OSError) as error:
            # A refusal here would be repeated for the other timer, so stop.
            print(f"Could not start the next {lane} run: {error}. "
                  "That is expected if the Status timer workflow has been disabled.")
            return 1
        if not fine:
            print(f"Could not start the next {lane} run.")
    # Whatever happened above, make sure the other timer is alive.
    fine = ensure(gh, patience, dry_run, skip=lane, pause=pause, clock=clock) and fine
    return 0 if fine else 1


def show(gh):
    now = utc_now()
    flying = in_flight(gh.runs(), now)
    for lane in LANES:
        mine = [run for run in flying if run["lane"] == lane]
        if not mine:
            print(f"{lane}: nothing in flight")
        for run in mine:
            print(f"{lane}: run {run['id']} {run['status']}, "
                  f"started {int(age_minutes(run, now))} minutes ago")
    return 0


def main(argv):
    args = [arg for arg in argv if arg != "--dry-run"]
    dry_run = len(args) != len(argv)
    command = args[0] if args else ""
    if command not in ("tick", "ensure", "show") or (command == "tick" and len(args) != 2):
        print(__doc__)
        return 2
    try:
        gh = GitHub(os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_TOKEN"])
    except KeyError as missing:
        print(f"Set {missing.args[0]} first.")
        return 2
    if command == "show":
        return show(gh)
    if command == "ensure":
        # Used at the end of a status check, which must not fail or hang because of this.
        try:
            ensure(gh, patience=60, dry_run=dry_run)
        except Exception as error:
            print(f"Could not look after the timers this time ({error}).")
        return 0
    lane = args[1]
    if lane not in LANES:
        print(f"Unknown timer '{lane}'. Expected one of: {', '.join(LANES)}.")
        return 2
    return tick(gh, lane, int(os.environ["GITHUB_RUN_ID"]), PATIENCE_SECONDS, dry_run)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
