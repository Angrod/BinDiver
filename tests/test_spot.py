import json
from pathlib import Path

import pytest

from bindiver.mtg.hand_notes import load_hand_notes
from bindiver.mtg.spot import STANDARD_BACK, SpotVersion, frame_bucket, spot_card

FIXTURES = Path(__file__).parent / "fixtures"
NOTES = load_hand_notes(FIXTURES / "hand_notes_test.json")


def family():
    cards = json.loads((FIXTURES / "counterspell.json").read_text(encoding="utf-8"))
    return [SpotVersion.from_card(c, f) for c in cards for f in c["finishes"]]


def test_counterspell_family_look_for_lines():
    spots = spot_card(family(), NOTES, {})
    assert {k: (s.look_for, s.notes, s.same_as) for k, s in spots.items()} == {
        "cs-lea:nonfoil": ("art by Mark Poole, black border, nonfoil, English, regular card back",
                           ("Alpha's corners are more rounded than Beta's.",), ()),
        "cs-leb:nonfoil": ("art by Mark Poole, black border, nonfoil, English, regular card back",
                           ("Beta's corners are less rounded than Alpha's.",), ()),
        "cs-2ed:nonfoil": ("art by Mark Poole, white border", (), ("cs-3ed:nonfoil",)),
        "cs-3ed:nonfoil": ("art by Mark Poole, white border", (), ("cs-2ed:nonfoil",)),
        "cs-ced:nonfoil": ("art by Mark Poole, black border, nonfoil, English, Collectors' Edition back", (), ()),
        "cs-fbb:nonfoil": ("art by Mark Poole, black border, nonfoil, French", (), ()),
        "cs-7ed:nonfoil": ("art by Mark Romanoski, white border", (), ()),
        "cs-7ed-foil:foil": ("art by Mark Romanoski, black border", (), ()),
        "cs-mmq:nonfoil": ("art by Gao Yan, nonfoil", (), ()),
        "cs-mmq:foil": ("art by Gao Yan, foil", (), ()),
        "cs-dmr:foil": ("art by Mark Poole, black border, foil", (), ()),
    }


def test_frame_groups_and_printed_symbols():
    spots = spot_card(family(), NOTES, {})
    assert {k: (s.frame_group, s.symbol_set) for k, s in spots.items() if k in
            ("cs-lea:nonfoil", "cs-7ed:nonfoil", "cs-dmr:foil")} == {
        "cs-lea:nonfoil": ("old-1993", "none"),
        "cs-7ed:nonfoil": ("old-1997", "7ed"),
        "cs-dmr:foil": ("retro", "dmr"),
    }


@pytest.mark.parametrize("frame, released, bucket", [
    ("1993", "1993-08-05", "old-1993"), ("1997", "2003-05-26", "old-1997"),
    ("1997", "2003-05-27", "retro"), ("2003", "2004-01-01", "modern"),
    ("2015", "2020-01-01", "m15"), ("future", "2007-05-04", "future"),
    ("2030", "2030-01-01", "2030"), (None, "2020-01-01", "unknown"),
])
def test_frame_bucket(frame, released, bucket):
    assert frame_bucket(frame, released) == bucket


SET_NAMES = {"xln": "Ixalan", "m11": "Magic 2011"}

def make(pid, finish="nonfoil", **kw):
    base = dict(printing_id=pid, finish=finish, set_code="tst", set_name="Test Set",
                collector_number="1", released_at="2020-01-01", lang="en", artist="Ann Artist",
                illustration_id="ill-1", border_color="black", frame="2015", frame_effects=(),
                full_art=False, textless=False, promo_types=(), security_stamp=None,
                card_back_id=STANDARD_BACK)
    return SpotVersion(**(base | kw))

def lines(*versions):
    return {k: s.look_for for k, s in spot_card(versions, NOTES, SET_NAMES).items()}

def test_named_special_foil_names_the_foil_finish_only():
    assert lines(make("ltr-1", promo_types=("silverfoil", "scroll")),
                 make("ltr-1", "foil", promo_types=("silverfoil", "scroll")),
                 make("ltr-2", "foil")) == {
        "ltr-1:nonfoil": "nonfoil", "ltr-1:foil": "silver foil", "ltr-2:foil": "foil"}

def test_set_wide_foil_name_comes_from_hand_notes():
    assert lines(make("d", set_code="dbl"), make("d", "foil", set_code="dbl")) == {
        "d:nonfoil": "nonfoil", "d:foil": "silver screen foil"}

