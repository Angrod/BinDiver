"""Matt's self-test page: 20 cards, each version's set icon, set name and look-for text, with a shorthand switch."""

import base64
import html as htmllib
import urllib.parse

from .lookup import SORT_ORDERS, sort_versions
from .money import dollars
from .report import _cents, _detail_lines, _label

SORT_LABELS = {"oldest": "Oldest first", "newest": "Newest first", "price": "Highest price"}

CLASSICS = (
    "Fireball", "Counterspell", "Birds of Paradise", "Lightning Bolt", "Sol Ring",
    "Llanowar Elves", "Dark Ritual", "Swords to Plowshares", "Brainstorm", "Fire // Ice",
)
MAX_LISTED = 30  # bulk picks with more listed versions than this (basic lands) are skipped
BULK_PICKS = 10

TERMS_TO_CHECK = (
    '"old border (1993 frame)" vs. "retro frame"',
    '"serialized"',
    '"ripple foil" and "silver foil"',
    'whether lines like "black border, old border (1993 frame)" read clearly with "border" twice',
)


def pick_names(alert_names, listed_counts):
    """The classics, then ten evenly spaced bulk alerts (not classics, not over MAX_LISTED)."""
    pool = [n for n in alert_names if n not in CLASSICS and listed_counts[n] <= MAX_LISTED]
    last = BULK_PICKS - 1
    picks = [pool[round(i * (len(pool) - 1) / last)] for i in range(BULK_PICKS)] if pool else []
    return list(CLASSICS) + list(dict.fromkeys(picks))


def _e(text):
    return htmllib.escape(str(text))


def _icon_html(version, icons):
    if version.symbol_set == "none":
        return '<span class="nosym">no set symbol</span>'
    svg = icons.get(version.symbol_set) if version.symbol_set else None
    if svg is None:
        return ""
    b64 = base64.b64encode(svg).decode("ascii")
    return f'<img class="sym" src="data:image/svg+xml;base64,{b64}" alt="{_e(version.set_name)} symbol">'


def _version_list_html(versions, group, icons):
    """A list in the order given (oldest first), each entry carrying its rank in every sort order."""
    ranks = {order: {v.key: i for i, v in enumerate(sort_versions(versions, order))}
             for order in SORT_ORDERS}
    return '<ul class="versions">' + "".join(
        _version_html(v, group, icons, {order: ranks[order][v.key] for order in SORT_ORDERS})
        for v in versions) + "</ul>"


def _version_html(version, group, icons, ranks):
    """One version: a header row (the whole entry in shorthand, tap to open) and its full text.

    The header button stays disabled until the page script turns shorthand on. `ranks` gives
    the version's place in each sort order, so the page can re-sort without its own rules.
    """
    price = dollars(version.price_cents) if version.price_cents is not None else "unpriced"
    link = f"https://scryfall.com/card/{version.set_code}/{urllib.parse.quote(version.collector_number)}"
    details = "".join(f"<li>{_e(line)}</li>" for line in _detail_lines(version, group))
    tag = f'<span class="tag">{_e(version.finish)}</span>' if version.finish != "nonfoil" else ""
    data = "".join(f' data-{order}="{ranks[order]}"' for order in SORT_ORDERS)
    return (
        f'<li class="ver"{data}>'
        f'<button type="button" class="vshort" disabled>{_icon_html(version, icons)}'
        f'<span class="setname">{_e(version.set_name)}</span>{tag}'
        f'<span class="price">{_e(price)}</span></button>'
        '<div class="vbody">'
        f'<div class="meta">{_e(_label(version))} &middot; {_e(version.finish)} &middot; '
        f'<span class="price">{_e(price)}</span> &middot; '
        f'<a href="{_e(link)}" target="_blank" rel="noopener">Scryfall image</a></div>'
        f'<ul class="detail">{details}</ul></div></li>'
    )


def _card_html(index, name, catalog, min_price, icons):
    result = catalog.lookup(name, min_price)
    if result.match != "exact":
        body = '<p class="missing">Card not found. Skip it and mark it Fail.</p>'
        shown = name
    else:
        parts = []
        for group in result.groups:
            parts.append(
                f'<p class="summary"><strong>{_e(group.name)}</strong>: {len(group.qualifying)} of '
                f"{group.total_versions} versions worth finding at {_e(dollars(_cents(min_price)))}+. "
                f"{_e(group.summary)}</p>"
            )
            if group.qualifying:
                parts.append(_version_list_html(group.qualifying, group, icons))
            if group.unpriced:
                parts.append(
                    f'<details class="unpriced" open><summary>Unpriced ({len(group.unpriced)})</summary>'
                    + _version_list_html(group.unpriced, group, icons) + "</details>")
        body = "".join(parts)
        shown = result.groups[0].name if result.groups else name
    return (
        f'<section class="card" data-name="{_e(name)}">'
        f"<h2>{_e(shown)}</h2>{body}"
        '<div class="marks">'
        '<button type="button" class="mark pass" data-mark="pass">Pass</button>'
        '<button type="button" class="mark fail" data-mark="fail">Fail</button>'
        "</div></section>"
    )


def render_html(catalog, names, min_price, icons):
    cards = "".join(_card_html(i, n, catalog, min_price, icons) for i, n in enumerate(names))
    terms = "".join(f"<li>{_e(t)}</li>" for t in TERMS_TO_CHECK)
    sort_options = "".join(f'<option value="{o}">{SORT_LABELS[o]}</option>' for o in SORT_ORDERS)
    return (
        PAGE_HEAD
        + f"<h1>BinDiver Self-Test</h1>"
        f'<p class="intro">{len(names)} cards at ${float(min_price):,.2f}+. For each card, read the text and decide: '
        "could you pick out every listed version from the words alone? Tap Pass or Fail. "
        "Basic lands and other cards with more than "
        f"{MAX_LISTED} listed versions were left out of the bulk picks.</p>"
        f'<details class="terms" open><summary>Terms to check</summary><ul>{terms}</ul></details>'
        + cards
        + '<div class="results"><button type="button" id="copy">Copy results</button>'
        '<span id="tally" aria-live="polite"></span></div>'
        '<div class="bar"><button type="button" id="mode" aria-pressed="false">Shorthand</button>'
        f'<select id="sort" aria-label="Sort versions">{sort_options}</select></div>'
        + PAGE_SCRIPT
    )


PAGE_HEAD = """<title>BinDiver Self-Test</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* Layout: one narrow reading column; each card is a bordered block with its versions as a list and Pass/Fail at the foot. */
:root {
  --bg: #f6f6f3;
  --surface: #ffffff;
  --fg: #1d2421;
  --muted: #5d6a64;
  --line: #d8ddd9;
  --accent: #1f5f4a;
  --pass: #1b7a43;
  --fail: #b3362c;
  --pass-bg: #e3f3e8;
  --fail-bg: #f9e4e1;
  --font-body: system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-data: ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #121714; --surface: #1b221e; --fg: #e6ebe7; --muted: #9aa8a0; --line: #2f3a34;
    --accent: #6fcaa6; --pass: #5fd08a; --fail: #ff8d80; --pass-bg: #16301f; --fail-bg: #3a1f1c;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #121714; --surface: #1b221e; --fg: #e6ebe7; --muted: #9aa8a0; --line: #2f3a34;
  --accent: #6fcaa6; --pass: #5fd08a; --fail: #ff8d80; --pass-bg: #16301f; --fail-bg: #3a1f1c;
  color-scheme: dark;
}
body {
  background: var(--bg); color: var(--fg); font-family: var(--font-body);
  font-size: 16px; line-height: 1.45;
  padding-block: 20px 40px;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  max-width: 44rem; margin-inline: auto;
}
h1 { font-size: 1.6rem; margin: 0 0 8px; text-wrap: balance; }
h2 { font-size: 1.2rem; margin: 0 0 8px; text-wrap: balance; }
.intro { color: var(--muted); margin: 0 0 16px; }
summary { cursor: pointer; }
.terms { border: 1px solid var(--accent); border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; background: var(--surface); }
.terms > summary { font-size: 1.2rem; font-weight: 600; }
.terms ul { margin: 8px 0 0; padding-left: 1.2em; }
.unpriced > summary { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); padding: 12px 0 8px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; min-width: 0; }
.card.is-pass { border-color: var(--pass); }
.card.is-fail { border-color: var(--fail); }
.summary { margin: 0 0 10px; color: var(--muted); }
.summary strong { color: var(--fg); }
.versions { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.ver { border-top: 1px solid var(--line); padding-top: 10px; min-width: 0; }
/* Version header: a plain heading in the full view, the whole tappable row in shorthand. */
.vshort { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 0; padding: 0; border: 0; border-radius: 0; background: none; color: inherit; font-weight: 600; text-align: left; }
.vshort:disabled { cursor: default; }
.vshort .setname { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.vshort .tag, .vshort .price { display: none; }
.tag { flex: none; font-size: 0.75rem; color: var(--accent); border: 1px solid var(--accent); border-radius: 4px; padding: 0 5px; }
body.short .versions { gap: 0; }
body.short .ver { padding-top: 0; }
body.short .vshort { min-height: 48px; cursor: pointer; }
body.short .vshort .tag { display: inline-block; }
body.short .vshort .price { display: inline; flex: none; font-family: var(--font-data); font-variant-numeric: tabular-nums; }
body.short .vshort::after { content: "\\25B8"; flex: none; color: var(--muted); font-weight: 400; }
body.short .ver.open .vshort::after { content: "\\25BE"; }
body.short .vbody { display: none; padding-bottom: 12px; }
body.short .ver.open .vbody { display: block; }
.sym { width: 1.2em; height: 1.2em; flex: none; }
.nosym { flex: none; white-space: nowrap; font-size: 0.75rem; font-weight: 400; color: var(--muted); border: 1px dashed var(--line); border-radius: 4px; padding: 0 5px; }
.meta { font-family: var(--font-data); font-size: 0.82rem; color: var(--muted); margin-top: 2px; overflow-wrap: anywhere; }
.price { color: var(--fg); }
a { color: var(--accent); }
.detail { margin: 6px 0 0; padding-left: 1.1em; }
.detail li { margin-bottom: 2px; overflow-wrap: anywhere; }
.missing { color: var(--fail); }
.marks { display: flex; gap: 10px; margin-top: 14px; }
button { font: inherit; min-height: 44px; padding: 0 20px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--fg); cursor: pointer; }
button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.marks button { flex: 1; font-weight: 600; }
.mark.pass[aria-pressed="true"] { background: var(--pass-bg); border-color: var(--pass); color: var(--pass); }
.mark.fail[aria-pressed="true"] { background: var(--fail-bg); border-color: var(--fail); color: var(--fail); }
.results { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 4px; }
/* View controls stay in thumb reach at the bottom of the screen. */
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; position: sticky; bottom: 0; padding-block: 12px; background: var(--bg); }
select { font: inherit; min-height: 44px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--fg); }
select:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
#copy { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
#mode { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; }
#mode::before { content: ""; width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; }
#mode[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
#mode[aria-pressed="true"]::before { background: currentColor; }
#tally { color: var(--muted); }
</style>
"""

