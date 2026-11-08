# Phase 2: How to Spot It — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every version in a lookup carries a look-for line, any hand notes, and any unresolved look-alikes. Each card gets a one-line value summary. Matt gets a 20-card self-test page that shows set names and set icons.

**Architecture:** The database build stores each printing's visible traits and Scryfall's set list. After loading cards, the build groups versions by Oracle card and runs the look-for walk (`spot.py`) over each group, storing `look_for`, `notes`, `same_as`, `frame_group` and `symbol_set`. Lookup reads those fields and computes the value summary (`summary.py`) for the user's threshold. Hand notes live in a sourced JSON file that `hand_notes.py` loads and validates.

**Tech Stack:** Python 3.12+ (the venv runs 3.14), stdlib `sqlite3`/`json`/`urllib`, `certifi`, `pytest`.

**Spec:** `docs/superpowers/specs/2026-11-04-phase2-spot-text-design.md`. Read it before starting any task. Wording strings come from its §2 and §3.

## Global Constraints

- Runtime dependencies: stdlib plus `certifi` only. Tests use `pytest`. Run the suite with `.venv/bin/python -m pytest -q` from `/Users/mattpaul/code/BinDiver`.
- Scryfall requests use `bulk_data.HEADERS` (`User-Agent: BinDiver/0.1`, `Accept: application/json;q=0.9,*/*;q=0.8`) and `bulk_data.ssl_context()`. Fetch the set list at most once every 24 hours. Space icon downloads at least 100 ms apart, which keeps under 10 requests/sec.
- Never put Matt's email address or any other personal data in a request, file, or page.
- There is no git repo and Matt hasn't asked for one, so there are no commit steps. Each task ends with a full test run.
- Copy wording verbatim from spec §2 (the trait table and its notes) and §3 (labels and sentences).
- Prices are integer cents. Dollar amounts convert through `Decimal`.
- A version key is `"{printing_id}:{finish}"`.
- Every hand-notes entry has an `http(s)` source link (MTG Wiki, Scryfall, or Wizards). No source, no note.
- Follow TDD (superpowers:test-driven-development). Watch each new test fail before writing the code, and use literal expected values.
- Data lives in `data/` (gitignored). The database is `data/cards.sqlite`.

## Review Focus

1. **Double-faced cards** keep `illustration_id` on their faces (1,939 printings have no top-level one) and often have no `card_back_id` (1,335 printings). The build must not crash. Art falls back to the front face, and a missing back reads "no card back (double-faced)". Tests: Task 1 (`test_printing_traits_fall_back_to_the_front_face`) and Task 4 (`test_card_backs`).
2. **A card with one version** gets an empty look-for line. The display must say "Look for: any copy (only version)", not print a blank line. Test: Task 7 (`test_only_version_says_any_copy`).
3. **New Scryfall values** (a new frame, border, holo stamp, or language) must still read as text, with no `KeyError`. Test: Task 4 (`test_unknown_scryfall_values_still_read`).
4. **A typo in `hand_notes.json`** (missing source, unknown field, or a pair note for a set outside the pair) must stop the build with an error naming the entry, not get skipped silently. Test: Task 2 (`test_bad_entries_are_rejected`).
5. **Basic lands have about 1,200 versions each.** The per-version walk must keep a full build under 60 s. Check: Task 9, step 1 (timed build).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `bindiver/mtg/spot.py` (new) | `printing_traits`, `SpotVersion`, `Spot`, `frame_bucket`, the trait table, and `spot_card` |
| `bindiver/mtg/hand_notes.py` (new) | `SetNote`, `HandNotes`, `parse_hand_notes`, `load_hand_notes` |
| `bindiver/mtg/hand_notes.json` (new) | Sourced hand notes (spec §4) |
| `bindiver/mtg/summary.py` (new) | `summarize`, `FRAME_LABELS` (spec §3) |
| `bindiver/mtg/money.py` (new) | `dollars(cents)`, moved out of `report.py` so `summary.py` and `report.py` share it |
| `bindiver/mtg/selftest.py` (new) | Picking the 20 self-test cards and rendering the HTML page |
| `bindiver/mtg/bulk_data.py` | Daily set-list fetch and set-icon download |
| `bindiver/mtg/build_db.py` | New schema columns, the `sets` table, and the spot pass after loading |
| `bindiver/mtg/lookup.py` | New `Version`/`CardGroup` fields and the summary |
| `bindiver/mtg/report.py` | New display, `coverage_report` |
| `bindiver/__main__.py` | Set list in `update`; new `coverage` and `selftest` commands |
| `tests/fixtures/counterspell.json` (new) | Hand-built Counterspell family (Task 3) |
| `tests/fixtures/hand_notes_test.json` (new) | Hand notes used only by tests (Task 2) |

---

### Task 1: Store printing traits and the set list

**Files:**
- Create: `bindiver/mtg/spot.py`, containing only `printing_traits` for now
- Modify: `bindiver/mtg/build_db.py`, `bindiver/mtg/bulk_data.py`, `bindiver/__main__.py`
- Test: `tests/test_build_db.py`, `tests/test_bulk_data.py`

**Interfaces:**
- Produces:
  - `spot.printing_traits(card: dict) -> dict` with keys `artist`, `illustration_id`, `border_color`, `frame`, `frame_effects` (list[str]), `full_art` (bool), `textless` (bool), `promo_types` (list[str]), `security_stamp`, `card_back_id`. `artist`, `illustration_id`, and `card_back_id` fall back to `card_faces[0]`. `full_art` is also true when `frame_effects` contains `"fullart"`. Missing values are `None`, `[]`, or `False`.
  - `build_db(cards, db_path, price_date, sets=())`, where `sets` is an iterable of Scryfall set objects (`code`, `name`, `icon_svg_uri`).
  - Schema additions:
    - New table: `sets(code TEXT PRIMARY KEY, name TEXT NOT NULL, icon_svg_uri TEXT)`.
    - `printings` gains `artist`, `illustration_id`, `border_color`, `frame`, `frame_effects` (JSON text), `full_art` INTEGER, `textless` INTEGER, `promo_types` (JSON text), `security_stamp`, `card_back_id`, and `symbol_set` (filled in Task 5).
    - `versions` gains `look_for TEXT NOT NULL DEFAULT ''`, `notes TEXT NOT NULL DEFAULT ''`, `same_as TEXT NOT NULL DEFAULT '[]'`, and `frame_group TEXT NOT NULL DEFAULT ''`.
  - In `bulk_data`:
    - Constants: `SETS_ENDPOINT = "https://api.scryfall.com/sets"`, `SETS_FILE = "sets.json"`.
    - `sets_are_fresh(saved: dict | None, now: datetime) -> bool`
    - `update_sets(data_dir: Path, now: datetime | None = None) -> list[dict]`. It caches `{"downloaded_at": <iso>, "data": [...]}` in `data/sets.json` and refetches only when `sets_are_fresh` is false.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_build_db.py
import sqlite3
from bindiver.mtg.build_db import build_db
from bindiver.mtg.spot import printing_traits

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
```

```python
# tests/test_bulk_data.py (add)
def test_set_list_is_refetched_after_a_day():
    now = datetime(2026, 11, 4, 12, tzinfo=timezone.utc)
    assert sets_are_fresh(None, now) is False
    assert sets_are_fresh({"downloaded_at": "2026-11-04T00:00:00+00:00", "data": []}, now) is True
    assert sets_are_fresh({"downloaded_at": "2026-11-03T11:59:59+00:00", "data": []}, now) is False
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `.venv/bin/python -m pytest tests/test_build_db.py tests/test_bulk_data.py -q`
Expected: FAIL with `ImportError` for `printing_traits` and `sets_are_fresh`.

- [ ] **Step 3: Implement `printing_traits`, the schema additions, `sets` rows, `sets_are_fresh`, and `update_sets`**

Insert one `sets` row per set object before loading cards. Store `frame_effects` and `promo_types` with `json.dumps`. `update_sets` uses `_get(SETS_ENDPOINT)` and reads the `data` list (Scryfall returns every set on one page). In `cmd_update`, call `sets = update_sets(DATA_DIR)` and pass `sets=sets` to `build_db`.

- [ ] **Step 4: Run the full suite**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass (40 old tests plus 4 new).

---

### Task 2: Hand notes loader

**Files:**
- Create: `bindiver/mtg/hand_notes.py`, `bindiver/mtg/hand_notes.json` (content `{"sets": {}, "pairs": []}` until Task 8), `tests/fixtures/hand_notes_test.json`, `tests/test_hand_notes.py`

**Interfaces:**
- Produces:

```python
HAND_NOTES_FILE = Path(__file__).with_name("hand_notes.json")

@dataclass(frozen=True)
class SetNote:
    symbol: bool = True                 # False: the set prints no set symbol
    except_langs: tuple[str, ...] = ()  # languages where it does print one
    back: str | None = None             # card back description
    foil: str | None = None             # name for the set's foil finish
    stamp: str | None = None            # stamp the whole set carries
    numbers: bool = True                # False: no printed collector numbers (exceptions found in Task 8)
    source: str = ""

@dataclass(frozen=True)
class HandNotes:
    sets: dict[str, SetNote]
    pairs: dict[tuple[str, str], str]   # (target set, look-alike set) -> note shown on the target
    def set_note(self, code: str) -> SetNote: ...                       # SetNote() when absent
    def pair_note(self, target_set: str, other_set: str) -> str | None: ...

def parse_hand_notes(data: dict) -> HandNotes   # ValueError naming the entry on any problem
def load_hand_notes(path: Path = HAND_NOTES_FILE) -> HandNotes
```

`numbers` is not in the spec's example. It exists for sets after the collector-number cutoff that print no numbers, if Task 8's source check finds any.

`tests/fixtures/hand_notes_test.json`:

```json
{
  "sets": {
    "lea": {"symbol": false, "source": "https://example.test/lea"},
    "leb": {"symbol": false, "source": "https://example.test/leb"},
    "2ed": {"symbol": false, "source": "https://example.test/2ed"},
    "3ed": {"symbol": false, "source": "https://example.test/3ed"},
    "ced": {"symbol": false, "back": "Collectors' Edition back", "source": "https://example.test/ced"},
    "fbb": {"symbol": false, "source": "https://example.test/fbb"},
    "5ed": {"symbol": false, "except_langs": ["zhs"], "source": "https://example.test/5ed"},
    "dbl": {"foil": "silver screen foil", "source": "https://example.test/dbl"},
    "plst": {"stamp": "List stamp (lower left)", "source": "https://example.test/plst"},
    "nox": {"numbers": false, "source": "https://example.test/nox"}
  },
  "pairs": [
    {"sets": ["lea", "leb"],
     "notes": {"lea": "Alpha's corners are more rounded than Beta's.",
               "leb": "Beta's corners are less rounded than Alpha's."},
     "source": "https://example.test/alpha-beta"}
  ]
}
```

