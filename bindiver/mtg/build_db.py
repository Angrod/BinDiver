"""Turn Scryfall's default_cards bulk file into a slim SQLite lookup database.

Only paper printings are kept, and each printing is split into one row per
finish (nonfoil, foil, etched) so every finish has its own price.
"""

import gzip
import json
import os
import sqlite3
from itertools import groupby
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from .normalize import normalize_name
from .hand_notes import HAND_NOTES_FILE, HandNotes, load_hand_notes
from .spot import SpotVersion, printing_traits, spot_card

# Not tracked as cards. Token and emblem names are still indexed so a scanned token
# is recognized as one instead of being matched to the nearest real card name.
TOKEN_LAYOUTS = {"token", "double_faced_token", "emblem"}
EXCLUDED_LAYOUTS = TOKEN_LAYOUTS | {"art_series"}
FINISH_PRICE_KEYS = {"nonfoil": "usd", "foil": "usd_foil", "etched": "usd_etched"}

SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE printings (
    id TEXT PRIMARY KEY,
    oracle_id TEXT NOT NULL,
    name TEXT NOT NULL,
    set_code TEXT NOT NULL,
    set_name TEXT NOT NULL,
    collector_number TEXT NOT NULL,
    released_at TEXT NOT NULL,
    lang TEXT NOT NULL,
    artist TEXT,
    illustration_id TEXT,
    border_color TEXT,
    frame TEXT,
    frame_effects TEXT,
    full_art INTEGER,
    textless INTEGER,
    promo_types TEXT,
    security_stamp TEXT,
    card_back_id TEXT,
    symbol_set TEXT
);
CREATE INDEX printings_oracle ON printings (oracle_id);
CREATE TABLE versions (
    printing_id TEXT NOT NULL REFERENCES printings (id),
    finish TEXT NOT NULL,
    price_cents INTEGER,
    look_for TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    same_as TEXT NOT NULL DEFAULT '[]',
    frame_group TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (printing_id, finish)
);
CREATE TABLE names (
    norm TEXT NOT NULL,
    oracle_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('full', 'face', 'token')),
    PRIMARY KEY (norm, oracle_id, kind)
);
CREATE TABLE sets (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon_svg_uri TEXT
);
"""


def iter_bulk(path):
    """Yield card objects from a gzipped JSON Lines bulk file."""
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def _oracle_id(card):
    # Reversible cards carry their oracle_id on each face, not at the top level.
    if card.get("oracle_id"):
        return card["oracle_id"]
    for face in card.get("card_faces") or []:
        if face.get("oracle_id"):
            return face["oracle_id"]
    return None


def _cents(price):
    if price is None:
        return None
    return int((Decimal(price) * 100).to_integral_value())


def _index_names(conn, card, oracle_id, full_kind, face_kind):
    conn.execute(
        "INSERT OR IGNORE INTO names VALUES (?, ?, ?)",
        (normalize_name(card["name"]), oracle_id, full_kind),
    )
    for face in card.get("card_faces") or []:
        conn.execute(
            "INSERT OR IGNORE INTO names VALUES (?, ?, ?)",
            (normalize_name(face["name"]), oracle_id, face_kind),
        )


def _spot_pass(conn, hand_notes):
    """Write each version's look-for text, and each printing's printed-symbol set."""
    set_names = dict(conn.execute("SELECT code, name FROM sets"))
    rows = conn.execute(
        "SELECT p.oracle_id, p.id, v.finish, p.set_code, p.set_name, p.collector_number,"
        " p.released_at, p.lang, p.artist, p.illustration_id, p.border_color, p.frame,"
        " p.frame_effects, p.full_art, p.textless, p.promo_types, p.security_stamp, p.card_back_id"
        " FROM printings p JOIN versions v ON v.printing_id = p.id"
        " ORDER BY p.oracle_id, p.released_at, p.set_code, p.collector_number, v.finish"
    ).fetchall()
    for _, group in groupby(rows, key=lambda r: r[0]):
        versions = [
            SpotVersion(
                printing_id=r[1], finish=r[2], set_code=r[3], set_name=r[4], collector_number=r[5],
                released_at=r[6], lang=r[7], artist=r[8], illustration_id=r[9], border_color=r[10],
                frame=r[11], frame_effects=tuple(json.loads(r[12])), full_art=bool(r[13]),
                textless=bool(r[14]), promo_types=tuple(json.loads(r[15])),
                security_stamp=r[16], card_back_id=r[17],
            )
            for r in group
        ]
        spots = spot_card(versions, hand_notes, set_names)
        for v in versions:
            spot = spots[v.key]
            conn.execute(
                "UPDATE versions SET look_for = ?, notes = ?, same_as = ?, frame_group = ?"
                " WHERE printing_id = ? AND finish = ?",
                (spot.look_for, "\n".join(spot.notes), json.dumps(list(spot.same_as)),
                 spot.frame_group, v.printing_id, v.finish),
            )
            conn.execute("UPDATE printings SET symbol_set = ? WHERE id = ?",
                         (spot.symbol_set, v.printing_id))


def build_db(cards, db_path, price_date, sets=(), hand_notes: HandNotes | None = None):
    """Write the lookup database to db_path, replacing any existing file only on success."""
    if hand_notes is None:
        hand_notes = load_hand_notes(HAND_NOTES_FILE)
    db_path = Path(db_path)
    tmp_path = db_path.with_name(db_path.name + ".tmp")
    tmp_path.unlink(missing_ok=True)

    conn = sqlite3.connect(tmp_path)
    try:
        conn.executescript(SCHEMA)
        conn.executemany(
            "INSERT OR REPLACE INTO sets VALUES (?, ?, ?)",
            [(s["code"], s["name"], s.get("icon_svg_uri")) for s in sets],
        )
        for card in cards:
            if "paper" not in card.get("games", []):
                continue
            layout = card.get("layout")
            if layout in TOKEN_LAYOUTS:
                _index_names(conn, card, _oracle_id(card) or card["id"], "token", "token")
                continue
            if layout in EXCLUDED_LAYOUTS:
                continue
            oracle_id = _oracle_id(card)
            if oracle_id is None:
                continue
            traits = printing_traits(card)
            conn.execute(
                "INSERT INTO printings (id, oracle_id, name, set_code, set_name, collector_number,"
                " released_at, lang, artist, illustration_id, border_color, frame, frame_effects,"
                " full_art, textless, promo_types, security_stamp, card_back_id)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    card["id"], oracle_id, card["name"], card["set"], card["set_name"],
                    card["collector_number"], card["released_at"], card["lang"],
                    traits["artist"], traits["illustration_id"], traits["border_color"],
                    traits["frame"], json.dumps(traits["frame_effects"]), int(traits["full_art"]),
                    int(traits["textless"]), json.dumps(traits["promo_types"]),
                    traits["security_stamp"], traits["card_back_id"],
                ),
            )
            prices = card.get("prices") or {}
            for finish in card.get("finishes", []):
                price = prices.get(FINISH_PRICE_KEYS.get(finish, ""))
                conn.execute(
                    "INSERT INTO versions (printing_id, finish, price_cents) VALUES (?, ?, ?)",
                    (card["id"], finish, _cents(price)),
                )
            _index_names(conn, card, oracle_id, "full", "face")
        _spot_pass(conn, hand_notes)
        conn.executemany(
            "INSERT INTO meta VALUES (?, ?)",
            [
                ("price_date", price_date),
                ("built_at", datetime.now(timezone.utc).isoformat(timespec="seconds")),
            ],
        )
        conn.commit()
    finally:
        conn.close()
    os.replace(tmp_path, db_path)