PAGE_SCRIPT = """<script>
(function () {
  var KEY = "bindiver-selftest-marks";
  var marks = {};
  try { marks = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { marks = {}; }
  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  var tally = document.getElementById("tally");
  var copyBtn = document.getElementById("copy");

  function save() { try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch (e) {} }
  function paint() {
    var pass = 0, fail = 0;
    cards.forEach(function (card) {
      var m = marks[card.dataset.name];
      card.classList.toggle("is-pass", m === "pass");
      card.classList.toggle("is-fail", m === "fail");
      card.querySelectorAll(".mark").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.mark === m));
      });
      if (m === "pass") pass++;
      if (m === "fail") fail++;
    });
    tally.textContent = pass + " pass, " + fail + " fail, " + (cards.length - pass - fail) + " to go";
  }
  function summary() {
    var pass = 0, failed = [];
    cards.forEach(function (card) {
      var m = marks[card.dataset.name];
      if (m === "pass") pass++;
      if (m === "fail") failed.push(card.dataset.name);
    });
    return "Pass " + pass + " of " + cards.length + ". Failed: " + (failed.length ? failed.join(", ") : "none");
  }
  cards.forEach(function (card) {
    card.querySelectorAll(".mark").forEach(function (b) {
      b.addEventListener("click", function () {
        marks[card.dataset.name] = b.dataset.mark;
        save(); paint();
      });
    });
  });
  var MODE_KEY = "bindiver-shorthand";
  var modeBtn = document.getElementById("mode");
  var rows = Array.prototype.slice.call(document.querySelectorAll(".vshort"));
  var short = false;
  try { short = localStorage.getItem(MODE_KEY) === "1"; } catch (e) { short = false; }
  function applyMode() {
    document.body.classList.toggle("short", short);
    modeBtn.setAttribute("aria-pressed", String(short));
    rows.forEach(function (b) {
      b.disabled = !short;
      if (short) b.setAttribute("aria-expanded", String(b.parentNode.classList.contains("open")));
      else b.removeAttribute("aria-expanded");
    });
    document.querySelectorAll("details.unpriced, details.terms").forEach(function (d) { d.open = !short; });
  }
  modeBtn.addEventListener("click", function () {
    short = !short;
    try { localStorage.setItem(MODE_KEY, short ? "1" : "0"); } catch (e) {}
    applyMode();
  });
  rows.forEach(function (b) {
    b.addEventListener("click", function () {
      if (!short) return;
      b.setAttribute("aria-expanded", String(b.parentNode.classList.toggle("open")));
    });
  });
  applyMode();
  var SORT_KEY = "bindiver-sort";
  var sortSel = document.getElementById("sort");
  var order = "oldest";
  try { order = localStorage.getItem(SORT_KEY) || "oldest"; } catch (e) { order = "oldest"; }
  if (!sortSel.querySelector('option[value="' + order + '"]')) order = "oldest";
  function applySort() {
    sortSel.value = order;
    document.querySelectorAll(".versions").forEach(function (list) {
      var items = Array.prototype.slice.call(list.children);
      items.sort(function (a, b) { return Number(a.dataset[order]) - Number(b.dataset[order]); });
      items.forEach(function (li) { list.appendChild(li); });
    });
  }
  sortSel.addEventListener("change", function () {
    order = sortSel.value;
    try { localStorage.setItem(SORT_KEY, order); } catch (e) {}
    applySort();
  });
  applySort();
  copyBtn.addEventListener("click", function () {
    var text = summary();
    var done = function () { copyBtn.textContent = "Copied"; setTimeout(function () { copyBtn.textContent = "Copy results"; }, 1500); };
    var fallback = function () { tally.textContent = text; };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  });
  paint();
})();
</script>
"""