- [ ] **Step 1: Write the failing tests**

```python
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
```

- [ ] **Step 2: Run and confirm they fail**

Run: `.venv/bin/python -m pytest tests/test_hand_notes.py -q`
Expected: FAIL with `ModuleNotFoundError: bindiver.mtg.hand_notes`.

- [ ] **Step 3: Implement `hand_notes.py` and create the empty `hand_notes.json`**

A source counts only if it starts with `http://` or `https://`. Convert `except_langs` to a tuple.

- [ ] **Step 4: Run the full suite**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass.

---

### Task 3: Look-for walk on the Counterspell family

**Files:**
- Modify: `bindiver/mtg/spot.py`
- Create: `tests/fixtures/counterspell.json`, `tests/test_spot.py`

**Interfaces:**
- Consumes: `printing_traits` (Task 1), `HandNotes` and `load_hand_notes` (Task 2)
- Produces:

```python
STANDARD_BACK = "0aeebaf5-8c7d-4636-9e82-8c27447861f7"
SCOURGE_RELEASE = "2003-05-26"
FRAME_ORDER = ("old-1993", "old-1997", "modern", "future", "m15", "retro")

@dataclass(frozen=True)
class SpotVersion:
    printing_id: str; finish: str; set_code: str; set_name: str; collector_number: str
    released_at: str; lang: str; artist: str | None; illustration_id: str | None
    border_color: str | None; frame: str | None; frame_effects: tuple[str, ...]
    full_art: bool; textless: bool; promo_types: tuple[str, ...]
    security_stamp: str | None; card_back_id: str | None
    @property
    def key(self) -> str: ...                     # "{printing_id}:{finish}"
    @classmethod
    def from_card(cls, card: dict, finish: str) -> "SpotVersion": ...   # via printing_traits

@dataclass(frozen=True)
class Spot:
    look_for: str              # "" when nothing needs saying
    notes: tuple[str, ...]
    same_as: tuple[str, ...]   # version keys
    frame_group: str           # frame_bucket(...)
    symbol_set: str | None     # printed symbol's set code, "none" for symbol-less, None if unknown

def frame_bucket(frame: str | None, released_at: str) -> str
def spot_card(versions: Sequence[SpotVersion], notes: HandNotes, set_names: Mapping[str, str]) -> dict[str, Spot]
```

`frame_bucket` works as follows:
- `"1993"` and `"1997"` map to `"old-1993"` and `"old-1997"` when `released_at <= SCOURGE_RELEASE`, otherwise to `"retro"`.
- `"2003"` maps to `"modern"`, `"2015"` to `"m15"`, and `"future"` to `"future"`.
- Any other string is returned unchanged, and `None` maps to `"unknown"`.

`set_names` maps set code to name, from the `sets` table. When a code is missing, the wording uses the printing's own `set_name`.

**The walk.** This is spec §2's algorithm. `SKIP` means a trait can't be said for this version: the walk skips it for the target, but other versions still see the target's value as different.

```python
def spot_card(versions, notes, set_names):
    ctx = Context(notes, set_names, versions)          # per-card facts, e.g. artists with 2+ arts
    values = {v.key: [t.value(v, ctx) for t in TRAITS] for v in versions}
    out = {}
    for target in versions:
        remaining = [o for o in versions if o.key != target.key]
        parts = []
        for i, trait in enumerate(TRAITS):
            if not remaining:
                break
            mine = values[target.key][i]
            if mine is SKIP:
                continue
            ruled = [o for o in remaining if values[o.key][i] != mine]
            if ruled:
                parts.append(trait.words(target, ruled, ctx))
                remaining = [o for o in remaining if values[o.key][i] == mine]
        pair_notes, same_as = [], []
        for o in remaining:
            note = notes.pair_note(target.set_code, o.set_code)
            if note is None:
                same_as.append(o.key)
            elif note not in pair_notes:
                pair_notes.append(note)
        out[target.key] = Spot(", ".join(parts), tuple(pair_notes), tuple(same_as),
                               frame_bucket(target.frame, target.released_at), symbol_set(target, ctx))
    return out
```

**Traits in this task,** listed in the trait table's order. Task 4 adds the rest in their places.

| Trait | Value | Words |
| --- | --- | --- |
| Art | `illustration_id`, or `"artist:" + artist` | `"art by {artist}"` |
| Border | `border_color` | black → "black border", white → "white border", borderless → "borderless", gold → "gold border", silver → "silver border", yellow → "yellow border"; `None` → "unknown border"; other → "{value} border" |
| Finish | nonfoil → "nonfoil", foil → "foil", etched → "etched foil", other → the finish string | the value |
| Frame | `frame_bucket(...)` | old-1993 → "old border (1993 frame)", old-1997 → "old border (1997 frame)", retro → "retro frame", modern → "modern frame", m15 → "M15 frame", future → "Future Sight frame"; other → "{bucket} frame" |
| Language | `lang` | en English, es Spanish, fr French, de German, it Italian, pt Portuguese, ja Japanese, ko Korean, ru Russian, zhs Simplified Chinese, zht Traditional Chinese, he Hebrew, la Latin, grc Ancient Greek, ar Arabic, sa Sanskrit, ph Phyrexian, qya Quenya; other → "language code {code}" |
| Card back | `card_back_id` | `STANDARD_BACK` → "regular card back"; `None` → "no card back (double-faced)"; else `set_note(set).back`, or "non-standard card back" |
| Set symbol | `"none"` when `set_note(set).symbol` is false and `lang` isn't in `except_langs`; else `set_code` | "none" → "no set symbol"; else "{set name} set symbol" |

