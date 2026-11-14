import hashlib
import json
import sqlite3
import zipfile

import pytest

from bindiver.mtg.build_db import build_db
from bindiver.mtg.hand_notes import load_hand_notes
from bindiver.mtg.phone_db import PRINTING_COLUMNS, build_phone_db, icon_uris_needed, write_phone_tables
from conftest import CS_SETS, FIXTURES

ICONS = {"7ed": b"<svg>7ed</svg>", "lea": b'<svg><path fill="#000" d="M0"/></svg>'}


@pytest.fixture
def src(tmp_path):
    cards = json.loads((FIXTURES / "counterspell.json").read_text(encoding="utf-8"))
    db = tmp_path / "cs.sqlite"
    build_db(cards, db, price_date="2026-11-03", sets=CS_SETS,
             hand_notes=load_hand_notes(FIXTURES / "hand_notes_test.json"))
    return db


@pytest.fixture
def built(src, tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    (out / "cards-phone-2026-11-01.zip").write_bytes(b"old")
    manifest = build_phone_db(src, out, ICONS)
    return out, manifest


def rows(db, sql):
    with sqlite3.connect(db) as con:
        return con.execute(sql).fetchall()


def test_printings_keep_only_phone_columns(src, built):
    phone = built[0] / "cards-phone.sqlite"
    assert [r[1] for r in rows(phone, "PRAGMA table_info(printings)")] == list(PRINTING_COLUMNS)
    assert PRINTING_COLUMNS[-1] == "artist_id"
    assert rows(phone, "SELECT count(*) FROM printings") == rows(src, "SELECT count(*) FROM printings") == [(10,)]


def test_artists_are_stored_once(src, built):
    phone = built[0] / "cards-phone.sqlite"
    assert rows(phone, "SELECT id, name FROM artists ORDER BY id") == [
        (1, "Gao Yan"), (2, "Mark Poole"), (3, "Mark Romanoski")]
    joined = sorted(rows(phone, "SELECT p.id, a.name FROM printings p JOIN artists a ON a.id = p.artist_id"))
    assert joined == sorted(rows(src, "SELECT id, artist FROM printings"))


def test_set_number_index_exists(built):
    phone = built[0] / "cards-phone.sqlite"
    assert [r[2] for r in rows(phone, "PRAGMA index_info(printings_set_number)")] == ["set_code", "collector_number"]


def test_sets_carry_printed_total(built):
    phone = built[0] / "cards-phone.sqlite"
    assert dict(rows(phone, "SELECT code, printed_total FROM sets")) == {"7ed": 350, "lea": 295}


def test_versions_and_names_are_copied_unchanged(src, built):
    phone = built[0] / "cards-phone.sqlite"
    for sql in ("SELECT * FROM versions ORDER BY printing_id, finish", "SELECT * FROM names ORDER BY 1, 2, 3"):
        assert rows(phone, sql) == rows(src, sql)


def test_sets_embed_icon_text(built):
    phone = built[0] / "cards-phone.sqlite"
    assert dict(rows(phone, "SELECT code, icon_svg FROM sets")) == {"7ed": "<svg>7ed</svg>", "lea": '<svg><path d="M0"/></svg>'}


def test_icon_fills_are_stripped(built):
    icons = dict(rows(built[0] / "cards-phone.sqlite", "SELECT code, icon_svg FROM sets"))
    assert icons["lea"] == '<svg><path d="M0"/></svg>'
    assert icons["7ed"] == "<svg>7ed</svg>"


def test_meta_has_phone_format_and_price_date(built):
    phone = built[0] / "cards-phone.sqlite"
    meta = dict(rows(phone, "SELECT key, value FROM meta"))
    assert meta["price_date"] == "2026-11-03"
    assert meta["phone_format"] == "1"


def test_database_is_vacuumed(built):
    assert rows(built[0] / "cards-phone.sqlite", "PRAGMA freelist_count") == [(0,)]


def test_zip_holds_only_the_database(built):
    out, _ = built
    with zipfile.ZipFile(out / "cards-phone-2026-11-03.zip") as z:
        assert z.namelist() == ["cards-phone.sqlite"]
        assert z.read("cards-phone.sqlite") == (out / "cards-phone.sqlite").read_bytes()


def test_manifest_describes_the_zip(built):
    out, manifest = built
    zip_path = out / "cards-phone-2026-11-03.zip"
    expected = {"phone_format": 1, "price_date": "2026-11-03", "file": "cards-phone-2026-11-03.zip",
                "zip_bytes": zip_path.stat().st_size, "db_bytes": (out / "cards-phone.sqlite").stat().st_size,
                "sha256": hashlib.sha256(zip_path.read_bytes()).hexdigest()}
    assert manifest == expected
    assert list(manifest) == list(expected)
    assert json.loads((out / "manifest.json").read_text(encoding="utf-8")) == expected


def test_older_zips_are_removed(built):
    out, _ = built
    assert sorted(p.name for p in out.glob("cards-phone-*.zip")) == ["cards-phone-2026-11-03.zip"]


def test_icon_uris_needed_lists_used_symbol_sets(src):
    assert icon_uris_needed(src) == {"7ed": "https://svgs.scryfall.io/sets/7ed.svg"}


def test_oracle_filter_keeps_only_listed_cards(src, tmp_path):
    dst = tmp_path / "f.sqlite"
    write_phone_tables(src, dst, ICONS, oracle_ids={"cs-oracle"}, extra_norms=frozenset({"saproling"}))
    assert rows(dst, "SELECT count(*) FROM printings") == [(10,)]
    assert rows(dst, "SELECT count(*) FROM names WHERE norm = 'counterspell'") == [(1,)]
    write_phone_tables(src, dst, ICONS, oracle_ids={"nope"})
    for table in ("printings", "names", "sets", "artists"):
        assert rows(dst, f"SELECT count(*) FROM {table}") == [(0,)]
