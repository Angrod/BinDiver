"""Download Scryfall's default_cards bulk file, at most once every 24 hours.

Scryfall asks clients to cache data for at least 24 hours and to send a named
User-Agent and an Accept header with every request.
"""

import json
import os
import shutil
import ssl
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import certifi

USER_AGENT = "BinDiver/0.1"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json;q=0.9,*/*;q=0.8"}
BULK_ENDPOINT = "https://api.scryfall.com/bulk-data/default-cards"
SETS_ENDPOINT = "https://api.scryfall.com/sets"
MIN_CACHE = timedelta(hours=24)

BULK_FILE = "default_cards.jsonl.gz"
META_FILE = "default_cards.meta.json"
SETS_FILE = "sets.json"
ICON_DIR = "set_icons"
ICON_GAP = 0.1  # seconds between icon requests, well under Scryfall's 10 per second


def should_download(local_meta, remote_updated_at, now):
    """Download when there is no local copy, or it is over 24 hours old and Scryfall has a newer one."""
    if local_meta is None:
        return True
    if now - datetime.fromisoformat(local_meta["downloaded_at"]) < MIN_CACHE:
        return False
    return datetime.fromisoformat(remote_updated_at) > datetime.fromisoformat(local_meta["updated_at"])


def sets_are_fresh(saved, now):
    """The saved set list is reused for 24 hours."""
    if saved is None:
        return False
    return now - datetime.fromisoformat(saved["downloaded_at"]) < MIN_CACHE


def ssl_context():
    # certifi's bundle works the same on python.org macOS builds (which ship none) and in CI.
    return ssl.create_default_context(cafile=certifi.where())


def _get(url):
    request = urllib.request.Request(url, headers=HEADERS)
    return urllib.request.urlopen(request, timeout=60, context=ssl_context())


def read_local_meta(data_dir):
    data_dir = Path(data_dir)
    if not (data_dir / BULK_FILE).exists() or not (data_dir / META_FILE).exists():
        return None
    return json.loads((data_dir / META_FILE).read_text(encoding="utf-8"))


def update(data_dir, now=None):
    """Make sure data_dir holds a usable bulk file and return its metadata."""
    now = now or datetime.now(timezone.utc)
    data_dir = Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    local = read_local_meta(data_dir)
    if local and now - datetime.fromisoformat(local["downloaded_at"]) < MIN_CACHE:
        return local

    with _get(BULK_ENDPOINT) as resp:
        remote = json.load(resp)
    if not should_download(local, remote["updated_at"], now):
        return local

    tmp = data_dir / (BULK_FILE + ".part")
    with _get(remote["jsonl_download_uri"]) as resp, open(tmp, "wb") as out:
        shutil.copyfileobj(resp, out)
    os.replace(tmp, data_dir / BULK_FILE)
    meta = {
        "updated_at": remote["updated_at"],
        "downloaded_at": now.isoformat(timespec="seconds"),
        "source": remote["jsonl_download_uri"],
    }
    (data_dir / META_FILE).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def update_sets(data_dir, now=None):
    """Return Scryfall's set list, refetching it at most once every 24 hours."""
    now = now or datetime.now(timezone.utc)
    data_dir = Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / SETS_FILE
    saved = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    if sets_are_fresh(saved, now):
        return saved["data"]
    with _get(SETS_ENDPOINT) as resp:
        data = json.load(resp)["data"]
    saved = {"downloaded_at": now.isoformat(timespec="seconds"), "data": data}
    tmp = data_dir / (SETS_FILE + ".part")
    tmp.write_text(json.dumps(saved), encoding="utf-8")
    os.replace(tmp, path)
    return data


def fetch_set_icons(icon_uris, data_dir):
    """Return code -> SVG bytes, downloading each icon not yet saved in data_dir/set_icons.

    An icon that can't be downloaded is left out; the caller shows nothing for it.
    """
    icon_dir = Path(data_dir) / ICON_DIR
    icon_dir.mkdir(parents=True, exist_ok=True)
    icons, requested = {}, False
    for code, uri in icon_uris.items():
        path = icon_dir / f"{code}.svg"
        if not path.exists():
            if requested:
                time.sleep(ICON_GAP)
            requested = True
            try:
                with _get(uri) as resp:
                    data = resp.read()
            except (urllib.error.URLError, OSError):
                continue
            tmp = path.with_suffix(".svg.part")
            tmp.write_bytes(data)
            os.replace(tmp, path)
        icons[code] = path.read_bytes()
    return icons
