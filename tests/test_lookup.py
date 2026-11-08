import pytest

from bindiver.mtg.lookup import Version, sort_versions


def versions(rows):
    """(set_code, collector_number, finish, price_cents) tuples, in result order."""
    return [(v.set_code, v.collector_number, v.finish, v.price_cents) for v in rows]


def only_group(result):
    assert len(result.groups) == 1
    return result.groups[0]


def test_returns_versions_at_or_above_price(catalog):
    group = only_group(catalog.lookup("Fireball", 10))
    assert group.name == "Fireball"
    assert versions(group.qualifying) == [
        ("lea", "144", "nonfoil", 40000),
        ("m10", "136", "foil", 1250),
    ]


def test_price_exactly_at_threshold_qualifies(catalog):
    group = only_group(catalog.lookup("Fireball", 12.50))
    assert ("m10", "136", "foil", 1250) in versions(group.qualifying)


def test_unpriced_versions_are_listed_not_hidden(catalog):
    group = only_group(catalog.lookup("Fireball", 10))
    assert versions(group.unpriced) == [
        ("fbb", "150", "nonfoil", None),
        ("sld", "999", "etched", None),
    ]


def test_digital_only_printings_are_excluded(catalog):
    group = only_group(catalog.lookup("Fireball", 0))
    sets = {v.set_code for v in group.qualifying + group.unpriced}
    assert "anb" not in sets
    # lea nonfoil, m10 nonfoil+foil, sld foil+etched, fbb nonfoil
    assert group.total_versions == 6


def test_token_name_is_reported_as_a_token(catalog):
    result = catalog.lookup("Goblin", 0)
    assert result.match == "token"
    assert result.groups == []


def test_token_name_is_not_corrected_to_a_similar_real_card(catalog):
    # "Warrior" is a token; the closest real card name is "Warriors".
    assert catalog.lookup("Warrior", 0).match == "token"


def test_misread_token_name_is_still_a_token(catalog):
    assert catalog.lookup("Warrlor", 0).match == "token"


def test_blank_name_card_is_not_matched_by_the_word_alone(catalog):
    assert only_group(catalog.lookup("_____ Goblin", 10)).name == "_____ Goblin"
    assert catalog.lookup("Goblin", 10).match == "token"


def test_face_name_finds_split_card(catalog):
    result = catalog.lookup("Fire", 10)
    group = only_group(result)
    assert result.match == "exact"
    assert group.name == "Fire // Ice"
    assert versions(group.qualifying) == [("apc", "128", "foil", 2000)]


def test_full_split_name_typed_without_spaces(catalog):
    assert only_group(catalog.lookup("fire//ice", 10)).name == "Fire // Ice"


def test_front_face_finds_double_faced_card(catalog):
    group = only_group(catalog.lookup("Delver of Secrets", 10))
    assert versions(group.qualifying) == [("isd", "51", "foil", 1500)]


def test_reversible_card_gets_oracle_id_from_its_faces(catalog):
    group = only_group(catalog.lookup("Bob", 10))
    assert group.oracle_id == "bob-oracle"
    assert versions(group.qualifying) == [("sld", "1001", "foil", 2000)]


def test_ligature_and_accent_spellings_match_exactly(catalog):
    assert catalog.lookup("Æther Vial", 10).match == "exact"
    assert catalog.lookup("Lim-Dul's Vault", 1).match == "exact"


def test_misspelled_name_falls_back_to_fuzzy_match(catalog):
    result = catalog.lookup("Firebal", 10)
    assert result.match == "fuzzy"
    assert only_group(result).name == "Fireball"


def test_unknown_name_returns_no_match(catalog):
    result = catalog.lookup("Xyzzy Plugh", 10)
    assert result.match == "none"
    assert result.groups == []


def test_same_name_with_different_oracle_ids_returns_one_group_each(catalog):
    result = catalog.lookup("Very Cryptic Command", 0)
    assert sorted(g.oracle_id for g in result.groups) == ["vcc-oracle-a", "vcc-oracle-b"]


def test_result_carries_price_date(catalog):
    assert catalog.lookup("Fireball", 10).price_date == "2026-11-03"


