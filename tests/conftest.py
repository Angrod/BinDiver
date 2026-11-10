import json
from pathlib import Path

import pytest

from bindiver.mtg.build_db import build_db
from bindiver.mtg.hand_notes import load_hand_notes
from bindiver.mtg.lookup import Catalog

FIXTURES = Path(__file__).parent / "fixtures"
FIXTURE = FIXTURES / "cards.json"
CS_SETS = [{"code": "7ed", "name": "Seventh Edition", "printed_size": 350, "card_count": 708,
            "icon_svg_uri": "https://svgs.scryfall.io/sets/7ed.svg"},
           {"code": "lea", "name": "Limited Edition Alpha", "card_count": 295,
            "icon_svg_uri": "https://svgs.scryfall.io/sets/lea.svg"}]


@pytest.fixture
def fixture_cards():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture
def catalog(tmp_path, fixture_cards):
    db = tmp_path / "cards.sqlite"
    build_db(fixture_cards, db, price_date="2026-11-03")
    return Catalog(db)


@pytest.fixture
def cs_catalog(tmp_path):
    cards = json.loads((FIXTURES / "counterspell.json").read_text(encoding="utf-8"))
    db = tmp_path / "cs.sqlite"
    build_db(cards, db, price_date="2026-11-03", sets=CS_SETS,
             hand_notes=load_hand_notes(FIXTURES / "hand_notes_test.json"))
    return Catalog(db)
