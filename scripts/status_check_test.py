#!/usr/bin/env python3
"""Checks for scripts/status_check.py using small made-up feeds. Run: python scripts/status_check_test.py"""

from __future__ import annotations

import datetime as dt
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import status_check as sc  # noqa: E402


class FakeFetcher:
    def __init__(self, pages=None, up=True):
        self.pages = pages or {}
        self.up = up

    def get(self, url):
        if url not in self.pages:
            raise OSError("no such page " + url)
        value = self.pages[url]
        return value if isinstance(value, bytes) else json.dumps(value).encode()

    def get_json(self, url):
        return json.loads(self.get(url).decode("utf-8-sig"))

    def reachable(self, url):
        return self.up


def statuspage(indicator="none", incidents=(), components=(), maintenances=()):
    return {"status": {"indicator": indicator, "description": "x"}, "incidents": list(incidents),
            "components": list(components), "scheduled_maintenances": list(maintenances)}


def incident(name, impact="minor", status="investigating", body="We are looking into it."):
    return {"name": name, "impact": impact, "status": status, "shortlink": "https://stspg.io/abc",
            "started_at": "2026-11-17T10:00:00.000Z", "incident_updates": [{"body": body}]}


NOW = dt.datetime(2026, 11, 17, 12, 0, tzinfo=dt.timezone.utc)


class Readers(unittest.TestCase):
    def page(self, svc, data):
        svc = dict({"id": "x", "name": "X", "base": "https://status.example.com"}, **svc)
        return sc.read_statuspage(svc, FakeFetcher({"https://status.example.com/api/v2/summary.json": data}))

    def test_statuspage_clear(self):
        self.assertEqual(self.page({}, statuspage())["level"], "ok")

    def test_statuspage_incident_without_indicator_is_minor(self):
        out = self.page({}, statuspage(incidents=[incident("Logins failing")]))
        self.assertEqual(out["level"], "minor")
        self.assertEqual(out["items"][0]["title"], "Logins failing")
        self.assertEqual(out["items"][0]["started"], "2026-11-17T10:00:00Z")

    def test_statuspage_follows_their_headline(self):
        out = self.page({}, statuspage("major", [incident("Down", "major")]))
        self.assertEqual(out["level"], "major")
        out = self.page({}, statuspage("minor", [incident("Odd", "major")]))
        self.assertEqual(out["level"], "minor")

    def test_statuspage_lists_components_when_no_incident(self):
        out = self.page({}, statuspage("minor", components=[{"name": "Website", "status": "degraded_performance"}]))
        self.assertEqual(out["level"], "minor")
        self.assertEqual(out["items"][0]["title"], "Affected: Website")

    def test_statuspage_ignores_other_countries_and_resolved(self):
        svc = {"use_indicator": False, "ignore": r"^(AU|NZ|US)\b"}
        data = statuspage("major", [incident("US: Payroll down", "major"), incident("Old", status="resolved")])
        self.assertEqual(self.page(svc, data)["level"], "ok")
        data = statuspage("none", [incident("UK: VAT returns failing")])
        self.assertEqual(self.page(svc, data)["level"], "minor")

    def test_statuspage_quiet_provider_only_reacts_to_major(self):
        svc = {"use_indicator": False, "min_impact": "major"}
        out = self.page(svc, statuspage("minor", [incident("One data centre re-routed")]))
        self.assertEqual(out["level"], "ok")
        self.assertIn("1 smaller notice", out["notes"][0])
        out = self.page(svc, statuspage("critical", [incident("Global outage", "critical")]))
        self.assertEqual(out["level"], "major")

    def test_apple(self):
        event = {"messageId": "1", "statusType": "Issue", "message": "This service may be slow.",
                 "usersAffected": "All users are affected", "eventStatus": "ongoing", "endDate": None,
                 "epochStartDate": 1794933900000, "affectedServices": None}
        done = dict(event, messageId="2", eventStatus="resolved")
        feed = {"services": [{"serviceName": "iCloud Mail", "events": [event, dict(event)]},
                             {"serviceName": "Stocks", "events": [done]},
                             {"serviceName": "AppleCare on Device", "events": [dict(event, messageId="3")]}]}
        svc = {"feed": "f", "page": "https://www.apple.com/uk/support/systemstatus/"}
        out = sc.read_apple(svc, FakeFetcher({"f": ("jsonCallback(" + json.dumps(feed) + ");").encode()}))
        self.assertEqual(out["level"], "major")
        self.assertEqual([i["title"] for i in out["items"]], ["iCloud Mail: issue", "AppleCare on Device: issue"])
        quiet = {"services": [{"serviceName": "AppleCare on Device", "events": [dict(event, messageId="3")]}]}
        self.assertEqual(sc.read_apple(svc, FakeFetcher({"f": json.dumps(quiet).encode()}))["level"], "minor")

    def test_google(self):
        feed = [{"end": "2026-11-01T00:00:00+00:00", "status_impact": "SERVICE_OUTAGE"},
                {"begin": "2026-11-17T09:00:00+00:00", "status_impact": "SERVICE_DISRUPTION", "service_name": "Gmail",
                 "external_desc": "**Summary:**\nDelays sending mail.\n**Description:**\nMore.", "uri": "incidents/abc"}]
        svc = {"feed": "f", "page": "https://www.google.com/appsstatus/dashboard/"}
        out = sc.read_google(svc, FakeFetcher({"f": feed}))
        self.assertEqual(out["level"], "minor")
        self.assertEqual(out["items"][0]["title"], "Gmail: Delays sending mail.")
        self.assertTrue(out["items"][0]["url"].endswith("/incidents/abc"))
        self.assertEqual(sc.read_google(dict(svc, min_impact="major"), FakeFetcher({"f": feed}))["level"], "ok")

    def test_aws_reads_utf16_and_weighs_regions(self):
        far = {"arn": "arn:aws:health:me-central-1::event/X", "region_name": "UAE", "status": "3", "date": "1772369485",
               "service_name": "Multiple services", "summary": "Region Availability", "event_log": [{"message": "m"}]}
        near = dict(far, arn="arn:aws:health:eu-west-2::event/X", region_name="London")
        svc = {"feed": "f", "page": "https://health.aws.amazon.com/health/status"}
        out = sc.read_aws(svc, FakeFetcher({"f": json.dumps([far]).encode("utf-16")}))
        self.assertEqual(out["level"], "ok")
        self.assertIn("UAE", out["notes"][0])
        self.assertEqual(sc.read_aws(svc, FakeFetcher({"f": json.dumps([far, near]).encode("utf-16")}))["level"], "major")

    def test_azure(self):
        empty = b'<rss version="2.0"><channel><title>Azure Status</title></channel></rss>'
        busy = b'<rss version="2.0"><channel><item><title>Storage - UK South</title><description>x</description></item></channel></rss>'
        svc = {"feed": "f", "page": "https://azure.status.microsoft/"}
        self.assertEqual(sc.read_azure(svc, FakeFetcher({"f": empty}))["level"], "ok")
        self.assertEqual(sc.read_azure(svc, FakeFetcher({"f": busy}))["level"], "minor")

    def test_microsoft365(self):
        fine = [{"ServiceDisplayName": "Outlook.com", "Status": "Operational", "Title": "", "Message": ""}]
        bad = [{"ServiceDisplayName": "Outlook.com", "Status": "Service interruption", "Title": "Can't send mail",
                "AuthoredDateTime": "0001-01-01T00:00:00+00:00"}]
        svc = {"feed": "f", "admin": "a", "page": "https://status.cloud.microsoft/"}
        self.assertEqual(sc.read_microsoft365(svc, FakeFetcher({"f": fine, "a": {"Status": "Available"}}))["level"], "ok")
        out = sc.read_microsoft365(svc, FakeFetcher({"f": bad}))
        self.assertEqual(out["level"], "major")
        self.assertEqual(out["items"][0]["started"], "")

    def test_slack(self):
        svc = {"feed": "f", "page": "https://slack-status.com/"}
        self.assertEqual(sc.read_slack(svc, FakeFetcher({"f": {"status": "ok", "active_incidents": []}}))["level"], "ok")
        feed = {"status": "active", "active_incidents": [{"type": "outage", "title": "Can't connect", "notes": [{"body": "b"}]}]}
        self.assertEqual(sc.read_slack(svc, FakeFetcher({"f": feed}))["level"], "major")

    def test_paypal_uses_latest_word_on_each_event(self):
        recent = sc.now_utc().strftime("%a, %d %b %Y %H:%M:%S GMT")
        def rss(*titles):
            items = "".join(f"<item><title>{t}</title><link>https://www.paypal-status.com/e</link><pubDate>{recent}</pubDate></item>"
                            for t in titles)
            return f'<rss version="2.0"><channel>{items}</channel></rss>'.encode()
        svc = {"feed": "f", "page": "https://www.paypal-status.com/"}
        out = sc.read_paypal(svc, FakeFetcher({"f": rss("Investigating: Impact to Checkout (PP-LIVE-1)")}))
        self.assertEqual((out["level"], out["items"][0]["title"]), ("minor", "Impact to Checkout"))
        closed = rss("Resolved: Impact to Checkout (PP-LIVE-1)", "Investigating: Impact to Checkout (PP-LIVE-1)",
                     "Initial Notification: PayPal Live Site Maintenance (PP-LIVE-2)")
        self.assertEqual(sc.read_paypal(svc, FakeFetcher({"f": closed}))["level"], "ok")

    def gov(self, body):
        return {"details": {"body": body}}

    def test_hmrc_overall(self):
        svc = {"feed": "f", "page": "https://www.gov.uk/x"}
        clear = '<h2 id="unplanned-downtime">Unplanned downtime</h2>\n<p>None.</p>'
        down = '<h2 id="unplanned-downtime">Unplanned downtime</h2><h3 id="a">VAT online</h3><p>Unavailable since 9am.</p>'
        self.assertEqual(sc.read_hmrc_overall(svc, FakeFetcher({"f": self.gov(clear)}))["level"], "ok")
        out = sc.read_hmrc_overall(svc, FakeFetcher({"f": self.gov(down)}))
        self.assertEqual((out["level"], out["items"][0]["title"]), ("major", "Unplanned downtime: VAT online"))
        with self.assertRaises(ValueError):
            sc.read_hmrc_overall(svc, FakeFetcher({"f": self.gov("<p>New layout</p>")}))

    def test_hmrc_service(self):
        svc = {"path": "/p"}
        url = "https://www.gov.uk/api/content/p"
        def body(availability, planned="<p>None.</p>", issues="<p>None.</p>"):
            return self.gov(f'<h2 id="service-availability">Service availability</h2>{availability}'
                            f'<h2 id="planned-downtime">Planned downtime</h2>{planned}'
                            f'<h2 id="service-issues">Service issues</h2>{issues}<h2 id="other-services">Other</h2><p>x</p>')
        fine = body("<p>Full service available.</p><p>Sign in to VAT online.</p>", "<p>Saturday 8am to 4pm</p>",
                    '<h3 id="a">Viewing payment history</h3><p>Some users…</p>')
        out = sc.read_hmrc_service(svc, FakeFetcher({url: fine}))
        self.assertEqual(out["level"], "ok")
        self.assertEqual(len(out["notes"]), 2)
        boilerplate = body("<p>If you’re trying to create, sign in or reset your sign in details, check for known problems.</p><p>Sign in to it.</p>")
        self.assertEqual(sc.read_hmrc_service(svc, FakeFetcher({url: boilerplate}))["level"], "ok")
        down = body("<p>The service is currently unavailable.</p>")
        self.assertEqual(sc.read_hmrc_service(svc, FakeFetcher({url: down}))["level"], "major")
        slow = body("<p>Some users may see errors when submitting returns.</p>")
        self.assertEqual(sc.read_hmrc_service(svc, FakeFetcher({url: slow}))["level"], "minor")

    def test_clean_closes_gaps_left_by_tags(self):
        self.assertEqual(sc.clean("the <abbr>Scheme</abbr> (<abbr>CIS</abbr>) service, contact the <a>Helpdesk</a>."),
                         "the Scheme (CIS) service, contact the Helpdesk.")
        self.assertEqual(sc.clean("Apps built on .NET are slow"), "Apps built on .NET are slow")

    def test_hmrc_service_live_issue(self):
        svc = {"path": "/pub/page"}
        url, parent = "https://www.gov.uk/api/content/pub/page", "https://www.gov.uk/api/content/pub"
        page = self.gov('<h2 id="service-availability">Service availability</h2><p>Full service available.</p>'
                        '<h2 id="planned-downtime">Planned downtime</h2><p>None.</p>'
                        '<h2 id="service-issues">Service issues</h2>'
                        '<h3 id="a">Verification delays</h3><p>We are aware of an issue. Our teams are investigating.</p>'
                        '<h3 id="b">Issue 1: telephone verifications</h3><p>We have recently become aware of this. Action to take: call us.</p>'
                        '<h3 id="c">Other issues</h3><p>Contact the helpdesk.</p>'
                        '<h2 id="other-services">Other</h2><p>x</p>')
        def notes(*entries):
            return {"details": {"change_history": [{"public_timestamp": sc.iso(when), "note": text} for when, text in entries]}}
        now = sc.now_utc()
        recent, old = now - dt.timedelta(days=2), now - dt.timedelta(days=300)

        new = notes((old, "A service issue has been added."), (recent, "Service issues have been updated to include delays."),
                    (now, "Planned downtime on Sunday has been added."))
        out = sc.read_hmrc_service(svc, FakeFetcher({url: page, parent: new}))
        self.assertEqual((out["level"], len(out["items"])), ("minor", 1))
        self.assertEqual((out["items"][0]["title"], out["items"][0]["started"]), ("Verification delays", sc.iso(recent)))
        self.assertEqual(out["notes"], ["HMRC lists 1 known issue, starting with “Issue 1: telephone verifications”."])

        # A note that has sat on the page for months is standing advice, not news.
        out = sc.read_hmrc_service(svc, FakeFetcher({url: page, parent: notes((old, "A service issue has been added."))}))
        self.assertEqual((out["level"], out["items"]), ("ok", []))
        self.assertEqual(out["notes"], ["HMRC lists 2 known issues, starting with “Verification delays”."])

        closed = notes((old, "A service issue has been added."), (recent, "The service issue has been resolved."))
        self.assertEqual(sc.read_hmrc_service(svc, FakeFetcher({url: page, parent: closed}))["level"], "ok")
        self.assertEqual(sc.read_hmrc_service(svc, FakeFetcher({url: page, parent: notes()}))["level"], "ok")
        with self.assertRaises(OSError):    # the last good reading is kept rather than guessing
            sc.read_hmrc_service(svc, FakeFetcher({url: page}))

    def test_playstation_and_xbox(self):
        psn = {"countries": [{"countryCode": "GB", "status": []}]}
        svc = {"feed": "f", "page": "https://status.playstation.com/en-gb/"}
        self.assertEqual(sc.read_psn(svc, FakeFetcher({"f": psn}))["level"], "ok")
        psn["countries"][0]["status"] = [{"statusType": "Outage", "startDate": "2026-11-17T09:00:00.000+00:00",
                                          "message": {"messageKey": "tbone.accountManagement.outage", "messages": {"en-GB": "Sign-in trouble."}}}]
        out = sc.read_psn(svc, FakeFetcher({"f": psn}))
        self.assertEqual((out["level"], out["items"][0]["title"]), ("minor", "Account management: outage"))
        fine = b"<ServiceStatus><Status><Overall><State>None</State></Overall></Status><CoreServices><Category><Name>Account</Name><Status><Name>None</Name></Status></Category></CoreServices></ServiceStatus>"
        bad = fine.replace(b"<State>None</State>", b"<State>Limited</State>").replace(b"<Status><Name>None</Name></Status>", b"<Status><Name>Limited</Name></Status>")
        svc = {"feed": "f", "page": "https://support.xbox.com/en-GB/xbox-live-status"}
        self.assertEqual(sc.read_xbox(svc, FakeFetcher({"f": fine}))["level"], "ok")
        out = sc.read_xbox(svc, FakeFetcher({"f": bad}))
        self.assertEqual((out["level"], out["items"][0]["title"]), ("minor", "Affected: Account"))

    def test_meta_combines_two_signals(self):
        orgs = [{"id": "whatsapp-business-api", "name": "WhatsApp Business Platform",
                 "services": [{"name": "Cloud API", "status": "No known issues"}]}]
        svc = {"orgs": ["whatsapp-business-api"], "probe": "https://web.whatsapp.com/", "page": "https://metastatus.com/"}
        url = "https://metastatus.com/data/orgs.json"
        out = sc.read_meta(svc, FakeFetcher({url: orgs}))
        self.assertEqual((out["level"], out["reachable"], out["source"]), ("ok", True, "mixed"))
        orgs[0]["services"][0]["status"] = "Major disruptions"
        self.assertEqual(sc.read_meta(svc, FakeFetcher({url: orgs}))["level"], "major")
        self.assertEqual(sc.read_meta(svc, FakeFetcher({}))["level"], "ok")       # their feed missing, site answering
        with self.assertRaises(Exception):
            sc.read_meta(svc, FakeFetcher({}, up=False))                             # nothing to go on