def test_old_border_and_retro_frames():
    assert lines(make("a", frame="1997", released_at="2001-04-11"),
                 make("b", frame="1997", released_at="2023-01-13"),
                 make("c", frame="1993", released_at="1994-04-11")) == {
        "a:nonfoil": "old border (1997 frame)", "b:nonfoil": "retro frame",
        "c:nonfoil": "old border (1993 frame)"}

def test_modern_m15_and_future_sight_frames():
    assert lines(make("a", frame="2003"), make("b", frame="2015"), make("c", frame="future")) == {
        "a:nonfoil": "modern frame", "b:nonfoil": "M15 frame", "c:nonfoil": "Future Sight frame"}

def test_treatments_name_what_is_present_and_what_is_missing():
    assert lines(make("a", frame_effects=("showcase",)), make("b", frame_effects=("extendedart",)), make("c")) == {
        "a:nonfoil": "showcase frame, no extended art",
        "b:nonfoil": "extended art, no showcase frame",
        "c:nonfoil": "no showcase frame, no extended art"}
    assert lines(make("d", full_art=True), make("e")) == {"d:nonfoil": "full-art", "e:nonfoil": "not full-art"}

def test_stamps():
    assert lines(make("p", promo_types=("promopack", "stamped")), make("q")) == {
        "p:nonfoil": "promo stamp (art box)", "q:nonfoil": "no promo stamp"}
    assert lines(make("d", promo_types=("prerelease", "datestamped")), make("e")) == {
        "d:nonfoil": "date stamp", "e:nonfoil": "no date stamp"}
    assert lines(make("s", promo_types=("serialized",)), make("t")) == {
        "s:nonfoil": "serialized", "t:nonfoil": "not serialized"}

def test_list_cards_show_the_stamp_and_their_original_set_symbol():
    xln = make("l1", set_code="plst", set_name="The List", collector_number="XLN-217")
    m11 = make("l2", set_code="plst", set_name="The List", collector_number="M11-218")
    assert lines(xln, m11) == {"l1:nonfoil": "Ixalan set symbol", "l2:nonfoil": "Magic 2011 set symbol"}
    original = make("o1", set_code="xln", set_name="Ixalan", collector_number="217")
    assert lines(xln, original) == {"l1:nonfoil": "List stamp (lower left)", "o1:nonfoil": "no List stamp"}
    assert spot_card([xln, original], NOTES, SET_NAMES)["l1:nonfoil"].symbol_set == "xln"

def test_list_card_with_unknown_prefix_leaves_out_the_symbol():
    xln = make("l1", set_code="plst", set_name="The List", collector_number="XLN-217")
    odd = make("z1", set_code="plst", set_name="The List", collector_number="ZZZ-1")
    spots = spot_card([xln, odd], NOTES, SET_NAMES)
    assert (spots["z1:nonfoil"].look_for, spots["z1:nonfoil"].same_as, spots["z1:nonfoil"].symbol_set) == ("", ("l1:nonfoil",), None)
    assert spots["l1:nonfoil"].look_for == "Ixalan set symbol"

def test_holo_stamps():
    assert lines(make("h", security_stamp="oval"), make("n")) == {"h:nonfoil": "oval holo stamp", "n:nonfoil": "no holo stamp"}
    assert lines(make("a", security_stamp="acorn"), make("t", security_stamp="triangle")) == {
        "a:nonfoil": "acorn stamp", "t:nonfoil": "triangle holo stamp"}

def test_card_backs():
    assert lines(make("s"), make("d", card_back_id=None), make("u", card_back_id="other-back")) == {
        "s:nonfoil": "regular card back", "d:nonfoil": "no card back (double-faced)",
        "u:nonfoil": "non-standard card back"}

def test_set_symbol_respects_except_langs():
    assert lines(make("f1", set_code="5ed", set_name="Fifth Edition"), make("t1")) == {
        "f1:nonfoil": "no set symbol", "t1:nonfoil": "Test Set set symbol"}
    assert lines(make("f2", set_code="5ed", set_name="Fifth Edition", lang="zhs"), make("t2", lang="zhs")) == {
        "f2:nonfoil": "Fifth Edition set symbol", "t2:nonfoil": "Test Set set symbol"}

