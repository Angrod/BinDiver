"""Write the slimmed card database, its zip and its manifest for the phone app."""

import hashlib
import json
import sqlite3
import zipfile
from pathlib import Path

PHONE_FORMAT = 1
PHONE_DB = "cards-phone.sqlite"
MANIFEST = "manifest.json"
PRINTING_COLUMNS = ("id", "oracle_id", "name", "set_code", "set_name", "collector_number",
                    "released_at", "lang", "symbol_set")

PRINTINGS_DDL = """CREATE TABLE printings (
    id TEXT PRIMARY KEY,
    oracle_id TEXT NOT NULL,
    name TEXT NOT NULL,
    set_code TEXT NOT NULL,
    set_name TEXT NOT NULL,
    collector_number TEXT NOT NULL,
    released_at TEXT NOT NULL,
    lang TEXT NOT NULL,
    symbol_set TEXT
)"""


def icon_uris_needed(src_db):
    """code -> icon URI for every symbol set a printing uses, where the sets table has a URI."""
    with sqlite3.connect(src_db) as con:
        rows = con.execute(
            "SELECT code, icon_svg_uri FROM sets WHERE icon_svg_uri IS NOT NULL AND code != 'none' "
            "AND code IN (SELECT DISTINCT symbol_set FROM printings WHERE symbol_set IS NOT NULL)"
        ).fetchall()
    return dict(rows)


def write_phone_tables(src_db, dst_db, icons, oracle_ids=None, extra_norms=frozenset()):
    """Write a fresh phone-format database at dst_db, optionally limited to some cards."""
    dst_db = Path(dst_db)
    dst_db.unlink(missing_ok=True)
    cols = ", ".join(PRINTING_COLUMNS)
    con = sqlite3.connect(dst_db)
    try:
        con.execute("ATTACH DATABASE ? AS src", (str(src_db),))
        create = dict(con.execute(
            "SELECT name, sql FROM src.sqlite_master WHERE type = 'table' AND name IN ('versions', 'names')"))
        con.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        con.execute("CREATE TABLE sets (code TEXT PRIMARY KEY, name TEXT NOT NULL, icon_svg TEXT)")
        con.execute(PRINTINGS_DDL)
        con.execute("CREATE INDEX printings_oracle ON printings (oracle_id)")
        con.execute(create["versions"])
        con.execute(create["names"])

        if oracle_ids is None:
            printing_where, names_where = "1", "1"
        else:
            con.execute("CREATE TEMP TABLE keep_oracle (oracle_id TEXT PRIMARY KEY)")
            con.executemany("INSERT INTO keep_oracle VALUES (?)", [(o,) for o in oracle_ids])
            con.execute("CREATE TEMP TABLE keep_norm (norm TEXT PRIMARY KEY)")
            con.executemany("INSERT INTO keep_norm VALUES (?)", [(n,) for n in extra_norms])
            printing_where = "oracle_id IN (SELECT oracle_id FROM keep_oracle)"
            names_where = "oracle_id IN (SELECT oracle_id FROM keep_oracle) OR norm IN (SELECT norm FROM keep_norm)"
        con.execute("INSERT INTO meta SELECT key, value FROM src.meta")
        con.execute("INSERT INTO meta VALUES ('phone_format', ?)", (str(PHONE_FORMAT),))
        con.execute(f"INSERT INTO printings SELECT {cols} FROM src.printings WHERE {printing_where}")
        con.execute("INSERT INTO versions SELECT * FROM src.versions "
                    "WHERE printing_id IN (SELECT id FROM printings)")
        con.execute(f"INSERT INTO names SELECT * FROM src.names WHERE {names_where}")
        sets_where = "1" if oracle_ids is None else (
            "code IN (SELECT set_code FROM printings) OR code IN (SELECT symbol_set FROM printings)")
        con.executemany(
            "INSERT INTO sets VALUES (?, ?, ?)",
            [(code, name, _icon_text(icons.get(code)))
             for code, name in con.execute(f"SELECT code, name FROM src.sets WHERE {sets_where}").fetchall()])
        con.commit()
        con.execute("DETACH DATABASE src")
        con.execute("VACUUM")
    finally:
        con.close()


def _icon_text(data):
    return None if data is None else data.decode("utf-8")


def build_phone_db(src_db, out_dir, icons):
    """Write the phone database, its dated zip and manifest.json into out_dir; return the manifest."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    db_path = out_dir / PHONE_DB
    write_phone_tables(src_db, db_path, icons)
    with sqlite3.connect(db_path) as con:
        price_date = con.execute("SELECT value FROM meta WHERE key = 'price_date'").fetchone()[0]
    zip_name = f"cards-phone-{price_date}.zip"
    zip_path = out_dir / zip_name
    for old in out_dir.glob("cards-phone-*.zip"):
        if old.name != zip_name:
            old.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(db_path, PHONE_DB)
    manifest = {
        "phone_format": PHONE_FORMAT,
        "price_date": price_date,
        "file": zip_name,
        "zip_bytes": zip_path.stat().st_size,
        "db_bytes": db_path.stat().st_size,
        "sha256": hashlib.sha256(zip_path.read_bytes()).hexdigest(),
    }
    (out_dir / MANIFEST).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest
