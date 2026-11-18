#!/usr/bin/env python3
"""Tests for scripts/status_timer.py. Run: python scripts/status_timer_test.py"""

import datetime as dt
import io
import re
import sys
import unittest
import urllib.error
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import status_timer as timer  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
NOW = dt.datetime(2026, 11, 18, 12, 0, 0, tzinfo=dt.timezone.utc)


def run(run_id, lane, status, minutes_ago, title=None):
    return {
        "id": run_id,
        "lane": lane,
        "title": title if title is not None else f"Status timer ({lane})",
        "status": status,
        "created": NOW - dt.timedelta(minutes=minutes_ago),
    }


def raw(run_id, title, status, created):
    return {"id": run_id, "display_title": title, "status": status, "created_at": created}


class FakeGitHub:
    """Stands in for GitHub. A started run shows up after `lag` further listings."""

    def __init__(self, runs, lag=1, appears=True, fail_dispatch=0, next_id=1000, refuse=False):
        self.listed = list(runs)
        self.lag = lag
        self.appears = appears
        self.fail_dispatch = fail_dispatch
        self.refuse = refuse
        self.next_id = next_id
        self.pending = []
        self.dispatched = []

    def runs(self):
        still = []
        for left, new in self.pending:
            if left <= 0:
                self.listed.append(new)
            else:
                still.append((left - 1, new))
        self.pending = still
        return list(self.listed)

    def run(self, run_id):
        return next(item for item in self.listed if item["id"] == run_id)

    def dispatch(self, lane):
        if self.refuse:
            raise urllib.error.HTTPError("https://api.github.com", 403, "Forbidden", None, None)
        if self.fail_dispatch:
            self.fail_dispatch -= 1
            raise urllib.error.HTTPError("https://api.github.com", 502, "Bad Gateway", None, None)
        self.dispatched.append(lane)
        if self.appears:
            self.next_id += 1
            self.pending.append((self.lag, run(self.next_id, lane, "waiting", 0)))


def quiet(function, *args, **kwargs):
    with redirect_stdout(io.StringIO()):
        return function(*args, **kwargs)


def no_pause(_seconds):
    return None


class ReadingRuns(unittest.TestCase):
    def test_lane_comes_from_the_run_title(self):
        runs = timer.read_runs({"workflow_runs": [
            raw(3, "Status timer (fast)", "waiting", "2026-11-18T11:55:00Z"),
            raw(2, "Status timer (slow)", "completed", "2026-11-18T09:00:00Z"),
            raw(1, "Something else", "queued", "2026-11-18T08:00:00Z"),
        ]})
        self.assertEqual([item["lane"] for item in runs], ["fast", "slow", None])
        self.assertEqual(runs[0]["created"], NOW - dt.timedelta(minutes=5))

    def test_an_empty_answer_is_no_runs(self):
        self.assertEqual(timer.read_runs(None), [])
        self.assertEqual(timer.read_runs({}), [])


class InFlight(unittest.TestCase):
    def test_finished_and_unknown_runs_do_not_count(self):
        runs = [run(1, "fast", "completed", 3), run(2, None, "waiting", 3, "Odd"),
                run(3, "fast", "waiting", 3)]
        self.assertEqual([item["id"] for item in timer.in_flight(runs, NOW)], [3])

    def test_a_run_far_older_than_its_wait_is_stuck(self):
        fresh, stuck = run(1, "fast", "waiting", 44), run(2, "fast", "waiting", 46)
        self.assertEqual(timer.in_flight([fresh, stuck], NOW), [fresh])

    def test_the_slow_timer_is_given_longer(self):
        fresh, stuck = run(1, "slow", "waiting", 214), run(2, "slow", "waiting", 216)
        self.assertEqual(timer.in_flight([fresh, stuck], NOW), [fresh])


