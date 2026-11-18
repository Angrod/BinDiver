import gzip
import json
import sqlite3
from pathlib import Path

from bindiver.mtg.build_db import build_db, iter_bulk
from bindiver.mtg.spot import printing_traits
from conftest import make_card


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


def _names(db):
    return sorted(sqlite3.connect(db).execute("SELECT norm, oracle_id, kind FROM names").fetchall())


def test_flavor_names_are_indexed_as_faces_of_the_real_card(tmp_path):
    # Secret Lair and Godzilla cards print a flavor name as the big title, the real name small below it.
    cards = [
        make_card(id="adeline", oracle_id="o-adeline", name="Adeline, Resplendent Cathar",
                  set="sld", set_name="Secret Lair Drop", flavor_name="Hero of Light"),
        make_card(id="brokkos", oracle_id="o-brokkos", name="Brokkos, Apex of Forever", set="iko",
                  set_name="Ikoria: Lair of Behemoths", flavor_name="Bio-Quartz Spacegodzilla"),
    ]
    db = tmp_path / "flavor.sqlite"
    build_db(cards, db, price_date="2026-11-18")
    assert _names(db) == [
        ("adeline resplendent cathar", "o-adeline", "full"),
        ("bio quartz spacegodzilla", "o-brokkos", "face"),
        ("brokkos apex of forever", "o-brokkos", "full"),
        ("hero of light", "o-adeline", "face"),
    ]


def test_flavor_names_of_card_faces_are_indexed_too(tmp_path):
    card = make_card(id="mdfc", oracle_id="o-mdfc", name="Front // Back", layout="modal_dfc", card_faces=[
        {"name": "Front", "flavor_name": "Flavor Front"}, {"name": "Back"}])
    db = tmp_path / "faces.sqlite"
    build_db([card], db, price_date="2026-11-18")
    assert ("flavor front", "o-mdfc", "face") in _names(db)


def test_a_flavor_name_never_replaces_a_real_name(tmp_path):
    # A flavor name that is also some card's real name stays that card's: the real one is kept as full.
    cards = [
        make_card(id="real", oracle_id="o-real", name="Shared Name"),
        make_card(id="other", oracle_id="o-other", name="Other Card", flavor_name="Shared Name"),
    ]
    db = tmp_path / "shared.sqlite"
    build_db(cards, db, price_date="2026-11-18")
    shared = [r for r in _names(db) if r[0] == "shared name"]
    assert ("shared name", "o-real", "full") in shared


def test_tokens_get_no_flavor_names(tmp_path):
    token = make_card(id="tok", oracle_id="o-tok", name="Soldier", layout="token", flavor_name="Hero Token")
    db = tmp_path / "token.sqlite"
    build_db([token], db, price_date="2026-11-18")
    assert _names(db) == [("soldier", "o-tok", "token")]



def test_a_flavor_name_with_no_latin_letters_is_skipped(tmp_path):
    # Japanese flavor names normalize to nothing; an empty name would match any unreadable line.
    card = make_card(id="jp", oracle_id="o-jp", name="Real Name", flavor_name="ゴジラ")
    db = tmp_path / "jp.sqlite"
    build_db([card], db, price_date="2026-11-18")
    assert _names(db) == [("real name", "o-jp", "full")]
