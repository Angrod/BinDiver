import gzip
import json
import sqlite3
from pathlib import Path

from bindiver.mtg.build_db import build_db, iter_bulk
from bindiver.mtg.spot import printing_traits


def test_iter_bulk_reads_gzipped_jsonl(tmp_path):
    path = tmp_path / "cards.jsonl.gz"
    with gzip.open(path, "wt", encoding="utf-8") as f:
        f.write(json.dumps({"id": "a", "name": "Lim-Dûl's Vault"}) + "\n")
        f.write("\n")
        f.write(json.dumps({"id": "b", "name": "Fireball"}) + "\n")

    assert [c["name"] for c in iter_bulk(path)] == ["Lim-Dûl's Vault", "Fireball"]


def test_printing_traits_fall_back_to_the_front_face():
    card = {"artist": "Nils Hamm", "border_color": "black", "frame": "2015",
            "card_faces": [{"illustration_id": "front-art"}, {"illustration_id": "back-art"}]}
    assert printing_traits(card) == {
        "artist": "Nils Hamm", "illustration_id": "front-art", "border_color": "black",
        "frame": "2015", "frame_effects": [], "full_art": False, "textless": False,
        "promo_types": [], "security_stamp": None, "card_back_id": None,
    }


def test_fullart_frame_effect_counts_as_full_art():
    assert printing_traits({"full_art": False, "frame_effects": ["fullart"]})["full_art"] is True


def test_build_stores_traits_and_the_set_list(tmp_path, fixture_cards):
    db = tmp_path / "cards.sqlite"
    build_db(fixture_cards, db, price_date="2026-11-03",
             sets=[{"code": "lea", "name": "Limited Edition Alpha",
                    "icon_svg_uri": "https://svgs.scryfall.io/sets/lea.svg"}])
    conn = sqlite3.connect(db)
    assert conn.execute("SELECT code, name, icon_svg_uri FROM sets").fetchall() == [
        ("lea", "Limited Edition Alpha", "https://svgs.scryfall.io/sets/lea.svg")]
    assert conn.execute("SELECT frame_effects, promo_types FROM printings WHERE id = 'fb-lea'").fetchone() == ("[]", "[]")


def test_build_stores_quiet_kinds_and_printed_totals(tmp_path):
    cards = json.loads((Path(__file__).parent / "fixtures" / "counterspell.json").read_text(encoding="utf-8"))
    cards.append({**cards[-1], "id": "cs-sld", "set": "sld", "set_name": "Secret Lair Drop",
                  "collector_number": "9", "released_at": "2021-01-01", "promo_types": ["serialized"]})
    db = tmp_path / "cs.sqlite"
    build_db(cards, db, price_date="2026-11-03", sets=[
        {"code": "7ed", "name": "Seventh Edition", "printed_size": 350, "card_count": 708},
        {"code": "lea", "name": "Limited Edition Alpha", "card_count": 295},
        {"code": "sld", "name": "Secret Lair Drop"}])
    conn = sqlite3.connect(db)
    assert conn.execute("SELECT code, printed_total FROM sets ORDER BY code").fetchall() == [
        ("7ed", 350), ("lea", 295), ("sld", None)]
    kinds = dict(conn.execute(
        "SELECT p.set_code, v.quiet_kind FROM versions v JOIN printings p ON p.id = v.printing_id"))
    for code in ("lea", "leb", "2ed", "3ed", "ced", "fbb", "7ed", "mmq"):
        assert kinds[code] == "old border", code
    assert kinds["dmr"] == ""
    assert kinds["sld"] == "Secret Lair"