CONFIG = {
    "providers": {"apple": {"name": "Apple", "self": ["apple"], "words": ["sign in with apple"]}},
    "services": [{"id": "apple", "name": "Apple"}, {"id": "a", "name": "Alpha"}, {"id": "b", "name": "Beta"},
                 {"id": "site", "name": "Site"}],
}


def reading(level="ok", title="", **extra):
    out = sc.result(level, [sc.item(title, "", "https://e.example/")] if title else [])
    out.update(extra)
    return out


class Run(unittest.TestCase):
    def test_probe_needs_two_failures_in_a_row(self):
        fresh = {"apple": reading(), "a": reading(), "b": reading(), "site": dict(reading(source="probe"), reachable=False)}
        services, state, trouble = sc.settle(CONFIG, fresh, {}, NOW)
        self.assertEqual((services["site"]["level"], state["site"]["fails"], trouble), ("ok", 1, False))
        services, state, _ = sc.settle(CONFIG, fresh, {"services": services, "state": state}, NOW)
        self.assertEqual(services["site"]["level"], "minor")
        self.assertIn("can't reach it", services["site"]["items"][0]["title"])
        fresh["site"]["reachable"] = True
        services, state, _ = sc.settle(CONFIG, fresh, {"services": services, "state": state}, NOW)
        self.assertEqual((services["site"]["level"], state["site"]["fails"]), ("ok", 0))

    def test_unreadable_feed_keeps_last_reading_for_a_while(self):
        previous = {}
        fresh = {"apple": reading("minor", "Sign-in trouble"), "a": reading(), "b": reading(), "site": reading()}
        services, state, _ = sc.settle(CONFIG, fresh, previous, NOW)
        previous = {"services": services, "state": state}
        fresh["apple"] = {"error": "timeout"}
        for attempt in range(sc.STALE_RUNS):
            services, state, trouble = sc.settle(CONFIG, fresh, previous, NOW)
            previous = {"services": services, "state": state}
            self.assertEqual((services["apple"]["level"], services["apple"].get("stale"), trouble), ("minor", True, False))
        services, state, _ = sc.settle(CONFIG, fresh, previous, NOW)
        self.assertEqual(services["apple"]["level"], "unknown")

    def test_many_failures_at_once_is_our_fault(self):
        fresh = {sid: {"error": "network"} for sid in ("apple", "a", "b")}
        fresh["site"] = reading()
        _, _, trouble = sc.settle(CONFIG, fresh, {}, NOW)
        self.assertTrue(trouble)

    def test_joins_the_dots(self):
        services = {"apple": dict(reading("major", "iCloud sign in: issue"), name="Apple"),
                    "a": dict(reading("minor", "Sign in with Apple is failing"), name="Alpha"),
                    "b": dict(reading("minor", "Sign in with Apple unavailable"), name="Beta"),
                    "site": dict(reading(), name="Site")}
        links = sc.find_links(CONFIG, services)
        self.assertEqual(links[0]["services"], ["a", "b"])
        self.assertEqual(services["a"]["link"], "Apple")
        self.assertNotIn("link", services["apple"])
        banners = sc.build_banners(CONFIG, services, links)
        self.assertIn("Alpha and Beta all say their problem involves Apple", banners[0]["text"])
        self.assertIn("Apple is reporting problems of its own", banners[0]["text"])

    def test_history_opens_and_closes_spells(self):
        history = {}
        bad = {"a": dict(reading("minor", "Slow"), name="Alpha"), "b": dict(reading(), name="Beta")}
        sc.update_history(history, bad, {"services": {"a": {}}}, NOW)
        self.assertEqual((len(history["episodes"]), history["episodes"][0]["ended"]), (1, ""))
        later = NOW + dt.timedelta(minutes=45)
        worse = {"a": dict(reading("major", "Down"), name="Alpha"), "b": dict(reading("unknown"), name="Beta")}
        sc.update_history(history, worse, {"services": bad}, later)
        self.assertEqual((len(history["episodes"]), history["episodes"][0]["level"]), (1, "major"))
        recent, _ = sc.summarise_history(history, worse, later)
        self.assertEqual(worse["a"]["since"], sc.iso(NOW))
        end = NOW + dt.timedelta(minutes=90)
        fine = {"a": dict(reading(), name="Alpha"), "b": dict(reading(), name="Beta")}
        sc.update_history(history, fine, {"services": worse}, end)
        self.assertEqual(history["episodes"][0]["ended"], sc.iso(end))
        recent, stats = sc.summarise_history(history, fine, end)
        self.assertEqual((recent[0]["svc"], stats["a"]), ("a", {"n30": 1, "m30": 90, "n90": 1, "m90": 90}))
        self.assertNotIn("since", fine["a"])

    def test_history_uses_their_start_time_when_recent(self):
        history = {}
        entry = dict(sc.result("minor", [sc.item("Slow", "", "", "2026-11-17T10:30:00Z")]), name="Alpha")
        sc.update_history(history, {"a": entry}, {"services": {"a": {}}}, NOW)
        self.assertEqual(history["episodes"][0]["started"], "2026-11-17T10:30:00Z")


class Page(unittest.TestCase):
    def test_config_and_page_agree(self):
        self.assertEqual(sc.render(check=True), 0)

    def test_every_service_has_what_its_reader_needs(self):
        needs = {"statuspage": ["base"], "probe": ["probe"], "meta": ["probe", "orgs"], "hmrc_service": ["path"],
                 "microsoft365": ["feed", "admin", "page"]}
        for svc in sc.load_config()["services"]:
            for key in needs.get(svc["kind"], ["feed", "page"]) + ["about", "name"]:
                self.assertTrue(svc.get(key), f"{svc['id']} is missing {key}")
            for key in ("base", "feed", "page", "probe", "admin"):
                self.assertTrue(svc.get(key, "https://").startswith("https://"), f"{svc['id']} {key} must be https")


if __name__ == "__main__":
    unittest.main()
