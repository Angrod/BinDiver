from bindiver.mtg import bulk_data
from bindiver.mtg.bulk_data import fetch_set_icons
from bindiver.mtg.selftest import CLASSICS, pick_names, render_html


def test_pick_names_takes_classics_then_evenly_spaced_alerts():
    alerts = sorted([f"Card {i:02d}" for i in range(25)] + ["Counterspell"])
    counts = {name: 5 for name in alerts} | {"Card 03": 31}
    assert pick_names(alerts, counts) == list(CLASSICS) + [
        "Card 00", "Card 04", "Card 06", "Card 09", "Card 11",
        "Card 14", "Card 16", "Card 19", "Card 21", "Card 24"]


def test_render_html_shows_set_name_icon_and_look_for(cs_catalog):
    html = render_html(cs_catalog, ["Counterspell"], 25, icons={"7ed": b"<svg>7</svg>"})
    assert "Limited Edition Beta" in html
    assert "art by Mark Poole, black border, nonfoil, English, Collectors&#x27; Edition back" in html
    assert 'src="data:image/svg+xml;base64,PHN2Zz43PC9zdmc+"' in html
    assert "no set symbol" in html
    assert "https://scryfall.com/card/7ed/67%E2%98%85" in html


def test_render_html_marks_a_name_that_is_not_an_exact_match(cs_catalog):
    html = render_html(cs_catalog, ["Counterspel"], 25, icons={})
    assert "Counterspel" in html
    assert "not found" in html


def test_fetch_set_icons_downloads_only_missing_files(tmp_path, monkeypatch):
    (tmp_path / "set_icons").mkdir()
    (tmp_path / "set_icons" / "lea.svg").write_bytes(b"<svg>old</svg>")
    asked = []

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return b"<svg>new</svg>"

    monkeypatch.setattr(bulk_data, "_get", lambda url: asked.append(url) or Resp())
    monkeypatch.setattr(bulk_data.time, "sleep", lambda s: None)
    got = fetch_set_icons({"lea": "https://x/lea.svg?1", "7ed": "https://x/7ed.svg?1"}, tmp_path)
    assert asked == ["https://x/7ed.svg?1"]
    assert got == {"lea": b"<svg>old</svg>", "7ed": b"<svg>new</svg>"}
    assert (tmp_path / "set_icons" / "7ed.svg").read_bytes() == b"<svg>new</svg>"


def _short_rows(html):
    import re
    return re.findall(r'<button type="button" class="vshort"[^>]*>(.*?)</button>', html, re.S)


def test_render_html_gives_every_version_a_shorthand_row(cs_catalog):
    rows = _short_rows(render_html(cs_catalog, ["Counterspell"], 25, icons={"7ed": b"<svg>7</svg>"}))
    assert len(rows) == 7  # six qualifying and one unpriced
    seventh = next(r for r in rows if "Seventh Edition" in r)
    assert 'src="data:image/svg+xml;base64,PHN2Zz43PC9zdmc+"' in seventh
    assert '<span class="tag">foil</span>' in seventh
    assert "$155.00" in seventh
    assert "Look for" not in seventh


def test_shorthand_rows_tag_only_foil_and_etched(cs_catalog):
    rows = _short_rows(render_html(cs_catalog, ["Counterspell"], 25, icons={}))
    beta = next(r for r in rows if "Limited Edition Beta" in r)
    assert "no set symbol" in beta
    assert "$919.92" in beta
    assert 'class="tag"' not in beta
    alpha = next(r for r in rows if "Limited Edition Alpha" in r)
    assert "unpriced" in alpha


def test_render_html_has_a_remembered_shorthand_switch_and_open_sections(cs_catalog):
    html = render_html(cs_catalog, ["Counterspell"], 25, icons={})
    assert '<button type="button" id="mode" aria-pressed="false">Shorthand</button>' in html
    assert '"bindiver-shorthand"' in html
    assert '<details class="unpriced" open><summary>Unpriced (1)</summary>' in html
    assert '<details class="terms" open><summary>Terms to check</summary>' in html


def test_render_html_lists_oldest_first_and_carries_the_other_orders(cs_catalog):
    import re
    html = render_html(cs_catalog, ["Counterspell"], 25, icons={})
    found = re.findall(r'<li class="ver" data-oldest="(\d+)" data-newest="(\d+)" data-price="(\d+)">'
                       r'.*?<span class="setname">(.*?)</span>', html, re.S)
    assert [(int(o), int(n), int(p), name) for o, n, p, name in found] == [
        (0, 5, 0, "Limited Edition Beta"),
        (1, 4, 3, "Unlimited Edition"),
        (2, 3, 4, "Collectors&#x27; Edition"),
        (3, 2, 5, "Foreign Black Border"),
        (4, 1, 2, "Mercadian Masques"),
        (5, 0, 1, "Seventh Edition"),
        (0, 0, 0, "Limited Edition Alpha"),  # the unpriced list is ranked on its own
    ]


def test_render_html_has_a_remembered_sort_control(cs_catalog):
    html = render_html(cs_catalog, ["Counterspell"], 25, icons={})
    assert ('<select id="sort" aria-label="Sort versions"><option value="oldest">Oldest first</option>'
            '<option value="newest">Newest first</option>'
            '<option value="price">Highest price</option></select>') in html
    assert '"bindiver-sort"' in html
