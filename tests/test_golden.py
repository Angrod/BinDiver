import json
import sqlite3

import pytest

from bindiver.mtg.build_db import build_db
from bindiver.mtg.golden import NORMALIZE_EXTRAS, golden_cases, write_golden
from bindiver.mtg.hand_notes import load_hand_notes
from bindiver.mtg.lookup import Catalog
from bindiver.mtg.normalize import normalize_name
from conftest import CS_SETS, FIXTURES


@pytest.fixture
def db(tmp_path):
    cards = json.loads((FIXTURES / "counterspell.json").read_text(encoding="utf-8"))
    path = tmp_path / "cs.sqlite"
    build_db(cards, path, price_date="2026-11-03", sets=CS_SETS,
             hand_notes=load_hand_notes(FIXTURES / "hand_notes_test.json"))
    return path


def case_for(cases, query, cents, order):
    return next(c for c in cases if (c["query"], c["min_cents"], c["order"]) == (query, cents, order))


def test_cases_cover_every_name_price_and_order(db):
    cases = golden_cases(Catalog(db), names=("Counterspell", "Shu Jing Meteorite"))
    assert len(cases) == 18
    assert (cases[0]["query"], cases[0]["min_cents"], cases[0]["order"]) == ("Counterspell", 200, "oldest")


def test_case_matches_the_python_lookup(db):
    cases = golden_cases(Catalog(db), names=("Counterspell",))
    case = case_for(cases, "Counterspell", 1000, "price")
    group = Catalog(db).lookup("Counterspell", 10, "price").groups[0]
    assert case["groups"][0]["qualifying"] == [v.key for v in group.qualifying]
    assert case["groups"][0]["summary"] == group.summary


def test_missing_name_has_no_groups(db):
    cases = golden_cases(Catalog(db), names=("Shu Jing Meteorite",))
    assert cases[0]["match"] == "none"
    assert cases[0]["groups"] == []


def test_fuzzy_match_is_refused(db):
    with pytest.raises(ValueError):
        golden_cases(Catalog(db), names=("Counterspel",))


def test_golden_db_holds_only_reached_cards(db, tmp_path):
    out = tmp_path / "out"
    write_golden(db, out, {}, names=("Counterspell",))
    with sqlite3.connect(out / "golden.sqlite") as con:
        assert con.execute("SELECT DISTINCT oracle_id FROM printings").fetchall() == [("cs-oracle",)]


def test_normalize_cases_include_names_and_extras(db, tmp_path):
    out = tmp_path / "out"
    write_golden(db, out, {}, names=("Counterspell",))
    cases = json.loads((out / "normalize.json").read_text(encoding="utf-8"))["cases"]
    assert all(normalize_name(raw) == norm for raw, norm in cases)
    assert ["Counterspell", "counterspell"] in cases
    assert [raw for raw, _ in cases[-len(NORMALIZE_EXTRAS):]] == list(NORMALIZE_EXTRAS)


def test_names_json_mirrors_the_names_table(db, tmp_path):
    out = tmp_path / "out"
    write_golden(db, out, {}, names=("Counterspell",))
    assert json.loads((out / "names.json").read_text(encoding="utf-8")) == [["counterspell", "full"]]


def test_golden_json_shape(db, tmp_path):
    out = tmp_path / "out"
    write_golden(db, out, {}, names=("Counterspell",))
    data = json.loads((out / "golden.json").read_text(encoding="utf-8"))
    assert data["price_date"] == "2026-11-03" and data["phone_format"] == 1
    assert len(data["cases"]) == 9
