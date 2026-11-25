#!/usr/bin/env python3
"""Service status checker behind status.html. Standard library only.

    python scripts/status_check.py run --data DIR   read every feed, write DIR/status.json and DIR/history.json
    python scripts/status_check.py render           rebuild the service cards inside status.html
    python scripts/status_check.py render --check   fail if status.html is out of step with status/services.json

The list of services, and how each one is read, lives in status/services.json.
The scheduled job in .github/workflows/status-check.yml runs "run" and stores the
two data files on the status-data branch, which the page reads directly.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import html
import json
import re
import sys
import threading
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "status" / "services.json"
PAGE = ROOT / "status.html"

USER_AGENT = "Mozilla/5.0 (compatible; status-check/1.0)"
TIMEOUT = 15
MAX_BYTES = 6_000_000
RANK = {"ok": 0, "minor": 1, "major": 2}
STALE_RUNS = 4          # keep the last good reading this many runs when a feed can't be read
PROBE_FAILS = 2         # our own reachability test must fail this many runs in a row
TROUBLE_SHARE = 0.4     # if this share of feeds fail at once, assume the fault is ours
KEEP_DAYS = 400
RECENT_DAYS = 14
MAX_ITEMS = 4


# ---------------------------------------------------------------- helpers

def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def iso(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(value) -> dt.datetime | None:
    """Best-effort parse of the timestamp styles the feeds use."""
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)) or (isinstance(value, str) and value.strip().isdigit()):
        number = float(value)
        if number > 1e11:
            number /= 1000
        try:
            return dt.datetime.fromtimestamp(number, dt.timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    text = str(value).strip()
    try:
        cleaned = re.sub(r"(\.\d{6})\d+", r"\1", text.replace("Z", "+00:00"))
        parsed = dt.datetime.fromisoformat(cleaned)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
    except ValueError:
        pass
    for pattern in ("%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S %z", "%m/%d/%Y %H:%M %Z"):
        try:
            parsed = dt.datetime.strptime(text.replace(" Z", " UTC"), pattern)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
        except ValueError:
            continue
    return None


def clean(text, limit: int = 240) -> str:
    """Plain text from a provider's HTML or Markdown, shortened."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", str(text))
    text = html.unescape(text)
    text = re.sub(r"\*\*|__|^#+\s*", "", text, flags=re.M)
    text = re.sub(r"\s+", " ", text).strip()
    # Taking tags out leaves gaps such as "Scheme ( CIS ) service ."
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+([,;)])", r"\1", text)
    text = re.sub(r"\s+\.(?=\s|$)", ".", text)
    if len(text) > limit:
        text = text[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:. ") + "…"
    return text


def worst(levels) -> str:
    return max(levels, key=lambda level: RANK.get(level, 0), default="ok")


def join_names(names: list[str], limit: int = 5) -> str:
    names = list(dict.fromkeys(names))
    extra = len(names) - limit
    shown = names[:limit]
    if extra > 0:
        return ", ".join(shown) + f" and {extra} more"
    if len(shown) > 1:
        return ", ".join(shown[:-1]) + " and " + shown[-1]
    return shown[0] if shown else ""


def item(title, detail="", url="", started=None) -> dict:
    when = parse_time(started)
    return {
        "title": clean(title, 160),
        "detail": clean(detail, 240),
        "url": url or "",
        "started": iso(when) if when else "",
    }


def result(level="ok", items=None, notes=None, source="official") -> dict:
    unique, seen = [], set()
    for entry in items or []:
        key = (entry["title"], entry["detail"])
        if key not in seen:
            seen.add(key)
            unique.append(entry)
    return {"level": level, "items": unique[:MAX_ITEMS], "notes": (notes or [])[:3], "source": source}


class Fetcher:
    """Fetches each URL once per run, however many services share it."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: dict[str, dict] = {}

    def get(self, url: str) -> bytes:
        with self._lock:
            entry = self._entries.setdefault(url, {"lock": threading.Lock()})
        with entry["lock"]:
            if "data" in entry:
                return entry["data"]
            if "error" in entry:
                raise entry["error"]
            try:
                entry["data"] = self._download(url)
            except Exception as exc:  # noqa: BLE001 - recorded per service
                entry["error"] = exc
                raise
            return entry["data"]

    def get_json(self, url: str):
        return json.loads(self.get(url).decode("utf-8-sig"))

    @staticmethod
    def _open(url: str):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
        return urllib.request.urlopen(request, timeout=TIMEOUT)  # noqa: S310 - fixed https URLs from config

    def _download(self, url: str) -> bytes:
        last: Exception | None = None
        for _ in range(2):
            try:
                with self._open(url) as response:
                    return response.read(MAX_BYTES)
            except Exception as exc:  # noqa: BLE001
                last = exc
        raise last  # type: ignore[misc]

    def reachable(self, url: str) -> bool:
        """True when the site answers at all. A refusal still proves it is up."""
        for _ in range(2):
            try:
                with self._open(url) as response:
                    response.read(1)
                    return True
            except urllib.error.HTTPError as exc:
                if exc.code < 500:
                    return True
            except Exception:  # noqa: BLE001
                pass
        return False


# ---------------------------------------------------------------- readers

def read_statuspage(svc: dict, fetch: Fetcher) -> dict:
    base = svc["base"].rstrip("/")
    data = fetch.get_json(base + "/api/v2/summary.json")
    ignore = re.compile(svc["ignore"]) if svc.get("ignore") else None
    floor = RANK[svc.get("min_impact", "minor")]
    impact_level = {"none": "ok", "maintenance": "ok", "minor": "minor", "major": "major", "critical": "major"}

    items, notes, quiet, critical = [], [], 0, False
    for incident in data.get("incidents") or []:
        if incident.get("status") in ("resolved", "postmortem", "completed"):
            continue
        name = incident.get("name") or ""
        if ignore and ignore.search(name):
            continue
        level = impact_level.get(incident.get("impact") or "minor", "minor")
        if RANK[level] < max(floor, 1):
            quiet += 1
            continue
        critical = critical or incident.get("impact") == "critical"
        updates = incident.get("incident_updates") or [{}]
        entry = item(name, updates[0].get("body"), incident.get("shortlink") or base,
                     incident.get("started_at") or incident.get("created_at"))
        entry["level"] = level
        items.append(entry)

    indicator = (data.get("status") or {}).get("indicator") or "none"
    if svc.get("use_indicator", True):
        level = impact_level.get(indicator, "minor")
        if level == "ok" and items:
            level = "minor"
        if critical:
            level = "major"
        if RANK[level] < floor:
            level = "ok"
        if level != "ok" and not items:
            down = [c.get("name", "") for c in data.get("components") or []
                    if c.get("status") not in (None, "operational", "under_maintenance") and not c.get("group")]
            title = "Affected: " + join_names(down) if down else (data.get("status") or {}).get("description", "")
            items.append(item(title, "", base))
    else:
        level = worst(entry["level"] for entry in items)

    for entry in items:
        entry.pop("level", None)
    if quiet:
        notes.append(f"{quiet} smaller notice{'s' if quiet != 1 else ''} on their status page that should not affect most people.")
    for work in data.get("scheduled_maintenances") or []:
        if indicator != "maintenance" or not svc.get("use_indicator", True):
            break       # only mention maintenance when it is their own headline
        if work.get("status") in ("in_progress", "verifying") and not (ignore and ignore.search(work.get("name") or "")):
            notes.append("Planned maintenance under way: " + clean(work.get("name"), 120))
            break
    return result(level, items, notes)


def read_apple(svc: dict, fetch: Fetcher) -> dict:
    raw = fetch.get(svc["feed"]).decode("utf-8-sig").strip()
    match = re.match(r"^[\w$.]+\((.*)\);?$", raw, re.S)
    data = json.loads(match.group(1) if match else raw)
    core = re.compile(r"icloud|imessage|facetime|app store|apple pay|apple account|sign in with apple|apple music|"
                      r"maps|find my|wallet|photos|siri|device activation|apple tv", re.I)
    events: dict[str, dict] = {}
    for service in data.get("services") or []:
        for event in service.get("events") or []:
            if event.get("eventStatus") != "ongoing" or event.get("endDate"):
                continue
            key = str(event.get("messageId"))
            entry = events.setdefault(key, {"names": [], "event": event})
            entry["names"].append(service.get("serviceName", ""))
            entry["names"].extend(event.get("affectedServices") or [])
    items, notes, levels = [], [], []
    for entry in events.values():
        event, names = entry["event"], list(dict.fromkeys(entry["names"]))
        kind = event.get("statusType") or "Issue"
        if kind == "Maintenance":
            notes.append("Planned maintenance: " + join_names(names, 3))
            continue
        everyone = str(event.get("usersAffected") or "").lower().startswith("all")
        level = "major" if everyone and any(core.search(name) for name in names) else "minor"
        levels.append(level)
        title = f"{join_names(names, 4)}: {kind.lower()}"
        detail = " ".join(str(part).strip().rstrip(".") + "." for part in (event.get("message"), event.get("usersAffected")) if part)
        entry = item(title, detail, svc.get("page"), event.get("epochStartDate"))
        items.append((0 if level == "major" else 1 if any(core.search(name) for name in names) else 2, entry))
    items = [entry for _, entry in sorted(items, key=lambda pair: pair[0])]
    extra = len({(entry["title"], entry["detail"]) for entry in items}) - MAX_ITEMS
    if extra > 0:
        notes.append(f"{extra} more notice{'s' if extra != 1 else ''} on Apple's status page.")
    return result(worst(levels), items, notes)


def read_google(svc: dict, fetch: Fetcher) -> dict:
    data = fetch.get_json(svc["feed"])
    floor = RANK[svc.get("min_impact", "minor")]
    impact_level = {"SERVICE_OUTAGE": "major", "SERVICE_DISRUPTION": "minor", "SERVICE_INFORMATION": "ok"}
    items, levels, quiet = [], [], 0
    for incident in data:
        if incident.get("end"):
            continue
        level = impact_level.get(incident.get("status_impact"), "minor")
        if RANK[level] < max(floor, 1):
            quiet += 1
            continue
        levels.append(level)
        summary = re.sub(r"^\W*Summary:?\W*", "", clean(incident.get("external_desc"), 400))
        summary = re.split(r"\s+Description:", summary)[0]
        places = [place.get("title", "") for place in incident.get("currently_affected_locations") or []]
        detail = ("Affected locations: " + join_names(places, 4)) if places else ""
        title = f"{incident.get('service_name') or 'Service'}: {summary}"
        items.append(item(title, detail, svc["page"].rstrip("/") + "/" + (incident.get("uri") or ""), incident.get("begin")))
    notes = [f"{quiet} smaller notice{'s' if quiet != 1 else ''} on their status page."] if quiet else []
    return result(worst(levels), items, notes)


def read_aws(svc: dict, fetch: Fetcher) -> dict:
    raw = fetch.get(svc["feed"])
    try:
        data = json.loads(raw.decode("utf-16"))
    except (UnicodeError, ValueError):
        data = json.loads(raw.decode("utf-8-sig"))
    near = ("us-east-1", "eu-west-1", "eu-west-2", "global", "")
    items, levels, elsewhere = [], [], []
    for event in data:
        parts = str(event.get("arn") or "").split(":")
        region = parts[3] if len(parts) > 3 else ""
        severity = str(event.get("status") or "1")
        if region not in near:
            elsewhere.append(event.get("region_name") or region)
            continue
        if severity == "1":
            continue
        levels.append("major" if severity == "3" else "minor")
        log = event.get("event_log") or [{}]
        title = f"{event.get('service_name') or 'AWS'} ({event.get('region_name') or 'global'}): {event.get('summary') or 'service event'}"
        items.append(item(title, log[-1].get("message"), svc["page"], event.get("date")))
    notes = []
    if elsewhere:
        notes.append(f"Problems reported in other regions ({join_names(elsewhere, 4)}), which are unlikely to affect UK users.")
    return result(worst(levels), items, notes)


def read_azure(svc: dict, fetch: Fetcher) -> dict:
    root = ET.fromstring(fetch.get(svc["feed"]))
    items = [item(entry.findtext("title"), entry.findtext("description"), entry.findtext("link") or svc["page"],
                  entry.findtext("pubDate")) for entry in root.iter("item")]
    return result("minor" if items else "ok", items)


def read_microsoft365(svc: dict, fetch: Fetcher) -> dict:
    core = re.compile(r"outlook|onedrive|microsoft 365|teams|office", re.I)
    items, levels = [], []
    for workload in fetch.get_json(svc["feed"]):
        status = str(workload.get("Status") or "")
        if status.lower() in ("operational", "available", ""):
            continue
        name = workload.get("ServiceDisplayName") or "Microsoft 365"
        severe = re.search(r"interruption|outage|unavailable|down", status, re.I) and core.search(name)
        levels.append("major" if severe else "minor")
        items.append(item(f"{name}: {status}", workload.get("Title") or workload.get("Message"), svc["page"],
                          workload.get("AuthoredDateTime") if str(workload.get("AuthoredDateTime", "")) > "2000" else None))
    try:
        admin = fetch.get_json(svc["admin"])
        if str(admin.get("Status") or "Available").lower() != "available":
            levels.append("minor")
            items.insert(0, item("Microsoft 365 for business: " + str(admin.get("Status")),
                                 admin.get("Title") or admin.get("Message"), svc["page"]))
    except Exception:  # noqa: BLE001 - the consumer feed is the main signal
        pass
    return result(worst(levels), items)


def read_slack(svc: dict, fetch: Fetcher) -> dict:
    data = fetch.get_json(svc["feed"])
    items, levels, notes = [], [], []
    for incident in data.get("active_incidents") or []:
        kind = incident.get("type") or "incident"
        if kind in ("notice", "maintenance"):
            notes.append(clean(incident.get("title"), 140))
            continue
        levels.append("major" if kind == "outage" else "minor")
        updates = incident.get("notes") or [{}]
        items.append(item(incident.get("title"), updates[0].get("body"), incident.get("url") or svc["page"],
                          incident.get("date_created")))
    return result(worst(levels), items, notes)


def read_paypal(svc: dict, fetch: Fetcher) -> dict:
    root = ET.fromstring(fetch.get(svc["feed"]))
    content_tag = "{http://purl.org/rss/1.0/modules/content/}encoded"
    seen: set[str] = set()
    items = []
    cutoff = now_utc() - dt.timedelta(days=3)
    for entry in root.iter("item"):
        title = entry.findtext("title") or ""
        code = re.search(r"\(([A-Z]+-[A-Z]+-\d+)", title)
        key = code.group(1) if code else title
        if key in seen:
            continue
        seen.add(key)      # the feed is newest first, so this is the event's latest word
        state = title.split(":")[0].lower()
        when = parse_time(entry.findtext("pubDate"))
        finished = re.search(r"resolved|completed|postponed|rescheduled|cancel", state)
        if finished or "maintenance" in title.lower() or not when or when < cutoff:
            continue
        name = re.sub(r"\s*\([A-Z]+-[A-Z]+-\d+\)?\s*$", "", title.split(":", 1)[-1]).strip()
        items.append(item(name, entry.findtext(content_tag), entry.findtext("link") or svc["page"], when.timestamp()))
    return result("minor" if items else "ok", items)


def _gov_body(data: dict) -> str:
    body = (data.get("details") or {}).get("body") or ""
    if isinstance(body, list):
        body = next((part.get("content", "") for part in body if part.get("content_type") == "text/html"), "")
    return body


def _gov_sections(body: str) -> dict[str, str]:
    parts = re.split(r'<h2[^>]*\bid="([^"]+)"[^>]*>.*?</h2>', body, flags=re.S)
    return {parts[index]: parts[index + 1] for index in range(1, len(parts) - 1, 2)}


def _is_none(text: str) -> bool:
    return clean(text, 400).strip(" .").lower() in ("none", "")


def read_hmrc_overall(svc: dict, fetch: Fetcher) -> dict:
    sections = _gov_sections(_gov_body(fetch.get_json(svc["feed"])))
    if "unplanned-downtime" not in sections:
        raise ValueError("HMRC page layout changed: no unplanned downtime section")
    downtime = sections["unplanned-downtime"]
    if _is_none(downtime):
        return result("ok")
    names = [clean(name, 80) for name in re.findall(r"<h3[^>]*>(.*?)</h3>", downtime, re.S)]
    title = "Unplanned downtime: " + join_names(names, 4) if names else "Unplanned downtime reported"
    return result("major", [item(title, downtime, svc["page"])])


# How HMRC words a fault it is working on, as opposed to standing advice about a service.
HMRC_LIVE = re.compile(r"\bwe(?: are|’re|'re)(?: currently)? aware (?:of|that)\b|\bunder investigation\b|\b(?:are|is) investigating\b", re.I)
HMRC_LIVE_DAYS = 30


def _hmrc_issue_news(svc: dict, fetch: Fetcher) -> tuple[dt.datetime | None, bool]:
    """When HMRC last said it changed this page's service issues, and whether that was to close one."""
    parent = svc["path"].rsplit("/", 1)[0]
    details = fetch.get_json("https://www.gov.uk/api/content" + parent).get("details") or {}
    news = [(parse_time(note.get("public_timestamp")), note.get("note") or "") for note in details.get("change_history") or []]
    news = sorted((when, text) for when, text in news if when and re.search(r"\bissues?\b", text, re.I))
    if not news:
        return None, False
    when, text = news[-1]
    return when, bool(re.search(r"\b(resolved|removed|fixed)\b", text, re.I))


def read_hmrc_service(svc: dict, fetch: Fetcher) -> dict:
    page = "https://www.gov.uk" + svc["path"]
    sections = _gov_sections(_gov_body(fetch.get_json("https://www.gov.uk/api/content" + svc["path"])))
    if "service-availability" not in sections:
        raise ValueError("HMRC page layout changed: no service availability section")
    # HMRC pads this section with standing sign-in advice; the statement is whatever else is there.
    statements = [clean(text, 240) for text in re.findall(r"<p>(.*?)</p>", sections["service-availability"], re.S)]
    statements = [text for text in statements
                  if text and not re.match(r"(if you.re trying to create, sign in|sign in to|sign in or)", text, re.I)]
    fine = not statements or any(text.lower().startswith("full service available") for text in statements)
    availability = statements[0] if statements else ""
    items, notes, level = [], [], "ok"
    if not fine:
        level = "major" if re.search(r"unavailable|not available|no service", availability, re.I) else "minor"
        items.append(item(availability, "", page))
    planned = sections.get("planned-downtime", "")
    if not _is_none(planned):
        windows = [clean(text, 90) for text in re.findall(r'<div class="call-to-action">\s*<p>(.*?)</p>', planned, re.S)]
        text = "; ".join(windows[:2]) if windows else clean(planned, 120)
        notes.append("Planned downtime: " + text + ("" if text.endswith(("…", ".")) else "."))
    issues = sections.get("service-issues", "")
    if not _is_none(issues):
        parts = re.split(r"<h3[^>]*>(.*?)</h3>", issues, flags=re.S)
        entries = [(clean(parts[index], 160), clean(parts[index + 1], 4000)) for index in range(1, len(parts) - 1, 2)]
        entries = [(name, text) for name, text in entries if name and name.lower() != "other issues"]
        live = [(name, text) for name, text in entries if HMRC_LIVE.search(text)]
        if live:
            # HMRC leaves some "under investigation" notes up for years, so its own change notes decide what is new.
            when, closed = _hmrc_issue_news(svc, fetch)
            if when and not closed and now_utc() - when <= dt.timedelta(days=HMRC_LIVE_DAYS):
                level = worst([level, "minor"])
                items += [item(name, text, page, iso(when)) for name, text in live]
            else:
                live = []
        shown = {name for name, _ in live}
        names = [clean(name, 70) for name, _ in entries if name not in shown]
        if names:
            notes.append(f"HMRC lists {len(names)} known issue{'s' if len(names) != 1 else ''}, starting with “{names[0]}”.")
    return result(level, items, notes)


def read_hund(svc: dict, fetch: Fetcher) -> dict:
    """A status page hosted by Hund, which offers no feed, so the page itself is read."""
    base = svc["base"].rstrip("/")
    page = fetch.get(base + "/").decode("utf-8", "replace")
    if not re.search(r"<aside class='[a-z]+ state-bar'", page):
        raise ValueError("Hund page layout changed: no state bar")
    ignore = re.compile(svc["ignore"]) if svc.get("ignore") else None
    severity = {"outage": "major", "degraded": "minor"}
    states = {clean(name, 120): state for name, state in re.findall(
        r"<span class='name'><a href=\"[^\"]+\">([^<]+)</a></span>[\s\S]*?<span class='([a-z]+) state icon'", page)}
    began = dict(re.findall(r"<span class='title'><a href=\"(/issues/\w+)\">[^<]*</a></span>\s*<time datetime='([^']+)'", page))

    items, levels, notes = [], [], []
    notices = page.split("<section class='groups", 1)[0].split("<div class='issue-notice--wrapper'>")[1:]
    for block in notices:
        head = re.search(r"issue-notice--header ([^']*)'>\s*<div class='issue-notice--header__title'><a href=\"([^\"]+)\">(.*?)</a>", block, re.S)
        if not head:
            continue
        kinds, link, title = head.group(1), head.group(2), clean(head.group(3), 160)
        label = re.search(r"issue-notice--header__label'>(.*?)</div>", block, re.S)
        kinds += " " + (clean(label.group(1), 40) if label else "")
        if re.search(r"resolved|completed|closed", kinds, re.I):
            continue
        affected = [clean(name, 120) for name in re.findall(r"<li>.*?<a href=\"/components/[^\"]+\">(.*?)</a></li>", block, re.S)]
        mine = [name for name in affected if not (ignore and ignore.search(name))]
        if affected and not mine:
            continue        # only places this service's UK users never touch
        if re.search(r"maintenance|scheduled|informational", kinds, re.I):
            notes.append(clean(title, 140))
            continue
        body = re.search(r"issue-notice--content__body'>(.*?)</div>", block, re.S)
        lines = [clean(text, 400) for text in re.findall(r"<p>(.*?)</p>", body.group(1) if body else "", re.S)]
        lines = [text for text in lines if text and not re.match(r"(dear|hi|hello)\b.{0,30}$", text, re.I)]
        updated = re.search(r"issue-notice--content__date'><time datetime='([^']+)'", block)
        items.append(item(title, " ".join(lines), base + link, began.get(link) or (updated.group(1) if updated else None)))
        levels.append(worst([severity.get(states.get(name, ""), "minor") for name in mine] or ["minor"]))
    if not items:
        down = [(name, state) for name, state in states.items()
                if state in severity and not (ignore and ignore.search(name))]
        if down:
            items.append(item("Affected: " + join_names([name for name, _ in down]), "", base + "/"))
            levels.append(worst([severity[state] for _, state in down]))
    return result(worst(levels), items, notes)


def read_psn(svc: dict, fetch: Fetcher) -> dict:
    data = fetch.get_json(svc["feed"])
    uk = next((country for country in data.get("countries") or [] if country.get("countryCode") == "GB"), None)
    if uk is None:
        raise ValueError("PlayStation feed has no UK entry")
    items = []
    for status in uk.get("status") or []:
        message = status.get("message") or {}
        key = str(message.get("messageKey") or "")
        part = key.split(".")[1] if key.count(".") >= 2 else "PlayStation Network"
        name = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", part).strip().capitalize()
        text = (message.get("messages") or {}).get("en-GB") or ""
        items.append(item(f"{name}: {str(status.get('statusType') or 'issue').lower()}", text, svc["page"], status.get("startDate")))
    level = "ok" if not items else ("major" if len(items) >= 3 else "minor")
    return result(level, items)


def read_xbox(svc: dict, fetch: Fetcher) -> dict:
    root = ET.fromstring(fetch.get(svc["feed"]))
    state = (root.findtext("./Status/Overall/State") or "None").strip().lower()
    names = [category.findtext("Name") or "" for category in root.iter("Category")
             if (category.findtext("./Status/Name") or "None").strip().lower() != "none"]
    if state == "none" and not names:
        return result("ok")
    level = "major" if "major" in state else "minor"
    return result(level, [item("Affected: " + join_names(names) if names else "Service problems reported", "", svc["page"])])


def _meta_official(svc: dict, fetch: Fetcher) -> tuple[str, list[dict]]:
    data = fetch.get_json("https://metastatus.com/data/orgs.json")
    wanted = set(svc.get("orgs") or [])
    found = [org for org in data if org.get("id") in wanted]
    if not found:
        raise ValueError("Meta status feed no longer lists " + ", ".join(sorted(wanted)))
    items, levels = [], []
    for org in found:
        bad = [s for s in org.get("services") or [] if str(s.get("status") or "").lower() != "no known issues"]
        if not bad:
            continue
        states = {str(s.get("status")) for s in bad}
        levels.append("major" if any("major" in state.lower() for state in states) else "minor")
        items.append(item(f"{org.get('name')}: {join_names(sorted(states), 2).lower()}",
                          "Affected: " + join_names([s.get("name", "") for s in bad]), svc.get("page")))
    return worst(levels), items


def read_meta(svc: dict, fetch: Fetcher) -> dict:
    """Meta publishes no status for the everyday apps, so combine two signals."""
    reachable = fetch.reachable(svc["probe"])
    try:
        level, items = _meta_official(svc, fetch)
    except Exception:  # noqa: BLE001 - the reachability test still stands
        if not reachable:
            raise
        level, items = "ok", []
    out = result(level, items, source="mixed")
    out["reachable"] = reachable
    return out


def read_probe(svc: dict, fetch: Fetcher) -> dict:
    out = result("ok", source="probe")
    out["reachable"] = fetch.reachable(svc["probe"])
    return out


READERS = {
    "statuspage": read_statuspage,
    "apple": read_apple,
    "google": read_google,
    "aws": read_aws,
    "azure": read_azure,
    "microsoft365": read_microsoft365,
    "slack": read_slack,
    "paypal": read_paypal,
    "hmrc_overall": read_hmrc_overall,
    "hmrc_service": read_hmrc_service,
    "hund": read_hund,
    "psn": read_psn,
    "xbox": read_xbox,
    "meta": read_meta,
    "probe": read_probe,
}


# ---------------------------------------------------------------- one run

def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8"))


def read_all(config: dict, fetch: Fetcher) -> dict[str, dict]:
    def one(svc: dict) -> tuple[str, dict]:
        try:
            return svc["id"], READERS[svc["kind"]](svc, fetch)
        except Exception as exc:  # noqa: BLE001 - one broken feed must not stop the rest
            return svc["id"], {"error": f"{type(exc).__name__}: {exc}"[:200]}

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        return dict(pool.map(one, config["services"]))


def settle(config: dict, fresh: dict[str, dict], previous: dict, now: dt.datetime) -> tuple[dict, dict, bool]:
    """Fold this run's readings into the last ones: tolerate blips, count probe failures."""
    old_services = previous.get("services") or {}
    old_state = previous.get("state") or {}
    failed = sum(1 for reading in fresh.values() if "error" in reading)
    trouble = bool(fresh) and failed / len(fresh) >= TROUBLE_SHARE
    services, state = {}, {}

    for svc in config["services"]:
        sid = svc["id"]
        reading = fresh.get(sid) or {"error": "not checked"}
        before = old_services.get(sid)
        memory = dict(old_state.get(sid) or {})

        if "error" in reading:
            memory["errors"] = memory.get("errors", 0) + 1
            memory["last_error"] = reading["error"]
            if before and before.get("level") != "unknown" and (trouble or memory["errors"] <= STALE_RUNS):
                entry = dict(before, stale=True)
            else:
                entry = {"level": "unknown", "items": [], "notes": [], "source": "official"}
        else:
            memory.pop("errors", None)
            memory.pop("last_error", None)
            entry = {key: reading[key] for key in ("level", "items", "notes", "source")}
            if "reachable" in reading:
                memory["fails"] = 0 if reading["reachable"] else memory.get("fails", 0) + 1
                if memory["fails"] >= PROBE_FAILS:
                    entry["level"] = worst([entry["level"], "minor"])
                    entry["items"] = [item("Our checks can't reach it, so it may be down",
                                           "This is our own test, not an official statement.", "")] + entry["items"]
                    entry["items"] = entry["items"][:MAX_ITEMS]
        entry["name"] = svc["name"]
        services[sid] = entry
        state[sid] = memory
    return services, state, trouble


def find_links(config: dict, services: dict) -> list[dict]:
    """Spot services blaming the same outside provider, e.g. three apps all citing Apple sign-in."""
    links = []
    for key, provider in config.get("providers", {}).items():
        pattern = re.compile(r"\b(" + "|".join(re.escape(word) for word in provider["words"]) + r")\b", re.I)
        own = set(provider.get("self") or [])
        hits = []
        for sid, entry in services.items():
            if sid in own or entry.get("level") in ("ok", "unknown"):
                continue
            text = " ".join(f"{i.get('title', '')} {i.get('detail', '')}" for i in entry.get("items") or [])
            if pattern.search(text):
                hits.append(sid)
                entry["link"] = provider["name"]
        if hits:
            links.append({"provider": key, "name": provider["name"], "services": hits,
                          "own": [sid for sid in provider.get("self") or [] if services.get(sid, {}).get("level") in ("minor", "major")]})
    return links


def build_banners(config: dict, services: dict, links: list[dict]) -> list[dict]:
    banners = []
    for sid in ("cloudflare", "aws", "azure", "google-cloud"):
        if services.get(sid, {}).get("level") == "major":
            banners.append({"kind": "plumbing", "svc": sid, "text":
                            f"{services[sid]['name']} is reporting major problems. A great many unrelated websites and apps "
                            "run on it, so other things may be slow or failing too. It is very unlikely to be your wifi."})
    for link in links:
        if len(link["services"]) < 2:
            continue
        names = join_names([services[sid]["name"] for sid in link["services"]], 4)
        own = link["own"]
        confirmed = (f" {link['name']} is reporting problems of its own." if own
                     else f" {link['name']}'s own status page may not show it yet.")
        banners.append({"kind": "link", "svc": own[0] if own else link["services"][0], "text":
                        f"{names} all say their problem involves {link['name']}. That points to {link['name']}, "
                        f"not to them or to you.{confirmed}"})
    meta_down = [sid for sid in ("facebook", "instagram", "whatsapp", "messenger")
                 if services.get(sid, {}).get("level") in ("minor", "major")]
    if len(meta_down) >= 2:
        banners.append({"kind": "meta", "svc": meta_down[0], "text":
                        join_names([services[sid]["name"] for sid in meta_down]) + " are owned by the same company "
                        "and share the same systems, so they tend to fail together."})
    troubled = sum(1 for entry in services.values() if entry.get("level") in ("minor", "major"))
    if troubled >= 12 and not banners:
        banners.append({"kind": "mass", "svc": "", "text":
                        f"{troubled} services are reporting problems at once. When that happens the cause is usually "
                        "one shared provider behind them rather than each service separately."})
    return banners


def update_history(history: dict, services: dict, previous: dict, now: dt.datetime) -> None:
    """Record each spell of trouble: when we first saw it and when it cleared."""
    episodes = history.setdefault("episodes", [])
    open_by_service = {episode["svc"]: episode for episode in episodes if not episode.get("ended")}
    seen_before = previous.get("services") or {}
    for sid, entry in services.items():
        level = entry.get("level")
        if level == "unknown" or entry.get("stale"):
            continue
        current = open_by_service.get(sid)
        if level in ("minor", "major"):
            title = (entry.get("items") or [{}])[0].get("title", "")
            if current is None:
                started = now
                reported = parse_time((entry.get("items") or [{}])[0].get("started"))
                # A service we have never read before (the first run, or one just added) is dated by its own notice.
                if reported and (sid not in seen_before or now - reported < dt.timedelta(hours=24)) and reported < now:
                    started = reported
                episodes.append({"svc": sid, "level": level, "title": title, "started": iso(started), "ended": ""})
            else:
                current["level"] = worst([current["level"], level])
                current["title"] = current.get("title") or title
        elif current is not None:
            current["ended"] = iso(now)
    cutoff = iso(now - dt.timedelta(days=KEEP_DAYS))
    history["episodes"] = [episode for episode in episodes if not episode.get("ended") or episode["ended"] >= cutoff]


def summarise_history(history: dict, services: dict, now: dt.datetime) -> tuple[list[dict], dict]:
    recent_from = now - dt.timedelta(days=RECENT_DAYS)
    recent, stats = [], {}
    for episode in history.get("episodes", []):
        if episode["svc"] not in services:
            continue
        start = parse_time(episode["started"]) or now
        end = parse_time(episode.get("ended")) or now
        if end >= recent_from:
            recent.append({key: episode.get(key, "") for key in ("svc", "level", "title", "started", "ended")})
        for days in (30, 90):
            window = now - dt.timedelta(days=days)
            if end <= window:
                continue
            minutes = int((end - max(start, window)).total_seconds() // 60)
            entry = stats.setdefault(episode["svc"], {"n30": 0, "m30": 0, "n90": 0, "m90": 0})
            entry[f"n{days}"] += 1
            entry[f"m{days}"] += max(minutes, 0)
    recent.sort(key=lambda episode: episode["started"], reverse=True)
    for sid, entry in services.items():
        open_episode = next((e for e in recent if e["svc"] == sid and not e["ended"]), None)
        if open_episode and entry.get("level") in ("minor", "major"):
            entry["since"] = open_episode["started"]
    return recent[:60], stats


def run(data_dir: Path, only: set[str] | None = None) -> int:
    config = load_config()
    if only:
        config["services"] = [svc for svc in config["services"] if svc["id"] in only]
    data_dir.mkdir(parents=True, exist_ok=True)
    status_path, history_path = data_dir / "status.json", data_dir / "history.json"
    previous = json.loads(status_path.read_text(encoding="utf-8")) if status_path.exists() else {}
    history = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else {}

    now = now_utc()
    fresh = read_all(config, Fetcher())
    services, state, trouble = settle(config, fresh, previous, now)
    history.setdefault("tracking_since", iso(now))

    if trouble:
        # Too many feeds failed together: that is our connection, not the world. Keep the last picture.
        print(f"Checker trouble: {sum(1 for r in fresh.values() if 'error' in r)} of {len(fresh)} feeds failed; keeping last readings.")
        checked_at = previous.get("checked_at", "")
    else:
        checked_at = iso(now)
        update_history(history, services, previous, now)

    links = find_links(config, services)
    banners = build_banners(config, services, links)
    recent, stats = summarise_history(history, services, now)
    counts = {level: sum(1 for entry in services.values() if entry["level"] == level)
              for level in ("ok", "minor", "major", "unknown")}

    status = {
        "version": 1,
        "checked_at": checked_at,
        "attempted_at": iso(now),
        "trouble": trouble,
        "tracking_since": history["tracking_since"],
        "counts": counts,
        "banners": banners,
        "services": services,
        "recent": recent,
        "stats": stats,
        "state": state,
    }
    status_path.write_text(json.dumps(status, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    history_path.write_text(json.dumps(history, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")

    for sid, reading in sorted(fresh.items()):
        if "error" in reading:
            print(f"  could not read {sid}: {reading['error']}")
    print(f"Checked {len(services)} services: {counts['ok']} fine, {counts['minor']} with some problems, "
          f"{counts['major']} with major problems, {counts['unknown']} unreadable.")
    return 0


# ---------------------------------------------------------------- page

START, END = "<!-- status:services:start -->", "<!-- status:services:end -->"
COUNT = re.compile(r"(<!-- status:count -->)(.*?)(<!-- /status:count -->)", re.S)


def official_page(svc: dict) -> str:
    if svc.get("page"):
        return svc["page"]
    if svc.get("base"):
        return svc["base"]
    if svc.get("path"):
        return "https://www.gov.uk" + svc["path"]
    return ""


def render_cards(config: dict) -> str:
    esc = html.escape
    out = []
    for category in config["categories"]:
        members = [svc for svc in config["services"] if svc["cat"] == category["id"]]
        if not members:
            continue
        out.append(f'<section class="status-group" data-group="{esc(category["id"])}" aria-labelledby="group-{esc(category["id"])}">')
        out.append(f'  <h3 class="status-group-title" id="group-{esc(category["id"])}">{esc(category["name"])}</h3>')
        out.append('  <div class="status-grid">')
        for svc in members:
            sid = esc(svc["id"])
            search = esc(" ".join([svc["name"], svc.get("about", ""), svc.get("search", ""), category["name"]]).lower())
            page = official_page(svc)
            own_check = svc["kind"] in ("probe", "meta")
            out.append(f'    <article class="svc" id="svc-{sid}" data-svc="{sid}" data-cat="{esc(category["id"])}" data-level="pending" data-search="{search}">')
            out.append(f'      <div class="svc-head"><h4>{esc(svc["name"])}</h4><p class="svc-state" data-state>Checking…</p></div>')
            out.append(f'      <p class="svc-about">{esc(svc.get("about", ""))}</p>')
            out.append('      <div class="svc-live" data-live hidden></div>')
            out.append(f'      <p class="svc-tip" data-tip hidden><strong>What to do:</strong> {esc(svc.get("tip") or category["tip"])}</p>')
            if svc.get("caveat"):
                out.append(f'      <p class="svc-caveat">{esc(svc["caveat"])}</p>')
            if svc["kind"] == "meta":
                out.append('      <p class="svc-caveat">No official status for the everyday app, so we test it ourselves.</p>')
            elif svc["kind"] == "probe":
                out.append('      <p class="svc-caveat">No official status feed, so we test it ourselves.</p>')
            foot = []
            if page:
                label = svc.get("pagelabel") or "Official status page"
                foot.append(f'<a href="{esc(page)}" rel="noopener">{esc(label)} <span aria-hidden="true">↗</span></a>')
            foot.append(f'<span class="svc-source">{"Our own check" if own_check else "Official feed"}</span>')
            out.append(f'      <p class="svc-foot">{" ".join(foot)}</p>')
            out.append('    </article>')
        out.append('  </div>')
        out.append('</section>')
    return "\n".join(out)


def render(check: bool) -> int:
    config = load_config()
    ids = [svc["id"] for svc in config["services"]]
    if len(ids) != len(set(ids)):
        print("status/services.json has duplicate service ids")
        return 1
    known = {category["id"] for category in config["categories"]}
    for svc in config["services"]:
        if svc["kind"] not in READERS or svc["cat"] not in known:
            print(f"status/services.json: {svc['id']} has an unknown kind or category")
            return 1
    page = PAGE.read_text(encoding="utf-8")
    if START not in page or END not in page:
        print("status.html is missing the service markers")
        return 1
    head, rest = page.split(START, 1)
    _, tail = rest.split(END, 1)
    updated = head + START + "\n" + render_cards(config) + "\n" + END + tail
    updated = COUNT.sub(lambda match: match.group(1) + str(len(ids)) + match.group(3), updated)
    if check:
        if updated != page:
            print("status.html is out of step with status/services.json. Run: python scripts/status_check.py render")
            return 1
        print(f"status.html matches status/services.json ({len(ids)} services).")
        return 0
    PAGE.write_text(updated, encoding="utf-8")
    print(f"status.html rebuilt with {len(ids)} services.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    run_parser = commands.add_parser("run")
    run_parser.add_argument("--data", required=True, type=Path)
    run_parser.add_argument("--only", default="")
    render_parser = commands.add_parser("render")
    render_parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.command == "run":
        return run(args.data, {part for part in args.only.split(",") if part} or None)
    return render(args.check)


if __name__ == "__main__":
    sys.exit(main())