class PlanningATick(unittest.TestCase):
    def test_a_run_on_its_own_starts_the_next(self):
        mine = run(10, "fast", "in_progress", 10.4)
        go, fine, _ = timer.plan_tick([mine], mine, "fast", NOW)
        self.assertEqual((go, fine), (True, True))

    def test_a_run_that_did_not_wait_starts_nothing(self):
        mine = run(10, "fast", "in_progress", 0.3)
        go, fine, why = timer.plan_tick([mine], mine, "fast", NOW)
        self.assertEqual((go, fine), (False, False))
        self.assertIn("wait timer", why)

    def test_a_run_with_the_wrong_title_starts_nothing(self):
        mine = run(10, None, "in_progress", 11, "Status timer")
        go, fine, _ = timer.plan_tick([mine], mine, "fast", NOW)
        self.assertEqual((go, fine), (False, False))

    def test_an_older_run_gives_way_to_a_newer_one(self):
        mine = run(10, "fast", "in_progress", 11)
        go, fine, _ = timer.plan_tick([mine, run(11, "fast", "waiting", 4)], mine, "fast", NOW)
        self.assertEqual((go, fine), (False, True))

    def test_the_newest_run_carries_on(self):
        mine = run(11, "fast", "in_progress", 11)
        go, _, _ = timer.plan_tick([mine, run(10, "fast", "in_progress", 12)], mine, "fast", NOW)
        self.assertTrue(go)

    def test_a_newer_run_that_has_finished_is_ignored(self):
        mine = run(10, "fast", "in_progress", 11)
        go, _, _ = timer.plan_tick([mine, run(11, "fast", "completed", 4)], mine, "fast", NOW)
        self.assertTrue(go)

    def test_a_newer_run_of_the_other_timer_is_ignored(self):
        mine = run(10, "fast", "in_progress", 11)
        go, _, _ = timer.plan_tick([mine, run(11, "slow", "waiting", 4)], mine, "fast", NOW)
        self.assertTrue(go)

    def test_a_long_delayed_run_does_not_give_way_to_a_stuck_one(self):
        mine = run(10, "fast", "in_progress", 200)
        go, _, _ = timer.plan_tick([mine, run(11, "fast", "waiting", 100)], mine, "fast", NOW)
        self.assertTrue(go)

    def test_nothing_starts_when_too_many_runs_are_going(self):
        mine = run(10, "fast", "in_progress", 11)
        crowd = [run(100 + n, None, "queued", 2, "Odd") for n in range(timer.MAX_IN_FLIGHT)]
        go, fine, _ = timer.plan_tick([mine] + crowd, mine, "fast", NOW)
        self.assertEqual((go, fine), (False, False))


class PlanningEnsure(unittest.TestCase):
    def test_both_start_when_nothing_is_running(self):
        self.assertEqual(timer.plan_ensure([], NOW), ["fast", "slow"])
        self.assertEqual(timer.plan_ensure([run(1, "fast", "completed", 5)], NOW), ["fast", "slow"])

    def test_only_the_missing_one_starts(self):
        self.assertEqual(timer.plan_ensure([run(1, "fast", "waiting", 5)], NOW), ["slow"])
        self.assertEqual(timer.plan_ensure([run(1, "slow", "waiting", 170)], NOW), ["fast"])

    def test_nothing_starts_when_both_are_running(self):
        runs = [run(1, "fast", "waiting", 5), run(2, "slow", "waiting", 170)]
        self.assertEqual(timer.plan_ensure(runs, NOW), [])

    def test_a_run_never_restarts_its_own_timer_this_way(self):
        self.assertEqual(timer.plan_ensure([], NOW, skip="fast"), ["slow"])

    def test_a_stuck_run_does_not_hide_a_dead_timer(self):
        runs = [run(1, "fast", "waiting", 90), run(2, "slow", "waiting", 20)]
        self.assertEqual(timer.plan_ensure(runs, NOW), ["fast"])

    def test_nothing_starts_when_too_many_runs_are_going(self):
        crowd = [run(100 + n, None, "queued", 2, "Odd") for n in range(timer.MAX_IN_FLIGHT + 1)]
        self.assertEqual(timer.plan_ensure(crowd, NOW), [])

    def test_old_leftovers_do_not_count_as_a_crowd(self):
        old = [run(100 + n, None, "waiting", 600, "Odd") for n in range(timer.MAX_IN_FLIGHT + 1)]
        self.assertEqual(timer.plan_ensure(old, NOW), ["fast", "slow"])


