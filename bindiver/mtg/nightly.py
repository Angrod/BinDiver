"""Decide whether the nightly job needs to rebuild the phone data."""

import json
import sqlite3
import urllib.error
import urllib.request

from bindiver.mtg.bulk_data import BULK_ENDPOINT, HEADERS, price_date_of, ssl_context

MANIFEST_URL = "https://github.com/Angrod/BinDiver/releases/download/data-latest/manifest.json"


def should_build(manifest_price_date, scryfall_price_date, forced):
    """Build when forced, when nothing is published yet, or when Scryfall's prices are from another date."""
    return forced or manifest_price_date is None or manifest_price_date != scryfall_price_date


def fetch_json(url):
    """The JSON at url, or None for a 404. Any other failure raises, so an outage fails the job."""
    request = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(request, timeout=60, context=ssl_context()) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return None
        raise


def nightly_check(forced, fetch_json):
    manifest = fetch_json(MANIFEST_URL)
    bulk = fetch_json(BULK_ENDPOINT)
    return should_build(manifest["price_date"] if manifest else None, price_date_of(bulk["updated_at"]), forced)


# Row floors for the phone database. The real Nov 8 build had 104,682 printings, 38,058 names,
# 155,769 versions (94.8% priced), 1,067 sets and 2,561 artists.
FLOORS = {"printings": 90_000, "names": 30_000, "versions": 130_000, "sets": 900, "artists": 2_000}
MIN_PRICED_SHARE = 0.85
MAX_SIZE_CHANGE = 0.25


def sanity_problems(db_path, manifest, published, floors=None):
    """Problems that should stop a phone build from being published; an empty list means it looks right."""
    floors = FLOORS if floors is None else floors
    problems = []
    con = sqlite3.connect(db_path)
    try:
        for table, floor in floors.items():
            (count,) = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
            if count < floor:
                problems.append(f"{table}: {count:,} rows, expected at least {floor:,}")
        total, priced = con.execute("SELECT COUNT(*), COUNT(price_cents) FROM versions").fetchone()
        share = priced / total if total else 0.0
        if share < MIN_PRICED_SHARE:
            problems.append(f"versions priced: {share:.1%} ({priced:,} of {total:,}), expected at least "
                            f"{MIN_PRICED_SHARE:.0%}")
    finally:
        con.close()
    if manifest.get("phone_format") != 1:
        problems.append(f"phone_format is {manifest.get('phone_format')}, expected 1")
    if published is not None:
        new, old = manifest["db_bytes"], published["db_bytes"]
        if abs(new - old) > old * MAX_SIZE_CHANGE:
            problems.append(f"db_bytes is {new:,}, more than {MAX_SIZE_CHANGE:.0%} away from the published {old:,}")
    return problems
