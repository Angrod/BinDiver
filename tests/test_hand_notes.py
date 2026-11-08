import re
from pathlib import Path

import pytest

from bindiver.mtg.hand_notes import HandNotes, SetNote, load_hand_notes, parse_hand_notes

FIXTURE = Path(__file__).parent / "fixtures" / "hand_notes_test.json"


def test_set_fields_and_pair_notes_load():
    notes = load_hand_notes(FIXTURE)
    assert notes.set_note("ced").back == "Collectors' Edition back"
    assert notes.set_note("5ed") == SetNote(symbol=False, except_langs=("zhs",), source="https://example.test/5ed")
    assert notes.set_note("xyz") == SetNote()
    assert notes.pair_note("leb", "lea") == "Beta's corners are less rounded than Alpha's."
    assert notes.pair_note("lea", "2ed") is None


@pytest.mark.parametrize("data, message", [
    ({"sets": {"ced": {"symbol": False}}, "pairs": []}, "sets.ced has no source link"),
    ({"sets": {"ced": {"bak": "x", "source": "https://x.test"}}, "pairs": []}, "sets.ced has unknown field 'bak'"),
    ({"sets": {}, "pairs": [{"sets": ["lea", "leb"], "notes": {"lea": "x"}}]}, "pairs[0] has no source link"),
    ({"sets": {}, "pairs": [{"sets": ["lea", "leb"], "notes": {"2ed": "x"}, "source": "https://x.test"}]},
     "pairs[0] has a note for 2ed, which is not in its sets"),
])
def test_bad_entries_are_rejected(data, message):
    with pytest.raises(ValueError, match=re.escape(message)):
        parse_hand_notes(data)


def test_shipped_file_loads():
    assert isinstance(load_hand_notes(), HandNotes)


def test_shipped_notes_cover_the_first_pass():
    notes = load_hand_notes()
    for code in ("lea", "leb", "2ed", "3ed", "sum", "ced", "cei", "fbb", "4ed", "4bb", "5ed"):
        assert notes.set_note(code).symbol is False, code
    assert notes.set_note("5ed").except_langs == ("zhs",)
    assert notes.set_note("dbl").foil == "silver screen foil"
    assert notes.set_note("plst").stamp == "List stamp (lower left)"
    assert notes.set_note("ulst").stamp == "List stamp (lower left)"
    assert notes.pair_note("lea", "leb") and notes.pair_note("leb", "lea")
    for code in ("ced", "cei", "30a", "ptc", "wc97", "wc98", "wc99", "wc00", "wc01", "wc02", "wc03", "wc04"):
        assert notes.set_note(code).back, code