`tests/fixtures/counterspell.json`: one object per line. Every object also carries `"object": "card"`, `"oracle_id": "cs-oracle"`, `"name": "Counterspell"`, `"layout": "normal"`, and `"games": ["paper"]`. Card backs are `STANDARD_BACK` unless noted. Missing trait fields fall back to the defaults from `printing_traits`.

| id | set / set_name | # | lang | released_at | artist / illustration_id | border | frame | finishes → prices | other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cs-lea | lea / Limited Edition Alpha | 54 | en | 1993-08-05 | Mark Poole / ill-poole | black | 1993 | nonfoil → null | |
| cs-leb | leb / Limited Edition Beta | 55 | en | 1993-10-04 | Mark Poole / ill-poole | black | 1993 | nonfoil → 919.92 | |
| cs-2ed | 2ed / Unlimited Edition | 55 | en | 1993-12-01 | Mark Poole / ill-poole | white | 1993 | nonfoil → 60.00 | |
| cs-3ed | 3ed / Revised Edition | 54 | en | 1994-04-11 | Mark Poole / ill-poole | white | 1993 | nonfoil → 5.97 | |
| cs-ced | ced / Collectors' Edition | 55 | en | 1993-12-10 | Mark Poole / ill-poole | black | 1993 | nonfoil → 60.00 | card_back_id `98784b63-d263-4abc-aabb-a092e6ecc788` |
| cs-fbb | fbb / Foreign Black Border | 54 | fr | 1994-04-11 | Mark Poole / ill-poole | black | 1993 | nonfoil → 27.99 | |
| cs-7ed | 7ed / Seventh Edition | 67 | en | 2001-04-11 | Mark Romanoski / ill-romanoski | white | 1997 | nonfoil → 4.06 | |
| cs-7ed-foil | 7ed / Seventh Edition | 67★ | en | 2001-04-11 | Mark Romanoski / ill-romanoski | black | 1997 | foil → 155.00 | |
| cs-mmq | mmq / Mercadian Masques | 69 | en | 1999-10-04 | Gao Yan / ill-gao | black | 1997 | nonfoil → 3.26, foil → 152.06 | |
| cs-dmr | dmr / Dominaria Remastered | 457 | en | 2023-01-13 | Mark Poole / ill-poole | black | 1997 | foil → 6.50 | promo_types `["release"]` |

Prices go in `"prices": {"usd": …, "usd_foil": …, "usd_etched": null}` as strings, or null.

- [ ] **Step 1: Write the failing tests**

```python
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
```

- [ ] **Step 2: Run and confirm they fail**

Run: `.venv/bin/python -m pytest tests/test_spot.py -q`
Expected: FAIL with `ImportError` for `SpotVersion` and `spot_card`.

- [ ] **Step 3: Implement `SpotVersion`, `Spot`, `frame_bucket`, `Trait`/`SKIP`/`Context`, the seven traits above, `symbol_set`, and `spot_card`**

- [ ] **Step 4: Run the full suite**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass.

---

### Task 4: The remaining traits and special wording

**Files:**
- Modify: `bindiver/mtg/spot.py`
- Test: `tests/test_spot.py`

**Interfaces:**
- Consumes: Task 3's `Trait`, `SKIP`, `Context`, and `spot_card`
- Produces:
  - Constants: `COLLECTOR_NUMBERS_FROM = "1998-06-15"` (Exodus; Task 8 confirms it against a source), `LIST_SETS = frozenset({"plst", "ulst"})`.
  - `printed_number(collector_number: str) -> str`
  - The trait table becomes spec §2's full order: art, border, finish, frame, treatment, language, stamp, holo stamp, card back, set symbol, collector number.

| Trait | Rule |
| --- | --- |
| Art (extend) | When one artist has 2 or more distinct art values on this card, add " ({year} art)". The year is the earliest `released_at[:4]` among versions with that art. |
| Finish (extend) | On the foil finish only, the first named foil in `promo_types`, checked in this order: surgefoil → "surge foil", galaxyfoil → "galaxy foil", ripplefoil → "ripple foil", silverfoil → "silver foil", doublerainbow → "double rainbow foil", textured → "textured foil", confettifoil → "confetti foil", raisedfoil → "raised foil". If none matches, `set_note(set).foil`, else "foil". |
| Treatment | Value: the frozenset of items present. Items in order: showcase (`frame_effects` has `showcase`), extended art (`extendedart`), full-art (`full_art`), textless (`textless`), colorshifted (`colorshifted`). Words: present items' phrases ("showcase frame", "extended art", "full-art", "textless", "colorshifted"), then a phrase for each item that a ruled-out version has and the target lacks ("no showcase frame", "no extended art", "not full-art", "not textless", "not colorshifted"), all in item order, joined by ", ". |
| Stamp | Same present/absent pattern. Items in order: date (`datestamped` or `prerelease` in `promo_types`) → "date stamp" / "no date stamp"; promo (`stamped`) → "promo stamp (art box)" / "no promo stamp"; set stamp (`set_note(set).stamp`) → the note text / "no " + the text before " (", e.g. "no List stamp"; serialized (`serialized`) → "serialized" / "not serialized". |
| Holo stamp | `security_stamp`: oval → "oval holo stamp", triangle → "triangle holo stamp", acorn → "acorn stamp", heart → "heart stamp", circle → "circle stamp"; `None` → "no holo stamp"; other → "{value} stamp". |
| Set symbol (extend) | In `LIST_SETS`, with a collector number matching `^([A-Za-z0-9]+)-(.+)$` and a lowercased prefix in `set_names`: the value is the prefix set, and the words use `set_names[prefix]`. Any other List printing: `SKIP`, and its `symbol_set` is `None`. |
| Collector number | `SKIP` when the set is in `LIST_SETS`, `released_at < COLLECTOR_NUMBERS_FROM`, or `set_note(set).numbers` is false. Otherwise the value is `printed_number(...)` and the words are "collector number {n}". |