class Starting(unittest.TestCase):
    def test_it_starts_once_and_sees_the_run_appear(self):
        gh = FakeGitHub([], lag=2)
        self.assertTrue(quiet(timer.start, gh, "fast", 0, 0, no_pause, lambda: NOW))
        self.assertEqual(gh.dispatched, ["fast"])

    def test_it_tries_again_when_the_run_never_appears(self):
        gh = FakeGitHub([], appears=False)
        self.assertFalse(quiet(timer.start, gh, "fast", 0, 0, no_pause, lambda: NOW))
        self.assertEqual(gh.dispatched, ["fast"] * timer.START_ATTEMPTS)

    def test_a_passing_github_error_is_retried(self):
        gh = FakeGitHub([], fail_dispatch=2)
        self.assertTrue(quiet(timer.start, gh, "fast", 0, 600, no_pause, lambda: NOW))
        self.assertEqual(gh.dispatched, ["fast"])

    def test_a_lasting_github_error_is_not_swallowed(self):
        gh = FakeGitHub([], fail_dispatch=99)
        with self.assertRaises(urllib.error.HTTPError):
            quiet(timer.start, gh, "fast", 0, 60, no_pause, lambda: NOW)
        self.assertEqual(gh.dispatched, [])

    def test_an_older_run_does_not_count_as_the_new_one(self):
        gh = FakeGitHub([run(500, "fast", "waiting", 3)], appears=False)
        self.assertFalse(quiet(timer.start, gh, "fast", 500, 0, no_pause, lambda: NOW))

    def test_it_will_not_start_into_a_crowd(self):
        crowd = [run(100 + n, None, "queued", 2, "Odd") for n in range(timer.MAX_IN_FLIGHT + 1)]
        gh = FakeGitHub(crowd)
        self.assertFalse(quiet(timer.start, gh, "fast", 0, 0, no_pause, lambda: NOW))
        self.assertEqual(gh.dispatched, [])

    def test_refusals_are_not_retried(self):
        refused = urllib.error.HTTPError("https://api.github.com", 422, "Unprocessable", None, None)
        self.assertFalse(timer.worth_retrying(refused))
        self.assertTrue(timer.worth_retrying(urllib.error.URLError("no route")))
        self.assertTrue(timer.worth_retrying(
            urllib.error.HTTPError("https://api.github.com", 503, "Unavailable", None, None)))