def test_group_is_named_after_the_card_not_a_reversible_printing(catalog):
    # Reversible printings are named "Bob // Bob"; the card itself is "Bob".
    assert only_group(catalog.lookup("Bob", 10)).name == "Bob"


def test_lookup_returns_spot_text_for_each_version(cs_catalog):
    leb = only_group(cs_catalog.lookup("Counterspell", 25)).qualifying[0]
    assert (leb.key, leb.look_for, leb.notes, leb.same_as, leb.frame_group) == (
        "cs-leb:nonfoil", "art by Mark Poole, black border, nonfoil, English, regular card back",
        ("Beta's corners are less rounded than Alpha's.",), (), "old-1993")


def test_look_alikes_resolve_to_priced_versions(cs_catalog):
    group = only_group(cs_catalog.lookup("Counterspell", 25))
    unlimited = next(v for v in group.qualifying if v.set_code == "2ed")
    assert unlimited.same_as == ("cs-3ed:nonfoil",)
    revised = group.versions_by_key["cs-3ed:nonfoil"]
    assert (revised.set_name, revised.collector_number, revised.price_cents) == ("Revised Edition", "54", 597)


def test_set_icon_follows_the_printed_symbol(cs_catalog):
    by_key = only_group(cs_catalog.lookup("Counterspell", 0)).versions_by_key
    assert [(by_key[k].symbol_set, by_key[k].symbol_icon) for k in
            ("cs-7ed:nonfoil", "cs-lea:nonfoil", "cs-mmq:foil")] == [
        ("7ed", "https://svgs.scryfall.io/sets/7ed.svg"), ("none", None), ("mmq", None)]


def test_lookup_includes_the_value_summary(cs_catalog):
    assert only_group(cs_catalog.lookup("Counterspell", 25)).summary == (
        "Value sits in old-border 1993-frame nonfoils (4 of 6) and old-border 1997-frame foils (2 of 2)."
    )


def _sets(rows):
    return [v.set_code for v in rows]


def test_lookup_lists_versions_oldest_first_by_default(cs_catalog):
    group = only_group(cs_catalog.lookup("Counterspell", 25))
    assert _sets(group.qualifying) == ["leb", "2ed", "ced", "fbb", "mmq", "7ed"]


def test_lookup_can_list_newest_first(cs_catalog):
    group = only_group(cs_catalog.lookup("Counterspell", 25, order="newest"))
    assert _sets(group.qualifying) == ["7ed", "mmq", "fbb", "ced", "2ed", "leb"]


def test_lookup_can_list_by_price_with_equal_prices_oldest_first(cs_catalog):
    group = only_group(cs_catalog.lookup("Counterspell", 25, order="price"))
    assert _sets(group.qualifying) == ["leb", "7ed", "mmq", "2ed", "ced", "fbb"]


def test_unpriced_versions_follow_the_date_order_and_stay_oldest_first_by_price(catalog):
    assert _sets(only_group(catalog.lookup("Fireball", 10)).unpriced) == ["fbb", "sld"]
    assert _sets(only_group(catalog.lookup("Fireball", 10, order="newest")).unpriced) == ["sld", "fbb"]
    assert _sets(only_group(catalog.lookup("Fireball", 10, order="price")).unpriced) == ["fbb", "sld"]


def test_same_set_versions_go_by_collector_number_then_nonfoil_foil_etched():
    def v(number, finish):
        return Version(scryfall_id=number, set_code="sld", set_name="Secret Lair Drop",
                       collector_number=number, released_at="2022-01-01", lang="en",
                       finish=finish, price_cents=100)

    shuffled = [v("10", "nonfoil"), v("9", "etched"), v("9★", "foil"), v("9", "foil"), v("9", "nonfoil")]
    assert [(x.collector_number, x.finish) for x in sort_versions(shuffled)] == [
        ("9", "nonfoil"), ("9", "foil"), ("9", "etched"), ("9★", "foil"), ("10", "nonfoil")]


def test_sort_versions_rejects_an_unknown_order():
    with pytest.raises(ValueError):
        sort_versions([], "cheapest")
