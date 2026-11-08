from bindiver.mtg.lookup import Version
from bindiver.mtg.summary import summarize


def vs(*specs):
    """specs: (frame_group, finish, [price_cents...]) -> Versions."""
    out = []
    for group, finish, prices in specs:
        for p in prices:
            i = len(out)
            out.append(Version(scryfall_id=f"v{i}", set_code="tst", set_name="Test", collector_number=str(i),
                               released_at="2020-01-01", lang="en", finish=finish, price_cents=p, frame_group=group))
    return out


def test_no_version_qualifies():
    assert summarize(vs(("m15", "nonfoil", [100, 200]), ("m15", "foil", [None])), 2500) == "No version is $25.00+. 1 unpriced."
    assert summarize(vs(("m15", "nonfoil", [100])), 2500) == "No version is $25.00+."


def test_almost_every_version():
    assert summarize(vs(("m15", "nonfoil", [3000] * 4 + [None])), 2500) == (
        "Almost every version is $25.00+ (4 of 5). Check any copy.")


def test_counterspell_shape_where_it_is_and_single_finish_skips():
    versions = vs(("old-1993", "nonfoil", [3000] * 7 + [100] * 5 + [None] * 2),
                  ("old-1997", "foil", [3000] * 3), ("old-1997", "nonfoil", [100] * 17),
                  ("modern", "foil", [3000]), ("modern", "nonfoil", [100]),
                  ("future", "foil", [3000]), ("future", "nonfoil", [100]),
                  ("m15", "foil", [3000] * 5 + [100] * 23 + [None]), ("m15", "nonfoil", [3000] * 4 + [100] * 30),
                  ("retro", "foil", [100] * 3), ("retro", "nonfoil", [100, None]))
    assert summarize(versions, 2500) == (
        "Value sits in old-border 1993-frame nonfoils (7 of 14) and old-border 1997-frame foils (3 of 3). "
        "Skip old-border 1997-frame nonfoils and retro-frame foils (0 of 20).")


def test_whole_frame_skips_share_cards_and_keep_the_four_largest():
    versions = vs(("old-1993", "nonfoil", [1500] * 4 + [100] * 13),
                  ("old-1997", "nonfoil", [100] * 10), ("old-1997", "foil", [100] * 2),
                  ("modern", "nonfoil", [100] * 8), ("modern", "foil", [100] * 4),
                  ("m15", "nonfoil", [100] * 20), ("m15", "foil", [100] * 15),
                  ("future", "nonfoil", [100] * 3),
                  ("retro", "foil", [100] * 5), ("retro", "nonfoil", [100, None]))
    assert summarize(versions, 1000) == (
        "Value sits in old-border 1993-frame nonfoils (4 of 17). "
        "Skip old-border 1997-frame, modern-frame and M15-frame cards, and retro-frame foils (0 of 64).")


def test_group_with_an_unpriced_version_is_never_a_skip():
    versions = vs(("old-1993", "nonfoil", [3000, 3000, 100, 100]),
                  ("m15", "nonfoil", [100] * 4 + [None]), ("m15", "foil", [100] * 3))
    assert summarize(versions, 2500) == "Value sits in old-border 1993-frame nonfoils (2 of 4). Skip M15-frame foils (0 of 3)."


def test_retro_printings_are_their_own_group():
    assert summarize(vs(("old-1997", "nonfoil", [3000] * 3), ("retro", "nonfoil", [100] * 3)), 2500) == (
        "Value sits in old-border 1997-frame nonfoils (3 of 3). Skip retro-frame cards (0 of 3).")


def test_etched_counts_as_foil():
    assert summarize(vs(("m15", "etched", [3000] * 3), ("m15", "nonfoil", [100] * 7)), 2500) == (
        "Value sits in M15-frame foils (3 of 3). Skip M15-frame nonfoils (0 of 7).")