`printed_number` drops every character that isn't a letter or digit, then removes one trailing `s` or `p` when the rest is all digits. So `"67★"` becomes `"67"`, `"1p"` becomes `"1"`, and `"12a"` stays `"12a"`.

- [ ] **Step 1: Write the failing tests**

```python
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
```

- [ ] **Step 2: Run and confirm they fail**

Run: `.venv/bin/python -m pytest tests/test_spot.py -q`
Expected: the Task 3 tests pass and the new ones fail, for example `test_stamps` failing on `assert {} == {...}`.

- [ ] **Step 3: Implement the traits, the extensions, and `printed_number`**

- [ ] **Step 4: Run the full suite, which includes Task 3's family test**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass. The family's expected lines don't change: none of the new traits separate any of its versions.

---

### Task 5: The build runs the walk, and lookup returns the results

**Files:**
- Modify: `bindiver/mtg/build_db.py`, `bindiver/mtg/lookup.py`, `tests/conftest.py`
- Test: `tests/test_lookup.py`

**Interfaces:**
- Consumes: `SpotVersion`, `spot_card` (Tasks 3–4), `load_hand_notes`, `HandNotes` (Task 2)
- Produces:
  - `build_db(cards, db_path, price_date, sets=(), hand_notes: HandNotes | None = None)`. `None` loads `HAND_NOTES_FILE`.
  - After the cards load, one query reads `printings JOIN versions ORDER BY oracle_id, released_at, set_code, collector_number, finish`. The fixed order keeps `same_as` lists the same from one build to the next. Rows go through `itertools.groupby` by `oracle_id`, each group becomes `SpotVersion`s, then `spot_card(group, hand_notes, set_names)`. `set_names` comes from the `sets` table.
  - Writes: `versions.look_for`, `versions.notes` (`"\n".join`), `versions.same_as` (`json.dumps(list)`), `versions.frame_group`, and `printings.symbol_set`.
  - `Version` gains fields with defaults: `frame_group: str = ""`, `look_for: str = ""`, `notes: tuple[str, ...] = ()`, `same_as: tuple[str, ...] = ()`, `symbol_set: str | None = None`, `symbol_icon: str | None = None`. It also gains a `key` property.
  - `symbol_icon` is `sets.icon_svg_uri` for `symbol_set`, via `LEFT JOIN sets`. It is `None` for `"none"` and for codes with no row.
  - `CardGroup` gains `versions_by_key: dict[str, Version] = field(default_factory=dict)`, covering every version of the card.
  - `conftest.py` adds `CS_SETS` and a `cs_catalog` fixture:

```python
FIXTURES = Path(__file__).parent / "fixtures"
CS_SETS = [{"code": "7ed", "name": "Seventh Edition", "icon_svg_uri": "https://svgs.scryfall.io/sets/7ed.svg"},
           {"code": "lea", "name": "Limited Edition Alpha", "icon_svg_uri": "https://svgs.scryfall.io/sets/lea.svg"}]

@pytest.fixture
def cs_catalog(tmp_path):
    cards = json.loads((FIXTURES / "counterspell.json").read_text(encoding="utf-8"))
    db = tmp_path / "cs.sqlite"
    build_db(cards, db, price_date="2026-11-03", sets=CS_SETS,
             hand_notes=load_hand_notes(FIXTURES / "hand_notes_test.json"))
    return Catalog(db)
```

- [ ] **Step 1: Write the failing tests**

```python
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
```

- [ ] **Step 2: Run and confirm they fail**

Run: `.venv/bin/python -m pytest tests/test_lookup.py -q`
Expected: the new tests fail with `AttributeError: 'Version' object has no attribute 'key'`, or a fixture error for `cs_catalog`.

- [ ] **Step 3: Implement the spot pass in `build_db` and the new fields in `lookup._group`**

- [ ] **Step 4: Run the full suite**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass, including the Phase 1 Fireball tests. Their fixture has no traits, and the build must still succeed.

---

### Task 6: Value summary

**Files:**
- Create: `bindiver/mtg/summary.py`, `bindiver/mtg/money.py`, `tests/test_summary.py`
- Modify: `bindiver/mtg/lookup.py` (adds `CardGroup.summary`), `bindiver/mtg/report.py` (imports `dollars` from `money`)
- Test: `tests/test_lookup.py` (one wiring test)

**Interfaces:**
- Consumes: `Version.frame_group`, `Version.finish`, `Version.price_cents` (Task 5)
- Produces:
  - `money.dollars(cents: int) -> str`: the body of today's `report._dollars`, moved here.
  - `summary.FRAME_LABELS = {"old-1993": "old-border 1993-frame", "old-1997": "old-border 1997-frame", "modern": "modern-frame", "future": "Future Sight-frame", "m15": "M15-frame", "retro": "retro-frame"}`. An unknown bucket's label is `"{bucket}-frame"`, ordered after retro.
  - `summary.summarize(versions: Iterable[Version], min_cents: int) -> str`
  - `CardGroup.summary: str = ""`, set in `Catalog._group` from all of the card's versions.