class ATick(unittest.TestCase):
    def tick(self, gh, lane, run_id, dry_run=False):
        return quiet(timer.tick, gh, lane, run_id, 0, dry_run, no_pause, lambda: NOW)

    def test_a_healthy_tick_starts_only_its_own_next_run(self):
        gh = FakeGitHub([run(10, "fast", "in_progress", 10.5), run(9, "slow", "waiting", 60)])
        self.assertEqual(self.tick(gh, "fast", 10), 0)
        self.assertEqual(gh.dispatched, ["fast"])

    def test_a_tick_restarts_the_other_timer_when_it_has_died(self):
        gh = FakeGitHub([run(10, "fast", "in_progress", 10.5)])
        self.assertEqual(self.tick(gh, "fast", 10), 0)
        self.assertEqual(gh.dispatched, ["fast", "slow"])

    def test_the_slow_timer_restarts_the_fast_one(self):
        gh = FakeGitHub([run(10, "slow", "in_progress", 181)])
        self.assertEqual(self.tick(gh, "slow", 10), 0)
        self.assertEqual(gh.dispatched, ["slow", "fast"])

    def test_a_tick_that_gives_way_starts_nothing(self):
        gh = FakeGitHub([run(10, "fast", "in_progress", 11), run(11, "fast", "waiting", 4),
                         run(9, "slow", "waiting", 60)])
        self.assertEqual(self.tick(gh, "fast", 10), 0)
        self.assertEqual(gh.dispatched, [])

    def test_a_tick_that_did_not_wait_fails_and_starts_no_more_of_itself(self):
        gh = FakeGitHub([run(10, "fast", "in_progress", 0.2), run(9, "slow", "waiting", 60)])
        self.assertEqual(self.tick(gh, "fast", 10), 1)
        self.assertEqual(gh.dispatched, [])

    def test_a_switched_off_timer_ends_the_chain_without_a_crash(self):
        gh = FakeGitHub([run(10, "fast", "in_progress", 10.5)], refuse=True)
        self.assertEqual(self.tick(gh, "fast", 10), 1)
        self.assertEqual(gh.dispatched, [])

    def test_a_dry_run_starts_nothing(self):
        gh = FakeGitHub([run(10, "fast", "in_progress", 10.5)])
        self.assertEqual(self.tick(gh, "fast", 10, dry_run=True), 0)
        self.assertEqual(gh.dispatched, [])

    def test_a_chain_never_grows(self):
        """Run the fast timer for many rounds, with restarts thrown in. One run survives."""
        gh = FakeGitHub([run(10, "fast", "in_progress", 10.5), run(9, "slow", "waiting", 60)])
        current = [10]
        for round_number in range(30):
            if round_number % 7 == 3:
                gh.dispatch("fast")          # someone starts a second one by hand
                gh.runs()
                gh.runs()
            for item in gh.listed:           # every waiting fast run has now waited
                if item["lane"] == "fast" and item["status"] != "completed":
                    item["created"] = NOW - dt.timedelta(minutes=10.5)
                    item["status"] = "in_progress"
            waking = sorted((item["id"] for item in gh.listed
                             if item["lane"] == "fast" and item["status"] == "in_progress"),
                            reverse=round_number % 2 == 1)   # either may wake first
            for run_id in waking:
                self.tick(gh, "fast", run_id)
                gh.run(run_id)["status"] = "completed"
            current = [item["id"] for item in gh.listed
                       if item["lane"] == "fast" and item["status"] != "completed"]
            self.assertEqual(len(current), 1, f"round {round_number}: {current}")


class Ensure(unittest.TestCase):
    def test_it_starts_what_is_missing(self):
        gh = FakeGitHub([run(9, "slow", "waiting", 60)])
        self.assertTrue(quiet(timer.ensure, gh, 0, False, None, no_pause, lambda: NOW))
        self.assertEqual(gh.dispatched, ["fast"])

    def test_it_leaves_healthy_timers_alone(self):
        gh = FakeGitHub([run(9, "slow", "waiting", 60), run(10, "fast", "waiting", 4)])
        self.assertTrue(quiet(timer.ensure, gh, 0, False, None, no_pause, lambda: NOW))
        self.assertEqual(gh.dispatched, [])


class WorkflowAgreement(unittest.TestCase):
    """The workflow file and this script have to agree, or runs cannot be told apart."""

    def setUp(self):
        self.workflow = (ROOT / ".github/workflows/status-timer.yml").read_text(encoding="utf-8")

    def test_the_run_name_is_what_the_script_looks_for(self):
        name = re.search(r"^run-name: (.+)$", self.workflow, re.M).group(1)
        for lane in timer.LANES:
            self.assertTrue(timer.TITLE.match(name.replace("${{ inputs.lane }}", lane)), name)

    def test_the_lanes_offered_are_the_lanes_known(self):
        options = re.search(r"options: \[(.+)\]", self.workflow).group(1)
        self.assertEqual([item.strip() for item in options.split(",")], list(timer.LANES))

    def test_the_wait_comes_from_the_matching_environment(self):
        self.assertIn("name: status-timer-${{ inputs.lane }}", self.workflow)

    def test_the_workflow_file_is_the_one_the_script_starts(self):
        self.assertTrue((ROOT / ".github/workflows" / timer.WORKFLOW).exists())

    def test_the_waits_in_the_comments_match_the_script(self):
        for lane, minutes in timer.LANES.items():
            self.assertRegex(self.workflow, rf"status-timer-{lane}\s+{minutes} minutes")


if __name__ == "__main__":
    unittest.main()
