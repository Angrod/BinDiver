"""Replay a phone test-mode run against the Mac's lookup, to catch the two disagreeing."""

import csv
import json
import sqlite3
from dataclasses import dataclass

from .lookup import Catalog
from .quiet import alert_strength


@dataclass(frozen=True)
class LogCheck:
    compared: int                                   # rows checked against the Mac
    disagreements: list[tuple[str, str, str]]       # (name, phone alert, Mac alert)
    skipped: list[tuple[str, str]]                  # (name, reason): "marked wrong", "not found"
    phone_counts: dict[str, int]                    # "full", "quiet", "known", "none", over rows not marked wrong
    showcase_only: list[str]                        # Mac full alerts whose full versions are all showcase or borderless
    log_price_dates: list[str]                      # distinct, sorted
    mac_price_date: str


def _phone_alert(row):
    """The row's alert column, or for older camera-test logs, full when it alerted and none when not."""
    alert = row.get("alert")
    if alert:
        return alert
    return "full" if row.get("alerted") == "yes" else "none"


def _mac_alert(catalog, name, min_cents):
    """The Mac's alert strength for a name, or None when the name is not a tracked card."""
    result = catalog.lookup(name, min_cents / 100)
    if result.match == "token":
        return "none", result
    if result.match != "exact":
        return None, result
    return alert_strength(result.groups), result


def _is_showcase_or_borderless(conn, scryfall_id):
    effects, border = conn.execute(
        "SELECT frame_effects, border_color FROM printings WHERE id = ?", (scryfall_id,)).fetchone()
    return "showcase" in json.loads(effects or "[]") or border == "borderless"


def _only_showcase(conn, result):
    full = [v for g in result.groups for v in g.qualifying if v.quiet_kind == ""]
    return bool(full) and all(_is_showcase_or_borderless(conn, v.scryfall_id) for v in full)


def check_log(catalog: Catalog, db_path, csv_path) -> LogCheck:
    compared = 0
    disagreements = []
    skipped = []
    counts = {"full": 0, "quiet": 0, "known": 0, "none": 0}
    showcase_only = []
    dates = set()
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        with open(csv_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                name = row["name"]
                if row.get("marked_wrong") == "yes":
                    skipped.append((name, "marked wrong"))
                    continue
                phone = _phone_alert(row)
                counts[phone] = counts.get(phone, 0) + 1
                dates.add(row["price_date"])
                if phone == "known":
                    continue
                mac, result = _mac_alert(catalog, name, int(row["min_cents"]))
                if mac is None:
                    skipped.append((name, "not found"))
                    continue
                compared += 1
                if mac != phone:
                    disagreements.append((name, phone, mac))
                if mac == "full" and name not in showcase_only and _only_showcase(conn, result):
                    showcase_only.append(name)
    finally:
        conn.close()
    return LogCheck(compared, disagreements, skipped, counts, showcase_only, sorted(dates), catalog.price_date)


def format_check(check: LogCheck) -> str:
    c = check.phone_counts
    lines = [
        f"Checked {check.compared} reads against prices as of {check.mac_price_date}: "
        f"{len(check.disagreements)} disagree.",
        f"Phone alerts: {c.get('full', 0)} full, {c.get('quiet', 0)} quiet, "
        f"{c.get('known', 0)} known, {c.get('none', 0)} none.",
    ]
    line = f"Full alerts only from showcase or borderless versions: {len(check.showcase_only)}"
    if check.showcase_only:
        line += f" ({', '.join(check.showcase_only)})"
    lines.append(line)
    if check.skipped:
        lines.append("Skipped: " + ", ".join(f"{name} ({reason})" for name, reason in check.skipped))
    for name, phone, mac in check.disagreements:
        lines.append(f"Disagree: {name}: phone {phone}, Mac {mac}")
    if any(d != check.mac_price_date for d in check.log_price_dates):
        lines.append(f"Warning: the log's prices are from {', '.join(check.log_price_dates)}; "
                     f"the Mac's are from {check.mac_price_date}.")
    return "\n".join(lines)