**The rules,** decided beyond spec §3:
- A group is (`frame_group`, finish class). Finish class is `nonfoil` for nonfoil and `foil` for everything else (foil and etched). The label adds " nonfoils" or " foils".
- A group's share is q / (all versions in the group).
- Rule 3 sorts by (−q, −share, frame order, nonfoil before foil). The fallback takes the first group in the same order among groups with q ≥ 1.
- Rule 4:
  - A frame becomes one whole-frame item when every group present in that frame is skip-eligible. Otherwise each eligible group is its own item.
  - Keep items with at least 3 versions, then take the 4 largest (ties go by frame order).
  - Whole-frame labels join as "A, B and C" followed by " cards". Single-finish labels join the same way.
  - With both kinds, the sentence is "Skip {whole} cards, and {singles} (0 of N)."; with one kind, "Skip {that list} (0 of N)."
  - N is the total number of versions in the kept items.
- Joins: one item is "a", two are "a and b", three or more are "a, b and c".

- [ ] **Step 1: Write the failing tests**

```python
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
```

```python
# tests/test_lookup.py (add)
def test_lookup_includes_the_value_summary(cs_catalog):
    assert only_group(cs_catalog.lookup("Counterspell", 25)).summary == (
        "Value sits in old-border 1993-frame nonfoils (4 of 6) and old-border 1997-frame foils (2 of 2).")
```

- [ ] **Step 2: Run and confirm they fail**

Run: `.venv/bin/python -m pytest tests/test_summary.py tests/test_lookup.py -q`
Expected: FAIL with `ModuleNotFoundError: bindiver.mtg.summary`.

- [ ] **Step 3: Implement `money.py`, `summary.py`, and `CardGroup.summary`, and switch `report.py` to `money.dollars`**

- [ ] **Step 4: Run the full suite**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass.

---

### Task 7: Display and the coverage report

**Files:**
- Modify: `bindiver/mtg/report.py`, `bindiver/__main__.py`
- Test: `tests/test_report.py`. Replace `test_format_result_lists_versions_worth_finding_with_price_date`, which pins Phase 1's layout, with the first test below.

**Interfaces:**
- Consumes: the `Version` fields, `CardGroup.summary`, and `CardGroup.versions_by_key` (Tasks 5–6)
- Produces:
  - `format_result(result, min_price) -> str` with spec §5's layout.
  - `Coverage(qualifying: int, told_apart: int, unresolved: list[tuple[str, Version, list[Version]]])`
  - `coverage_report(catalog, names, min_price) -> Coverage`. It counts exact matches only, each distinct name once, and qualifying versions only. A version is told apart when its `same_as` is empty.
  - CLI: `python -m bindiver coverage CSV --min 10`. It prints `At $10.00+: {told_apart:,} of {qualifying:,} qualifying versions told apart ({pct:.0%})`, then `Still look the same ({n}):`, then one line per unresolved version: `  {card}: {SET} #{cn} {finish} ~ {SET} #{cn} {finish}, …`

**Layout rules:**
- After each group's header comes its summary line, then a blank line, but only if any version rows follow.
- Version row: `"  {price:>w}  {set_name}  {SET} #{cn}  {finish}"`, where w is the widest qualifying price.
- Continuation lines are indented `2 + w + 2` spaces:
  - "Look for: {look_for}". When `look_for`, `notes`, and `same_as` are all empty, it reads "Look for: any copy (only version)". When only `look_for` is empty, the line is left out.
  - One line per note.
  - One line per look-alike: "Looks the same as {set_name} {SET} #{cn} ({price or 'unpriced'}): check a reference image."
- Unpriced block: `"  Unpriced ({k}):"`, then for each version a continuation-indented `"{set_name}  {SET} #{cn}  {finish}"` and its continuation lines.

- [ ] **Step 1: Write the failing tests**

```python
def test_format_result_shows_summary_and_look_for_lines(cs_catalog):
    assert format_result(cs_catalog.lookup("Counterspell", 25), 25) == (
        "Counterspell: 6 of 11 versions worth finding at $25.00+\n"
        "Value sits in old-border 1993-frame nonfoils (4 of 6) and old-border 1997-frame foils (2 of 2).\n"
        "\n"
        "  $919.92  Limited Edition Beta  LEB #55  nonfoil\n"
        "           Look for: art by Mark Poole, black border, nonfoil, English, regular card back\n"
        "           Beta's corners are less rounded than Alpha's.\n"
        "  $155.00  Seventh Edition  7ED #67★  foil\n"
        "           Look for: art by Mark Romanoski, black border\n"
        "  $152.06  Mercadian Masques  MMQ #69  foil\n"
        "           Look for: art by Gao Yan, foil\n"
        "   $60.00  Unlimited Edition  2ED #55  nonfoil\n"
        "           Look for: art by Mark Poole, white border\n"
        "           Looks the same as Revised Edition 3ED #54 ($5.97): check a reference image.\n"
        "   $60.00  Collectors' Edition  CED #55  nonfoil\n"
        "           Look for: art by Mark Poole, black border, nonfoil, English, Collectors' Edition back\n"
        "   $27.99  Foreign Black Border  FBB #54  nonfoil\n"
        "           Look for: art by Mark Poole, black border, nonfoil, French\n"
        "  Unpriced (1):\n"
        "           Limited Edition Alpha  LEA #54  nonfoil\n"
        "           Look for: art by Mark Poole, black border, nonfoil, English, regular card back\n"
        "           Alpha's corners are more rounded than Beta's.\n"
        "Prices: Scryfall market reference as of 2026-11-03, not adjusted for condition."
    )

def test_only_version_says_any_copy(catalog):
    result = catalog.lookup("Lim-Dûl's Vault", 1)
    assert result.groups[0].total_versions == 1
    assert "\n         Look for: any copy (only version)\n" in format_result(result, 1)

def test_coverage_counts_versions_told_apart(cs_catalog):
    cov = coverage_report(cs_catalog, ["Counterspell", "Counterspell", "Xyzzy Plugh"], 25)
    assert (cov.qualifying, cov.told_apart) == (6, 5)
    assert [(name, v.key, [o.key for o in others]) for name, v, others in cov.unresolved] == [
        ("Counterspell", "cs-2ed:nonfoil", ["cs-3ed:nonfoil"])]
```

