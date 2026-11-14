import pytest

from bindiver.mtg.lookup import CardGroup, Version
from bindiver.mtg.quiet import QUIET_KINDS, alert_strength, quiet_kind, quiet_kinds_of


@pytest.mark.parametrize("frame_group, set_name, promos, kind", [
    ("old-1993", "Limited Edition Alpha", [], "old border"),
    ("old-1997", "Mercadian Masques", ["serialized"], "old border"),
    ("modern", "Secret Lair Drop", ["serialized"], "Secret Lair"),
    ("m15", "Secret Lair: Ultimate Edition", [], "Secret Lair"),
    ("m15", "Brothers' War Retro Artifacts", ["serialized"], "serialized"),
    ("retro", "Dominaria Remastered", [], ""),
    ("m15", "Lairs of the Secret", [], ""),
])
def test_quiet_kind(frame_group, set_name, promos, kind):
    assert quiet_kind(frame_group, set_name, promos) == kind


def test_quiet_kinds_constant():
    assert QUIET_KINDS == ("old border", "Secret Lair", "serialized")


def version(kind, cents=2000, n="1"):
    return Version(scryfall_id=n, set_code="x", set_name="X", collector_number=n, released_at="2000-01-01",
                   lang="en", finish="nonfoil", price_cents=cents, quiet_kind=kind)


def group(qualifying=(), unpriced=()):
    return CardGroup(oracle_id="o", name="N", qualifying=list(qualifying), unpriced=list(unpriced),
                     total_versions=len(qualifying) + len(unpriced))


def test_no_qualifying_versions_means_none():
    assert alert_strength([group()]) == "none"
    assert quiet_kinds_of([group()]) == []


def test_unpriced_old_border_version_alone_is_none():
    g = group(unpriced=[version("old border", cents=None)])
    assert alert_strength([g]) == "none"
    assert quiet_kinds_of([g]) == []


def test_one_ordinary_version_makes_it_full():
    g = group([version("old border", n="1"), version("", n="2"), version("old border", n="3")])
    assert alert_strength([g]) == "full"
    assert quiet_kinds_of([g]) == []


def test_all_quiet_versions_make_a_quiet_alert_with_kinds_in_order():
    g = group([version("serialized", n="1"), version("old border", n="2"), version("old border", n="3")])
    assert alert_strength([g]) == "quiet"
    assert quiet_kinds_of([g]) == ["old border", "serialized"]


def test_one_full_group_among_quiet_ones_makes_it_full():
    a = group([version("old border", n="1")])
    b = group([version("old border", n="2"), version("", n="3")])
    assert alert_strength([a, b]) == "full"
    assert quiet_kinds_of([a, b]) == []