def test_collector_numbers():
    assert lines(make("c1", collector_number="123"), make("c2", collector_number="124")) == {
        "c1:nonfoil": "collector number 123", "c2:nonfoil": "collector number 124"}
    assert lines(make("s1", collector_number="67★"), make("s2", collector_number="68")) == {
        "s1:nonfoil": "collector number 67", "s2:nonfoil": "collector number 68"}
    assert lines(make("p1", collector_number="1p"), make("p2", collector_number="2s")) == {
        "p1:nonfoil": "collector number 1", "p2:nonfoil": "collector number 2"}

def test_no_collector_numbers_before_the_cutoff_or_for_sets_without_them():
    for kw in ({"released_at": "1997-01-01"}, {"set_code": "nox", "released_at": "2000-01-01"}):
        spots = spot_card([make("a", collector_number="1", **kw), make("b", collector_number="2", **kw)], NOTES, SET_NAMES)
        assert (spots["a:nonfoil"].look_for, spots["a:nonfoil"].same_as) == ("", ("b:nonfoil",))

def test_art_year_when_one_artist_drew_two_arts():
    assert lines(make("a1", illustration_id="ill-1", released_at="1993-08-05"),
                 make("a2", illustration_id="ill-2", released_at="2020-01-01")) == {
        "a1:nonfoil": "art by Ann Artist (1993 art)", "a2:nonfoil": "art by Ann Artist (2020 art)"}

def test_unknown_scryfall_values_still_read():
    assert lines(make("r", border_color="rainbow"), make("b")) == {"r:nonfoil": "rainbow border", "b:nonfoil": "black border"}
    assert lines(make("f", frame="2030"), make("m")) == {"f:nonfoil": "2030 frame", "m:nonfoil": "M15 frame"}
    assert lines(make("s", security_stamp="star"), make("n")) == {"s:nonfoil": "star stamp", "n:nonfoil": "no holo stamp"}
    assert lines(make("x", lang="xx"), make("e")) == {"x:nonfoil": "language code xx", "e:nonfoil": "English"}


def _same_year_arts(**kw):
    return [make("s1", illustration_id="ill-1", collector_number="1", released_at="2026-01-01", **kw),
            make("s2", illustration_id="ill-2", collector_number="2", released_at="2026-01-01", **kw)]

def test_arts_that_print_the_same_do_not_rule_each_other_out():
    # Same artist, same first year: the art words match, so collector number tells them apart.
    assert lines(*_same_year_arts()) == {
        "s1:nonfoil": "collector number 1", "s2:nonfoil": "collector number 2"}

def test_same_year_arts_without_collector_numbers_look_the_same():
    old = [make("s1", illustration_id="ill-1", collector_number="1", released_at="1997-01-01"),
           make("s2", illustration_id="ill-2", collector_number="2", released_at="1997-01-01")]
    spots = spot_card(old, NOTES, SET_NAMES)
    assert (spots["s1:nonfoil"].look_for, spots["s1:nonfoil"].same_as) == ("", ("s2:nonfoil",))
    assert (spots["s2:nonfoil"].look_for, spots["s2:nonfoil"].same_as) == ("", ("s1:nonfoil",))

def test_different_nonstandard_back_ids_with_the_same_words_look_the_same():
    spots = spot_card([make("x", card_back_id="back-x"), make("y", card_back_id="back-y")], NOTES, SET_NAMES)
    assert (spots["x:nonfoil"].look_for, spots["x:nonfoil"].same_as) == ("", ("y:nonfoil",))
    assert (spots["y:nonfoil"].look_for, spots["y:nonfoil"].same_as) == ("", ("x:nonfoil",))

def test_world_championship_numbers_are_not_printed_so_they_are_not_said():
    spots = spot_card([make("k", set_code="wc99", collector_number="kb315"),
                       make("m", set_code="wc99", collector_number="mlp315")], NOTES, SET_NAMES)
    assert (spots["k:nonfoil"].look_for, spots["k:nonfoil"].same_as) == ("", ("m:nonfoil",))
    assert (spots["m:nonfoil"].look_for, spots["m:nonfoil"].same_as) == ("", ("k:nonfoil",))

def test_a_sets_back_note_applies_even_to_the_standard_back_id():
    assert lines(make("c", set_code="ced"), make("l", set_code="leb")) == {
        "c:nonfoil": "Collectors' Edition back", "l:nonfoil": "regular card back"}