In `test_only_version_says_any_copy`, the indent is 9 spaces: `"$3.00"` makes w = 5, so 2 + 5 + 2 = 9.

- [ ] **Step 2: Run and confirm they fail**

Run: `.venv/bin/python -m pytest tests/test_report.py -q`
Expected: FAIL with an assertion diff on the layout, and `ImportError` for `coverage_report`.

- [ ] **Step 3: Implement the layout, `coverage_report`, and `cmd_coverage`**

- [ ] **Step 4: Run the full suite**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass.

---

### Task 8: Sourced hand notes

**Files:**
- Modify: `bindiver/mtg/hand_notes.json`, and `bindiver/mtg/spot.py` only if the cutoff changes
- Test: `tests/test_hand_notes.py`, plus `tests/test_spot.py` if the cutoff changes

**Interfaces:**
- Consumes: the `parse_hand_notes` validation (Task 2)
- Produces: the shipped notes file covering spec §4's first pass

- [ ] **Step 1: Write the failing test**

```python
def test_shipped_notes_cover_the_first_pass():
    notes = load_hand_notes()
    for code in ("lea", "leb", "2ed", "3ed", "sum", "ced", "cei", "fbb", "4ed", "4bb", "5ed"):
        assert notes.set_note(code).symbol is False, code
    assert notes.set_note("5ed").except_langs == ("zhs",)
    assert notes.set_note("dbl").foil == "silver screen foil"
    assert notes.set_note("plst").stamp == "List stamp (lower left)"
    assert notes.pair_note("lea", "leb") and notes.pair_note("leb", "lea")
    for code in ("ced", "cei", "30a", "wc97", "wc98", "wc99", "wc00", "wc01", "wc02", "wc03", "wc04"):
        assert notes.set_note(code).back, code
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `.venv/bin/python -m pytest tests/test_hand_notes.py::test_shipped_notes_cover_the_first_pass -q`
Expected: FAIL with `AssertionError: lea`.

- [ ] **Step 3: Research each entry and write `hand_notes.json`**

Use the MTG Wiki first (`https://mtg.wiki/page/<Set_name>`), then Scryfall or Wizards. Write each note in your own words from the page, with that page's URL as `source`. Cover:
- **Sets with no set symbol:** lea, leb, 2ed, 3ed, sum, ced, cei, fbb, 4ed, 4bb, and 5ed with `except_langs: ["zhs"]`.
- **Card backs:**
  - ced and cei
  - 30a
  - wc97–wc04, as World Championship deck backs
  - ptc (Pro Tour Collector Set), which has its own back in the data
- **Special foil and stamps:**
  - dbl, with foil "silver screen foil"
  - plst, with stamp "List stamp (lower left)"
  - ulst, only if a source says Unfinity-foil List cards carry the stamp
- **The Alpha/Beta corner pair.**
- **Collector-number cutoff:** check the MTG Wiki "Collector number" page.
  - If it names a first set other than Exodus, set `COLLECTOR_NUMBERS_FROM` to that set's `released_at`, read from `data/sets.json`. Then update the dates in `test_collector_numbers` and `test_no_collector_numbers_before_the_cutoff_or_for_sets_without_them` so they fall on the correct side.
  - Add `"numbers": false` for any later set the page says printed none.

If a source can't be found for an entry, leave the entry out. Remove it from the test and list it for Matt.

- [ ] **Step 4: Check every set code exists in Scryfall's list**

Run: `.venv/bin/python -c "import json; s={x['code'] for x in json.load(open('data/sets.json'))['data']}; n=json.load(open('bindiver/mtg/hand_notes.json')); bad=[c for c in n['sets'] if c not in s]+[c for p in n['pairs'] for c in p['sets'] if c not in s]; print(bad or 'all codes known')"`
Expected: `all codes known`. This needs `data/sets.json`, which `python -m bindiver update` writes (Task 9, step 1). If it doesn't exist yet, run `update` first.

- [ ] **Step 5: Run the full suite**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass.

---

### Task 9: Real-data run and coverage

**Files:**
- Modify: `bindiver/mtg/hand_notes.json` (more pairs), `BUILD_BREAKDOWN.md` (adds a Phase 2 results section)

- [ ] **Step 1: Rebuild with the timer**

Run: `.venv/bin/python -m bindiver update --force-build`
Expected: `Built cards.sqlite in N s` with N < 60, then `Prices as of …`. The local bulk file is still used if it's under 24 hours old.

