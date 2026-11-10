"""Decide whether the nightly job needs to rebuild the phone data."""

import json
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