If N ≥ 60: profile with `.venv/bin/python -m cProfile -s cumtime -m bindiver update --force-build | head -30` and fix the hot path in `spot_card` (precomputed values, no repeated `set_note` lookups) before going on.

- [ ] **Step 2: Look up the three classics**

Run: `.venv/bin/python -m bindiver lookup "Fireball" "Counterspell" "Birds of Paradise" --min 10`, then `.venv/bin/python -m bindiver lookup "Counterspell" --min 25`
Expected:
- Every listed version has a "Look for:" line.
- The LEB Counterspell row includes the Beta note.
- No line contains "★" after "collector number".
- The $25 Counterspell summary has the same structure as spec §5's example: old-border 1993-frame nonfoils and old-border 1997-frame foils as the value groups, and old-border 1997-frame nonfoils and retro-frame foils as skips. Counts may differ by a version or two because of price refreshes; note any differences.

- [ ] **Step 3: Run coverage on the bulk sample**

Run: `.venv/bin/python -m bindiver coverage ~/Downloads/manabox-scan-2026-11-03.csv --min 10`
Expected: 90% or more told apart.

If it's under 90%, group the unresolved list by set pair. For the largest pairs, add sourced pair notes (Task 8 rules), rebuild (step 1), and rerun. Stop once coverage reaches 90% or the remaining pairs have no source. List those pairs for Matt.

- [ ] **Step 4: Record the results in `BUILD_BREAKDOWN.md`**

Add a "Phase 2 results" section with:
- build time
- database size, and its compressed size from `gzip -c data/cards.sqlite | wc -c`
- coverage % and the unresolved count
- the top remaining look-alike pairs
- the $25 Counterspell summary line

- [ ] **Step 5: Run the full suite**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass.

---

### Task 10: The 20-card self-test page, with set names and icons

**Files:**
- Create: `bindiver/mtg/selftest.py`, `tests/test_selftest.py`
- Modify: `bindiver/mtg/bulk_data.py`, `bindiver/__main__.py`

**Interfaces:**
- Consumes: `bulk_report` (Phase 1), `Catalog.lookup` and the `Version` fields (Tasks 5–7)
- Produces:
  - `bulk_data.ICON_DIR = "set_icons"`
  - `bulk_data.fetch_set_icons(icon_uris: Mapping[str, str], data_dir: Path) -> dict[str, bytes]`. It downloads each missing `data/set_icons/{code}.svg` with `HEADERS`, sleeping 0.1 s between requests, and returns code → SVG bytes for every icon it has.
  - `selftest.CLASSICS = ("Fireball", "Counterspell", "Birds of Paradise", "Lightning Bolt", "Sol Ring", "Llanowar Elves", "Dark Ritual", "Swords to Plowshares", "Brainstorm", "Fire // Ice")`
  - `selftest.MAX_LISTED = 30`: bulk picks with more listed versions than this (qualifying plus unpriced) are skipped. That keeps basic lands off the page, and the page says so.
  - `selftest.pick_names(alert_names: list[str], listed_counts: Mapping[str, int]) -> list[str]`. It returns `CLASSICS` plus 10 picks. The picks come from the alerts, minus classics and minus names over `MAX_LISTED`, taken at indices `round(i * (len - 1) / 9)` for i = 0…9.
  - `selftest.render_html(catalog, names, min_price, icons: Mapping[str, bytes]) -> str`
  - CLI: `python -m bindiver selftest CSV --min 10 --out data/selftest.html`

**Page content:**
- Per card: name, the summary line, then each listed version with:
  - the set icon, inlined as `<img src="data:image/svg+xml;base64,…">` from `symbol_set`, or the text "no set symbol" when `symbol_set == "none"`
  - set name, `SET #cn`, finish, and price
  - the look-for line, notes, and look-alike lines, all `html.escape`d
  - a link to `https://scryfall.com/card/{set}/{urllib.parse.quote(cn)}`
- Per card: Pass and Fail buttons.
- A "Copy results" button that copies "Pass {n} of 20. Failed: …".
- A short "Terms to check" box listing spec §6's terms to confirm.
- Marks are kept in `localStorage` inside try/catch, so the page still works without it.
- Icons are inlined, not hotlinked, so the page works as a private Artifact.

**Before writing the HTML template, load the `artifact-design` skill and follow its page contract:**
- title "BinDiver Self-Test"
- color tokens on `:root`, with the dark-mode overrides it specifies
- an explicit `body` background
- usable at 375 px width with a 16 px gutter

- [ ] **Step 1: Write the failing tests**

```python
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
```

- [ ] **Step 2: Run and confirm they fail**

Run: `.venv/bin/python -m pytest tests/test_selftest.py -q`
Expected: FAIL with `ModuleNotFoundError: bindiver.mtg.selftest`.

- [ ] **Step 3: Implement `fetch_set_icons`, `selftest.py`, and `cmd_selftest`**

`cmd_selftest` works in four steps:
1. Run the bulk report at `--min`.
2. Compute `listed_counts` from one lookup per alert name.
3. Pick the names, and gather the icon URIs of every listed version's `symbol_set`.
4. Fetch the icons, render the page, and write it to `--out`.

- [ ] **Step 4: Run the full suite**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Build the real page and publish it for Matt**

Run: `.venv/bin/python -m bindiver selftest ~/Downloads/manabox-scan-2026-11-03.csv --min 10 --out data/selftest.html`
Expected: the file is written, with 20 cards and every version showing an icon or "no set symbol". Publish `data/selftest.html` as a private Artifact (icon `checklist`) and give Matt the link.
