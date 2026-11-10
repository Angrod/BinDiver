# Phase 3, Plan 2: The Full App and the 200-Card Phone Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the camera-test app into the full scan app: the results panel, the full and quiet alerts, known cards with basics pre-marked, typed search by name, set and number, and number/total, the price sheet and settings, a crash-safe two-slot data swap, the nightly data job, and new builds for the iPhone 13, iPhone 15 Pro and Pixel 8. The plan ends with Matt's 200-card phone tests recorded in `BUILD_BREAKDOWN.md`.

**Architecture:**
- **Python** works out each version's quiet kind and each set's printed total while building `cards.sqlite`, and the phone database gains artists, a set-and-number index and dark-mode-safe icons. Two new commands: `check-log` (replays a phone run on the Mac) and `nightly-check` (the nightly skip rule the workflow calls).
- **The app's new logic is pure TypeScript with Jest tests:** the alert rule and labels, alert rates, search parsing and number lookups, known cards, settings, the two-slot swap, and the result panel's text. The screens stay thin and are checked on the phones.
- **The `Game` interface** grows the number searches, the quiet kinds and the basic lands, so screens never touch MTG code directly. An app holding camera-test data (no quiet kinds, no artists) keeps working: every alert is full and the number searches are hidden.

**Tech Stack:** as Plan 1 (Python 3.14 and pytest; Expo SDK 58, React Native 0.88.1, TypeScript, Jest 30), plus `react-native-svg` for set icons, React Native's `Vibration`, and GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-06-phase3-scan-app-design.md`, build-order steps 4 and 5: sections 1.1 to 1.3 (Plan 2 parts), 3, 4, 5, 6 and 7, plus the "Decisions made with Matt for Plan 2 (Nov 9)" list. Plan 1 is `docs/superpowers/plans/2026-11-06-phase3-plan1-camera-test.md`; its rulings R1 to R40 still stand.

**Mockup:** the five boards are saved as HTML in `.superpowers/mockup/` (git-ignored): `Main` (worth finding), `Detail` (a tapped row), `Quiet` (nothing at the price), `Price` (price sheet), `Search`. The colours in Task 12's theme come from them.

## Global Constraints

- **Matt signs in himself.** Never type, store or ask for his passwords, keys or pairing codes. Commands that prompt for Apple or Expo credentials (`eas device:create`, the iOS build) are run by Matt in his own terminal.
- **Commits** use the configured identity and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work happens on branch `phase3-plan2`. Commits on it are approved; **pushing, publishing data and starting builds need Matt's OK** (Tasks 15 and 16).
- **Downloads:** ask Matt before any download that isn't from this repo's `data-latest` release, stating the file, the source and the size. `python -m bindiver update --offline` (Task 1) rebuilds without one.
  - The plan's only new package is `react-native-svg` (Task 12). The controller asks Matt for it before Task 1, giving the size from `npm view react-native-svg@<the version Expo 58 pins> dist.unpackedSize`.
- **No local native builds** (Plan 1's R30: this Mac's Xcode is too old). The new screens are first seen on the phones in Task 16, and fixes after that go out as EAS updates.
- **Never commit** `data/`, CSV exports, or Matt's email address.
- **Data:**
  - `phone_format` stays `1`. Download base URL: `https://github.com/Angrod/BinDiver/releases/download/data-latest/`. The zip's single entry stays `cards-phone.sqlite`.
  - `quiet_kind` values, exactly: `old border` (`frame_group` `old-1993` or `old-1997`), `Secret Lair` (set name starts with `Secret Lair`), `serialized` (`promo_types` holds `serialized`), checked in that order; `''` for every other version.
  - `printed_total` = Scryfall's `printed_size`, else `card_count`.
  - Number/total searches only return printings with `released_at >= '1998-01-01'`.
  - Phone database slots: `cards-a.sqlite`, `cards-b.sqlite`; the camera-test file `cards-phone.sqlite` is the legacy slot. The live slot is the `live_slot` setting in `user.sqlite`.
- **Alert price:** presets 200, 500, 1000, 2000 and 5000 cents; default 1000. Alert rates count full alerts only and stay hidden until 50 distinct cards have been scanned.
- **Copy** is the spec's, word for word. Strings used across tasks: "Worth finding", "Known", "Mark known", "Unmark", "Still alert for this version", "This version", "Token, not tracked", "No card by that name", "Prices as of Nov 4", "Tap to pause", "Alert at or above", "Remembered on this phone.", "Check for new prices now", "Allow downloads on cellular", "Download on cellular?", "Update the app to get newer prices".
- **The game boundary:** MTG-specific code lives in `app/src/game/mtg/`. Screens, `alert/`, `user/`, `data/` and `scan/` import only `app/src/game/types.ts` (and the `Version`/`CardGroup` types it re-exports).
- **No new network traffic.** No analytics. The app still talks only to `data-latest` and Expo's update server.
- **The card database is never read with `SELECT *`** in the app or Python, so old builds keep reading new files.
- **`user.sqlite` migrations must be safe to run twice** (Plan 1's `MIGRATIONS` note: an update crash can bring the log back to an older `user_version`).
- **Commands:** Python as `.venv/bin/python` from the repo root. App commands from `app/` with Node 26: `npx jest <path>`, `npx tsc --noEmit`. Pure-logic tests run in Jest's node environment (Plan 1's R8); components are not unit-tested.

## Review Focus

1. **An install still holding camera-test data** (no `quiet_kind`, `artists` or `printed_total`) gets the Plan 2 code. It must open, scan and alert (every alert full) and hide the number searches, never crash. *Pinned by:* Task 6's "old-format data" tests.
2. **The app is killed at any moment during a data swap.** The live slot recorded in `user.sqlite` must always name a complete, verified file. *Pinned by:* Task 10's fake-file-system test that fails each step in turn.
3. **Changing the price, the sort or a known mark while a result is on screen** must redraw it without vibrating, sounding or recording a scan. *Pinned by:* Task 8's `signalPlan('redraw', …)` test and Task 13's rule that only the commit handler records and signals.
4. **Typed text that looks like a set and number but is a name** ("Fire 2", "Opt 10e") must still suggest names. *Pinned by:* Task 7's "Fire 2" test and Task 14's rule that set-and-number hits are added above name suggestions, never instead of them.
5. **Matt unmarks a basic land.** It must stay unmarked after every later launch and data download. *Pinned by:* Task 9's "seeding runs once" test.

---

### Task 1: Quiet kinds, set totals and alert strength in the card database (Python)

**Files:**
- Create: `bindiver/mtg/quiet.py`, `tests/test_quiet.py`
- Modify: `bindiver/mtg/build_db.py`, `bindiver/mtg/lookup.py`, `bindiver/mtg/bulk_data.py`, `bindiver/__main__.py`
- Test: `tests/test_build_db.py`, `tests/test_main.py`

**Interfaces:**
- Produces:
  - `quiet.QUIET_KINDS = ("old border", "Secret Lair", "serialized")`
  - `quiet.quiet_kind(frame_group: str, set_name: str, promo_types: Iterable[str]) -> str`
  - `quiet.alert_strength(groups: Sequence[CardGroup]) -> str`: `"full"`, `"quiet"` or `"none"`, over the groups' `qualifying` versions only
  - `quiet.quiet_kinds_of(groups: Sequence[CardGroup]) -> list[str]`: the kinds among qualifying versions, in `QUIET_KINDS` order, when the strength is `"quiet"`; `[]` otherwise
  - `lookup.Version.quiet_kind: str = ""`, read from `versions.quiet_kind`
  - `cards.sqlite`: `versions.quiet_kind TEXT NOT NULL DEFAULT ''`, `sets.printed_total INTEGER`
  - `bulk_data.price_date_of(updated_at: str) -> str` (the date part; `cmd_update` uses it)
  - `python -m bindiver update --offline`: rebuilds from the saved `default_cards.jsonl.gz` and `sets.json`, without any network call, always rebuilding

- [ ] **Step 1: Write the failing tests** in `tests/test_quiet.py`:

```python
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
```

  Plus `alert_strength`/`quiet_kinds_of` tests on hand-made `CardGroup`s: no qualifying → `"none"`, `[]`; one `""` version among old-border ones → `"full"`, `[]`; `["serialized", "old border", "old border"]` → `"quiet"`, `["old border", "serialized"]`; an unpriced old-border version and no qualifying ones → `"none"`; two groups, one all old border and one with a `""` version → `"full"`.

  In `tests/test_build_db.py`: build the Counterspell fixture with `sets=[{"code": "7ed", "name": "Seventh Edition", "printed_size": 350, "card_count": 708}, {"code": "lea", "name": "Limited Edition Alpha", "card_count": 295}, {"code": "sld", "name": "Secret Lair Drop"}]` and assert `SELECT code, printed_total FROM sets` gives `7ed 350`, `lea 295`, `sld None`; every `lea`, `leb`, `2ed`, `3ed`, `ced`, `fbb`, `7ed` and `mmq` version has `quiet_kind = 'old border'`, and the `dmr` version has `''`. Add one copied card with `set_name` "Secret Lair Drop" and `promo_types` `["serialized"]` and assert `Secret Lair`. In `tests/test_lookup.py`: a looked-up `Version` carries its `quiet_kind`.

  In `tests/test_main.py`: `update --offline` with `DATA_DIR` pointed at a temp dir holding a gzipped bulk file, `default_cards.meta.json` and `sets.json` builds `cards.sqlite` with the meta file's price date, and makes no network call (patch `bulk_data._get` to raise).

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/python -m pytest tests/test_quiet.py tests/test_build_db.py tests/test_lookup.py tests/test_main.py -v`
Expected: FAIL (no module `bindiver.mtg.quiet`, no column `quiet_kind`, no `--offline`).

- [ ] **Step 3: Implement.** `quiet_kind` uses `set_name.startswith("Secret Lair")`. `build_db` sets `quiet_kind` in `_spot_pass`'s existing `UPDATE versions` (the row already holds `set_name` and `promo_types`; `frame_group` comes from the spot result) and fills `printed_total` from `s.get("printed_size") or s.get("card_count")`. `Catalog._group` selects `v.quiet_kind`. `--offline` reads `read_local_meta(DATA_DIR)` and `sets.json`'s `data`, and exits with "No saved Scryfall data. Run: python -m bindiver update" when either is missing.

- [ ] **Step 4: Run the whole Python suite**

Run: `.venv/bin/python -m pytest`
Expected: all pass.

- [ ] **Step 5: Rebuild the local database** (controller step; no download): `.venv/bin/python -m bindiver update --offline`. Expected: "Prices as of 2026-11-08", and `SELECT count(*) FROM versions WHERE quiet_kind != ''` is non-zero.

- [ ] **Step 6: Commit** — "Quiet kinds and set totals in the card database"

---

### Task 2: Phone database additions (Python)

**Files:**
- Modify: `bindiver/mtg/phone_db.py`
- Test: `tests/test_phone_db.py`

**Interfaces:**
- Consumes: Task 1's `versions.quiet_kind` and `sets.printed_total` in `cards.sqlite`.
- Produces, in the phone database:
  - `printings` columns, in order: `id, oracle_id, name, set_code, set_name, collector_number, released_at, lang, symbol_set, artist_id` (`artist_id INTEGER`, no `REFERENCES`, so a test can drop it), plus index `printings_set_number ON printings (set_code, collector_number)`
  - `artists (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)`: one row per distinct non-null artist of the kept printings, ids from 1 in name order (SQLite's default `BINARY` order)
  - `sets (code, name, icon_svg, printed_total)`
  - `versions` copied from `cards.sqlite` as before, so it gains `quiet_kind`
  - icon text with every ` fill="#000"` attribute removed: `re.sub(r'\sfill="#000"(?=[\s/>])', '', text)`

- [ ] **Step 1: Write the failing tests.** Update `ICONS` to include `{"lea": b'<svg><path fill="#000" d="M0"/></svg>'}` and the source fixture to Task 1's `sets` list. New or changed tests:
  - `test_printings_keep_only_phone_columns`: `PRAGMA table_info(printings)` names equal `PRINTING_COLUMNS`, which ends with `"artist_id"`.
  - `test_artists_are_stored_once`: `artists` holds `Gao Yan`, `Mark Poole`, `Mark Romanoski` with ids 1, 2, 3; every printing's `artist_id` joins to its `cards.sqlite` artist.
  - `test_set_number_index_exists`: `PRAGMA index_info(printings_set_number)` names `set_code`, `collector_number`.
  - `test_sets_carry_printed_total`: `7ed` 350, `lea` 295.
  - `test_versions_and_names_are_copied_unchanged` keeps passing with `quiet_kind` included.
  - `test_icon_fills_are_stripped`: `lea`'s `icon_svg` equals `'<svg><path d="M0"/></svg>'`; `7ed`'s is unchanged.
  - `test_oracle_filter_keeps_only_listed_cards` also asserts `artists` is empty for `{"nope"}`.

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/python -m pytest tests/test_phone_db.py -v`
Expected: FAIL on the new columns, table and index.

- [ ] **Step 3: Implement** in `write_phone_tables`: create `artists` and fill it with `INSERT INTO artists (name) SELECT DISTINCT artist FROM src.printings WHERE artist IS NOT NULL AND <printing filter> ORDER BY artist`, then fill `printings` with a `LEFT JOIN artists`.

- [ ] **Step 4: Run the Python suite.** Run: `.venv/bin/python -m pytest`. Expected: all pass.

- [ ] **Step 5: Measure** (controller step): `.venv/bin/python -m bindiver phone-db`. Record the database and zip sizes in the ledger. Expected: the zip within 2 MB of Plan 1's 24.5 MB.

- [ ] **Step 6: Commit** — "Phone database: artists, set-and-number index, printed totals, icon fills"

---

### Task 3: Golden fixture gains alert strength and quiet cards

**Files:**
- Modify: `bindiver/mtg/golden.py`, `tests/test_golden.py`
- Regenerate: `app/src/game/mtg/__fixtures__/` (all five files)
- Modify: `app/src/game/mtg/__tests__/lookup.test.ts` (case count)

**Interfaces:**
- Consumes: Task 1's `alert_strength`, `quiet_kinds_of`; Task 2's phone tables.
- Produces: `golden.json` cases each gain `"alert"` and `"quiet_kinds"`; `GOLDEN_NAMES` gains `"Explore"` (Secret Lair only at $10), `"Bone Saw"` (serialized only), `"Opt"` (old border and Secret Lair), `"Burnished Hart"` (Secret Lair and serialized), giving 54 names and 486 cases. `golden.sqlite` now has `artists`, `printed_total`, `quiet_kind` and the index.

- [ ] **Step 1: Write the failing test** in `tests/test_golden.py`: every case has `alert` in `{"full", "quiet", "none"}`; a case with `alert == "quiet"` has non-empty `quiet_kinds`, all in `QUIET_KINDS`; the others have `[]`; with the real database, `Explore` at 1000 cents is `"quiet"` with `["Secret Lair"]` (skip that check when `data/cards.sqlite` is missing, as the existing real-data tests do).

- [ ] **Step 2: Run it to see it fail.** Run: `.venv/bin/python -m pytest tests/test_golden.py -v`. Expected: FAIL (`KeyError: 'alert'`).

- [ ] **Step 3: Implement** the two new case fields in `golden_cases` and the four names.

- [ ] **Step 4: Regenerate the fixture** (controller step, after Task 1's rebuild): `.venv/bin/python -m bindiver golden --out app/src/game/mtg/__fixtures__`. Expected: "Wrote golden fixtures".

- [ ] **Step 5: Run both suites.** `.venv/bin/python -m pytest` and `cd app && npx jest && npx tsc --noEmit`. Expected: pass after changing `lookup.test.ts`'s `450` to `486`. No other TypeScript change is needed yet.

- [ ] **Step 6: Commit** — "Golden fixture: alert strength and quiet cards"

---

### Task 4: The `check-log` command

**Files:**
- Create: `bindiver/mtg/check_log.py`, `tests/test_check_log.py`
- Modify: `bindiver/__main__.py`, `tests/conftest.py` (a `make_card(**over)` helper)

**Interfaces:**
- Consumes: `Catalog.lookup`, Task 1's `alert_strength`.
- Produces:

```python
@dataclass(frozen=True)
class LogCheck:
    compared: int                                   # rows checked against the Mac
    disagreements: list[tuple[str, str, str]]       # (name, phone alert, Mac alert)
    skipped: list[tuple[str, str]]                  # (name, reason): "marked wrong", "not found"
    phone_counts: dict[str, int]                    # "full", "quiet", "known", "none", over rows not marked wrong
    showcase_only: list[str]                        # Mac full alerts whose full versions are all showcase or borderless
    log_price_dates: list[str]                      # distinct, sorted
    mac_price_date: str

def check_log(catalog: Catalog, db_path, csv_path) -> LogCheck
def format_check(check: LogCheck) -> str
```

  - **The phone's alert** is the CSV's `alert` column (Task 9 adds it: `full`, `quiet`, `known`, `none`). A camera-test CSV without it counts `alerted == "yes"` as `full`, else `none`.
  - **The Mac's alert** is `alert_strength(catalog.lookup(name, min_cents / 100).groups)`. A match other than `exact` or `token` is skipped as "not found"; `token` gives `none`.
  - **Known rows** are counted but not compared, since the Mac has no known marks.
  - **Showcase or borderless:** a full-alert version is showcase when its printing's `frame_effects` holds `"showcase"`, borderless when `border_color = 'borderless'` (read from `db_path`'s `printings`).
  - **`format_check` output** (exact wording):

```
Checked 142 reads against prices as of 2026-11-08: 0 disagree.
Phone alerts: 11 full, 19 quiet, 3 known, 109 none.
Full alerts only from showcase or borderless versions: 2 (Name A, Name B)
Skipped: Name C (marked wrong)
Disagree: Name D: phone full, Mac quiet
Warning: the log's prices are from 2026-11-07; the Mac's are from 2026-11-08.
```

  The "Skipped", "Disagree" and "Warning" lines appear only when there is something to say.
  - **CLI:** `python -m bindiver check-log run.csv` prints `format_check`.

- [ ] **Step 1: Write the failing tests.** Build a small database with `make_card`, which fills `games=["paper"]`, `layout="normal"`, `lang="en"`, `finishes=["nonfoil"]` and the rest. Cards, all `usd`:
  - "Old Thing": `lea`, 1993, frame "1993", $40 → quiet
  - "Lair Thing": `sld` "Secret Lair Drop", 2022, frame "2015", $25 → quiet
  - "Shiny Thing": `m21`, frame "2015", `frame_effects=["showcase"]`, $30, plus a `lea` printing at $50 → full, showcase only
  - "Plain Thing": `m21`, frame "2015", $12 → full
  - "Cheap Thing": `m21`, $1 → none

  Tests on CSV text written to `tmp_path`:
  - all five rows agreeing give `compared == 5`, no disagreements, and `showcase_only == ["Shiny Thing"]`
  - phone `full` for "Old Thing" is a disagreement `("Old Thing", "full", "quiet")`
  - a `known` row is counted in `phone_counts["known"]` and not compared
  - a `marked_wrong=yes` row is skipped as "marked wrong"
  - "Nope Thing" is skipped as "not found"
  - a row priced `2026-11-07` produces the Warning line
  - a CSV with no `alert` column reads `alerted`
  - `format_check` gives the exact lines above for one fixed `LogCheck`

- [ ] **Step 2: Run them to see them fail.** Run: `.venv/bin/python -m pytest tests/test_check_log.py -v`. Expected: FAIL (no module).

- [ ] **Step 3: Implement** with `csv.DictReader`.

- [ ] **Step 4: Run the Python suite.** Expected: all pass.

- [ ] **Step 5: Try it** (controller step) on Plan 1's iPhone run 6 CSV from the scratchpad. Expected: 28 compared, none disagree. Run 6 has no `alert` column, and its 2 alerting cards are full on the Mac.

- [ ] **Step 6: Commit** — "check-log: replay a phone run against the Mac's lookup"

---

### Task 5: The nightly job and the test workflow

**Files:**
- Create: `bindiver/mtg/nightly.py`, `tests/test_nightly.py`, `.github/workflows/nightly-data.yml`, `.github/workflows/tests.yml`
- Modify: `bindiver/__main__.py`, `bindiver/mtg/bulk_data.py` (shares `price_date_of`)

**Interfaces:**
- Produces:
  - `nightly.should_build(manifest_price_date: str | None, scryfall_price_date: str, forced: bool) -> bool`: true when forced, when there's no manifest, or when the dates differ
  - `nightly.nightly_check(forced: bool, fetch_json: Callable[[str], dict | None]) -> bool`: `fetch_json` returns `None` for a 404
  - `python -m bindiver nightly-check [--forced]`: prints `build=true` or `build=false`, and appends the same line to the file named by `$GITHUB_OUTPUT` when it's set

- [ ] **Step 1: Write the failing tests:**
  - same date, not forced → False
  - same date, forced → True
  - newer Scryfall date → True
  - no manifest → True
  - `nightly_check` with a fake `fetch_json` reads the manifest's `price_date` and the bulk listing's `updated_at` (`"2026-11-09T09:04:12.345+00:00"` → `"2026-11-09"`)
  - the CLI writes `build=false` to a temp `GITHUB_OUTPUT`

- [ ] **Step 2: Run them to see them fail.** Run: `.venv/bin/python -m pytest tests/test_nightly.py -v`. Expected: FAIL (no module).

- [ ] **Step 3: Implement.** The real `fetch_json` uses `bulk_data`'s headers and SSL context, and its endpoints are `bulk_data.BULK_ENDPOINT` and `https://github.com/Angrod/BinDiver/releases/download/data-latest/manifest.json`.

- [ ] **Step 4: Write `.github/workflows/nightly-data.yml`** (spec 1.2):
  - Triggers: `schedule: cron '17 */6 * * *'`, `workflow_dispatch`, and `push` to `main` with `paths: ['bindiver/**']`.
  - Settings: `permissions: contents: write`; `concurrency: nightly-data`; `runs-on: ubuntu-latest`.
  - Steps:
    1. checkout
    2. setup-python `3.14`
    3. `pip install -e .`
    4. `python -m bindiver nightly-check`, plus `--forced` unless `github.event_name == 'schedule'`
    5. Only when `build == 'true'`:
       - restore and save `data/set_icons` with `actions/cache` (key `set-icons-${{ github.run_id }}`, restore key `set-icons-`)
       - `python -m bindiver update`
       - `python -m bindiver phone-db`
       - with `GH_TOKEN: ${{ github.token }}`: upload the new zip (`gh release upload data-latest data/<file from manifest.json> --clobber`), then `data/manifest.json` the same way, then delete every other `cards-phone-*.zip` asset of `data-latest` with `gh release delete-asset data-latest <name> -y`
  - Use each action's current major release: check with `gh api repos/actions/<name>/releases/latest --jq .tag_name`.

- [ ] **Step 5: Write `.github/workflows/tests.yml`.** Trigger: `on: [push, pull_request]`. Two jobs:
  - `python`: setup-python `3.14`, `pip install -e '.[dev]'`, `pytest`
  - `app`: setup-node `26` with npm caching on `app/package-lock.json`, then in `app/`: `npm ci`, `npx tsc --noEmit`, `npx jest`

- [ ] **Step 6: Check both files parse** with macOS's own Ruby: `ruby -ryaml -e 'YAML.load_file(ARGV[0])' <file>`. Expected: no error. The workflows first run in Task 16.

- [ ] **Step 7: Commit** — "Nightly data job and test workflow"

---

### Task 6: Quiet kinds, data features and basic lands in the game

**Files:**
- Create: `app/src/game/mtg/features.ts`, `app/src/game/mtg/basics.ts`, `app/src/testing/oldFormat.ts`, `app/src/game/mtg/__tests__/features.test.ts`
- Modify: `app/src/game/mtg/types.ts`, `app/src/game/mtg/lookup.ts`, `app/src/game/mtg/index.ts`, `app/src/game/types.ts`
- Test: `app/src/game/mtg/__tests__/game.test.ts`

**Interfaces:**
- Consumes: Task 3's fixture.
- Produces:
  - `Version.quietKind: string` (`''` when the data has no `quiet_kind`)
  - `features.dataFeatures(db: Db): { quietKind: boolean; numberSearch: boolean }`. `numberSearch` needs the `artists` table, `printings.artist_id` and `sets.printed_total`.
  - `lookupGroups(db, oracleIds, minCents, order, hasQuietKind = true)`: selects `'' AS quiet_kind` when false
  - `basics.BASIC_LAND_NAMES`: the 12 names "Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes", and "Snow-Covered " + each of those six
  - `basics.basicLands(db: Db): KnownCard[]`: each name resolved through `resolveExact`, missing ones left out
  - In `game/types.ts`: `export interface KnownCard { oracleId: string; name: string }`, and `Game` gains:

```ts
  /** Quiet kinds in label order: 'old border', 'Secret Lair', 'serialized'. */
  readonly quietKinds: readonly string[];
  /** Whether the card data supports set-and-number and number/total searches (Task 7). */
  readonly numberSearch: boolean;
  /** The basic lands that start as known. */
  basicLands(): KnownCard[];
```

  `game/types.ts` also re-exports `Version`, `CardGroup` and `SortOrder` from `./mtg/types`, so code outside `game/mtg` imports them from `game/types`.
  - `testing/oldFormat.ts`: `oldFormatCopy(src: string): Db`. It copies the file with `VACUUM INTO` a temp path, then runs `ALTER TABLE versions DROP COLUMN quiet_kind; ALTER TABLE sets DROP COLUMN printed_total; ALTER TABLE printings DROP COLUMN artist_id; DROP TABLE artists;`.

- [ ] **Step 1: Write the failing tests.**
  - `features.test.ts`: golden gives `{quietKind: true, numberSearch: true}`; `oldFormatCopy(golden)` gives both false.
  - `game.test.ts`:
    - Explore at 1000 cents has every qualifying `quietKind === 'Secret Lair'`.
    - On the old-format copy, `createMtgGame` builds, `matchTitle('Fireball')` matches, `lookup` returns versions all with `quietKind === ''`, and `numberSearch` is false.
    - `basicLands()` on golden returns Island, the only basic in the fixture.
    - `quietKinds` equals `['old border', 'Secret Lair', 'serialized']`.

- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/game`. Expected: FAIL.

- [ ] **Step 3: Implement.** `createMtgGame` calls `dataFeatures` once.

- [ ] **Step 4: Run all tests and the type check.** `npx jest && npx tsc --noEmit`. Expected: pass.

- [ ] **Step 5: Commit** — "Game: quiet kinds, data features, basic lands"

---

### Task 7: Typed search by set and number, and by number/total

**Files:**
- Create: `app/src/game/mtg/search.ts`, `app/src/game/mtg/__tests__/search.test.ts`
- Modify: `app/src/game/mtg/index.ts`, `app/src/game/types.ts`

**Interfaces:**
- Consumes: Task 6's `numberSearch`.
- Produces, in `game/types.ts`:

```ts
export type SearchKind = 'name' | 'set-number' | 'number-total';
export interface PrintingRef {
  oracleId: string; name: string; scryfallId: string; setCode: string; setName: string;
  collectorNumber: string; releasedAt: string; artistId: number | null; artist: string | null;
  symbolSet: string | null;
}
export interface PrintingHit { match: CardMatch; printing: PrintingRef } // match.match is 'typed'
export interface ArtistOption { id: number; name: string }
// Game gains:
  /** What kind of search the text could be; 'name' when number searches are off. */
  searchKind(text: string): SearchKind;
  /** The printing a set-and-number text names, or null. */
  findPrinting(text: string): PrintingHit | null;
  /** Number/total: printings from 1998 on, numbered so, in a set of that printed total. At most 50. */
  numberCandidates(text: string): PrintingRef[];
  /** Artists of these candidates whose name matches the typed text, at most `limit`, by name. */
  artistOptions(candidates: PrintingRef[], typed: string, limit: number): ArtistOption[];
```

  - In `search.ts`: `parseSearch(text: string): ParsedSearch`, where

```ts
export type ParsedSearch =
  | { kind: 'name' }
  | { kind: 'set-number'; pairs: Array<{ set: string; number: string }> }
  | { kind: 'number-total'; number: string; total: number };
```

  - **The parsing algorithm** (spec 3.1):
    1. Lowercase and trim. `*` reads as `★`.
    2. `^(\d+)\s*/\s*(\d+)$` gives number-total, with leading zeros dropped.
    3. Otherwise split on spaces and drop single-letter tokens (the rarity letter).
    4. A token like `123/281` keeps only its part before the slash.
    5. One remaining token matching `^[a-z0-9]{2,5}-[a-z0-9]+$` is The List: `[{set: 'plst', number: token}]`.
    6. Two remaining tokens: a **set token** matches `^[a-z0-9]{2,6}$` and holds a letter, and a **number token** matches `^(\d+)([a-z★†]{0,2})$`, normalized to its digits without leading zeros (`'0'` stays `'0'`) plus the suffix. The pairs are (first as set, second as number), then the reverse, keeping each reading that fits.
    7. Anything else is a name.
  - `findPrinting` tries each pair, in order, with `WHERE p.set_code = ? AND p.collector_number = ? COLLATE NOCASE ORDER BY (p.lang = 'en') DESC, p.id LIMIT 1`, and builds `match` from `cardName`.
  - `numberCandidates` uses `JOIN sets s ON s.code = p.set_code WHERE p.collector_number = ? AND s.printed_total = ? AND p.released_at >= '1998-01-01' ORDER BY p.released_at, p.set_code, p.id LIMIT 50`. Both use `LEFT JOIN artists` for the artist name.
  - `artistOptions` matches when `normalizeName(typed)` is a prefix of the normalized artist name or of one of its words.
  - With `numberSearch` false, `searchKind` returns `'name'`, `findPrinting` null and `numberCandidates` `[]`.

- [ ] **Step 1: Write the failing tests.** `parseSearch` table:

| Text | Result |
| --- | --- |
| `MOM 123`, `mom 0123`, `123 MOM`, `R 0123 MOM`, `MOM 123/281` | set-number `[{set:'mom', number:'123'}]` |
| `MOM 250P` | `[{set:'mom', number:'250p'}]` |
| `7ED 253★`, `7ed 253*` | `[{set:'7ed', number:'253★'}]` |
| `10E 252` | `[{set:'10e', number:'252'}]` |
| `KLD-242`, `plst KLD-242` | `[{set:'plst', number:'kld-242'}]` |
| `38/143`, `038 / 143` | number-total `{number:'38', total:143}` |
| `Fire 2` | set-number `[{set:'fire', number:'2'}]` |
| `Fireball`, `123`, `Jace, the Mind Sculptor`, `` | name |

  Game tests on golden:
  - `findPrinting('2XM 44')`, `('44 2xm')` and `('C 0044 2XM')` each give name "Brainstorm", setCode `2xm`, collectorNumber `44`.
  - `findPrinting('7ed 253*')` gives "Llanowar Elves" `253★`.
  - `findPrinting('C18-222')` gives "Sol Ring" in `plst`.
  - `findPrinting('Fire 2')` and `('ZZZ 1')` give null.
  - `numberCandidates('61/350')` names include "Counterspell" (`6ed`) and "Brainstorm" (`mmq`), and every `releasedAt >= '1998-01-01'`.
  - `numberCandidates('77/460')` has no `5ed` printing.
  - `artistOptions(numberCandidates('61/350'), 'hann', 5)` gives `[{name: 'Hannibal King', …}]`.
  - On `oldFormatCopy`: `searchKind('2XM 44') === 'name'`, `findPrinting` null.

- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/game`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run all tests and the type check.** Expected: pass.

- [ ] **Step 5: Commit** — "Search by set and number, and by number/total"

---

### Task 8: The alert rule, labels, rates and signal plan

**Files:**
- Create: `app/src/alert/alert.ts`, `app/src/alert/signal.ts`, `app/src/alert/__tests__/alert.test.ts`, `app/src/alert/__tests__/signal.test.ts`

**Interfaces:**
- Consumes: `CardGroup`/`Version` from `game/types`, `Game.quietKinds`.
- Produces:

```ts
// alert.ts
export type AlertKind = 'full' | 'quiet' | 'none';
export interface KnownMarks {
  isKnown(oracleId: string): boolean;
  kept(oracleId: string): ReadonlySet<string>; // version keys still alerting
}
export const NO_MARKS: KnownMarks;
export interface Alert { kind: AlertKind; known: boolean; count: number; quietKinds: string[]; label: string | null }
export function alertFor(groups: CardGroup[], minCents: number, marks: KnownMarks, kindOrder: readonly string[]): Alert;
export function priceLabel(minCents: number): string;          // 1000 → '$10+', 750 → '$7.50+', 100000 → '$1,000+'
export function maxAlertCents(groups: CardGroup[], marks: KnownMarks): number | null;
export const PRESET_CENTS: readonly number[];                  // [200, 500, 1000, 2000, 5000]
export const RATE_MIN_CARDS = 50;
export function alertRates(maxes: Array<number | null>, presets: readonly number[]): Map<number, number> | null;
// signal.ts
export type AlertStyle = 'vibration' | 'sound' | 'both' | 'screen';
export type ResultSource = 'camera' | 'search' | 'redraw';
export function signalPlan(kind: AlertKind, source: ResultSource, style: AlertStyle): { vibrate: boolean; sound: boolean };
```

  - **The rule** (spec 3.2 and 4.1):
    - The considered versions are each group's `qualifying`. For a group whose oracle ID is known, only those in its kept set count.
    - `kind` is `none` when nothing is considered, `full` when any considered version has `quietKind === ''`, and `quiet` otherwise.
    - `count` is the number considered. `known` is true when every group is known.
    - `quietKinds` holds the considered kinds in `kindOrder`, for `quiet` only.
  - **Labels:**
    - full, not known: "Worth finding"
    - quiet, not known: `<kinds> only · <count> version(s) at <priceLabel>`. `<kinds>` joins the kinds with ", " and a final " or ", then uppercases the first letter: "Old border only · 3 versions at $10+", "Old border or Secret Lair only · 4 versions at $10+", "Old border, Secret Lair or serialized only · 5 versions at $10+", "Serialized only · 1 version at $10+".
    - known with kind none: "Known"
    - known with kind full or quiet: "Known · 1 version still alerts" or "Known · 2 versions still alert"
    - none, not known: `null`
  - **Rates:**
    - `maxAlertCents` is the highest price among versions that would give a full alert at a $0 price: priced, `quietKind === ''`, and kept when the card is known. It is `null` when there are none.
    - `alertRates` returns `null` below 50 cards. Otherwise, for each preset, the share of cards whose max is at or above it.
  - **Signal:** `signalPlan` signals only for `full` from `camera`, `vibrate` for vibration or both, `sound` for sound or both; `screen` signals nothing.

- [ ] **Step 1: Write the failing tests.**
  - `alertFor` on hand-made groups covers every label above, plus:
    - an unpriced old-border version doesn't count
    - a known card with no kept versions: `{kind: 'none', known: true, count: 0, label: 'Known'}`
    - a known card whose kept version is below the price: `none`
    - a kept `''` version: full, "Known · 1 version still alerts"
    - two kept old-border versions: quiet, "Known · 2 versions still alert"
    - two groups, one known and one not: `known: false`
  - `priceLabel` for 200, 1000, 750, 1999 and 100000.
  - `alertRates`: 49 cards give `null`; 50 cards with maxes 30×`null`, 10×`1500`, 10×`6000` give `{200: 0.4, 500: 0.4, 1000: 0.4, 2000: 0.2, 5000: 0.2}`.
  - **Golden parity:** for every golden case, `alertFor(lookupGroups(golden, resolveExact(…).oracleIds, c.min_cents, c.order), c.min_cents, NO_MARKS, game.quietKinds)` has `kind === c.alert` and `quietKinds` equal to `c.quiet_kinds`. This test may import `game/mtg` because it is a test.
  - `signalPlan` table: every kind × source × style. Only `('full', 'camera', not 'screen')` signals, and `'redraw'` never does.

- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/alert`. Expected: FAIL.

- [ ] **Step 3: Implement.** `priceLabel` reuses `game/mtg/money.dollars` through a small re-export in `game/types.ts`: `export { dollars } from './mtg/money'`.

- [ ] **Step 4: Run all tests and the type check.** Expected: pass.

- [ ] **Step 5: Commit** — "Alert rule: full and quiet alerts, labels, rates, signal plan"

---

### Task 9: Known cards, settings, scan alerts and basics in `user.sqlite`

**Files:**
- Create: `app/src/user/settings.ts`, `app/src/user/basics.ts`, `app/src/user/__tests__/settings.test.ts`, `app/src/user/__tests__/known.test.ts`
- Modify: `app/src/user/store.ts`, `app/src/user/schema.ts`, `app/src/user/runReport.ts`
- Test: `app/src/user/__tests__/store.test.ts`, `app/src/user/__tests__/runReport.test.ts`

**Interfaces:**
- Consumes: Task 8's `KnownMarks`, `AlertStyle`; Task 6's `KnownCard`, `Game.basicLands`.
- Produces:
  - `USER_VERSION = 3`. Migration 3 adds `scans.alert TEXT NOT NULL DEFAULT ''`, guarded by `hasColumn`.
  - `NewScan.alert: 'full' | 'quiet' | 'known' | 'none'`; `Scan.alert` is `''` for older rows. `alerted` is stored as `alert === 'full'`.
  - `UserStore` gains:

```ts
  markKnown(card: KnownCard, at: string): void;
  unmarkKnown(oracleId: string): void;          // also removes its kept versions
  knownCards(): Array<KnownCard & { markedAt: string }>; // by name
  knownMarks(): KnownMarks;                     // a snapshot
  setKeptVersion(oracleId: string, versionKey: string, kept: boolean): void;
  scannedCards(): Array<{ oracleIds: string[]; name: string }>; // distinct oracle_id values, tokens ('' oracle_id) left out
```

  - `CSV_HEADER` gains `alert` after `alerted`.
  - `settings.ts`:

```ts
export interface AppSettings {
  minCents: number; alertStyle: AlertStyle; shorthand: boolean; sort: SortOrder;
  allowCellular: boolean; testMode: boolean;
}
export const DEFAULT_SETTINGS: AppSettings = {
  minCents: 1000, alertStyle: 'vibration', shorthand: true, sort: 'oldest', allowCellular: false, testMode: false,
};
export function readSettings(store: Pick<UserStore, 'getSetting'>): AppSettings;
export function writeSetting<K extends keyof AppSettings>(store: Pick<UserStore, 'setSetting'>, key: K, value: AppSettings[K]): void;
```

  - **Setting keys:** `min_cents`, `alert_style`, `shorthand` (`'1'`/`'0'`), `sort`, `allow_cellular` (`'1'`/`'0'`, as Plan 1 stored it), `test_mode`. A missing or invalid value reads as the default. `min_cents` must be an integer from 1 to 10,000,000.
  - `basics.ts`: `BASICS_SEEDED = 'basics_seeded'`; `seedBasicsOnce(store: UserStore, game: Pick<Game, 'basicLands'>, at: string): number`. It marks every basic not already known, then sets `basics_seeded = '1'`, and returns how many it marked. It does nothing once the flag is set. When `basicLands()` is empty, it doesn't set the flag.

- [ ] **Step 1: Write the failing tests:**
  - `markKnown`, `knownCards`, `knownMarks().isKnown`
  - `setKeptVersion` on and off, with `kept()` reflecting it
  - `unmarkKnown` clears its kept versions
  - `scannedCards` dedupes and skips tokens
  - migration 3 runs on a version-2 log and again on a log already holding `alert` (set `PRAGMA user_version = 2` by hand)
  - `recordScan` stores `alert` and `alerted`
  - `runToCsv` writes the `alert` column
  - `readSettings` defaults on an empty store; round-trips every key; falls back on `min_cents = 'abc'`, `'0'` and `sort = 'sideways'`
  - **seeding runs once:** seed with `basicLands` returning Island and Plains → 2 marked; unmark Island; seed again → 0, and Island stays unmarked
  - an empty `basicLands` leaves the flag unset

- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/user`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run all tests and the type check.** Expected: pass. Fix any caller of `recordScan` (`ScanScreen.tsx`) with `alert: versions > 0 ? 'full' : 'none'` for now; Task 13 replaces it.

- [ ] **Step 5: Commit** — "Known cards, settings, scan alerts and basics seeding"

---

### Task 10: The two-slot data swap

**Files:**
- Modify: `app/src/data/refresh.ts`, `app/src/data/expoIO.ts`, `app/src/state/AppData.tsx`
- Test: `app/src/data/__tests__/refresh.test.ts`

**Interfaces:**
- Consumes: `UserStore` settings, Task 9's `readSettings` and `seedBasicsOnce`.
- Produces:

```ts
export type Slot = 'a' | 'b' | 'legacy';
export const SLOT_FILES: Record<Slot, string>; // a: 'cards-a.sqlite', b: 'cards-b.sqlite', legacy: 'cards-phone.sqlite'
export const LIVE_SLOT_KEY = 'live_slot';
export const PART_ZIP = 'download.zip.part';
export function parseSlot(v: string | null): Slot;     // 'a' | 'b', else 'legacy'
export function nextSlot(live: Slot): 'a' | 'b';       // 'a' → 'b'; 'b' and 'legacy' → 'a'
export interface RefreshIO {
  fetchManifest(url: string): Promise<unknown>;
  download(url: string, to: string): Promise<void>;
  sha256(name: string): Promise<string>;
  unzip(zipName: string, entry: string, to: string): Promise<void>;
  readMeta(dbName: string): { price_date: string; phone_format: string };
  setLive(slot: 'a' | 'b'): void;   // records the live slot in user.sqlite
  closeLive(): void;
  remove(name: string): void;       // no error when missing
}
export type RefreshResult =
  | { status: 'updated'; priceDate: string; live: 'a' | 'b' }
  | { status: 'up-to-date' } | { status: 'app-too-old' } | { status: 'failed'; error: string };
export async function refresh(io: RefreshIO, local: { priceDate: string | null; live: Slot }): Promise<RefreshResult>;
```

  - **The order of operations:**
    1. Remove `PART_ZIP`, the target slot's file and its `-wal`/`-shm`, and, when live isn't `legacy`, the legacy file with its `-wal`/`-shm` and Plan 1's `cards-phone.sqlite.part`.
    2. Fetch the manifest and decide.
    3. Download to `PART_ZIP` and check its sha256.
    4. Unzip `cards-phone.sqlite` into the target slot's file.
    5. Check `readMeta`.
    6. `setLive(target)`.
    7. `closeLive()`, then remove the old live file and its `-wal`/`-shm`. A throw here is caught: the result is still `updated`.
    8. Remove `PART_ZIP`.
  - **A failure before step 6** removes the target file and `PART_ZIP` and returns `failed`.
  - **`AppDataValue` gains:**
    - `settings: AppSettings`, `setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void`
    - `marks: KnownMarks`, `markKnown(card: KnownCard): void`, `unmarkKnown(oracleId: string): void`, `setKept(oracleId: string, versionKey: string, kept: boolean): void` (each refreshes `marks`)
    - `checkNow(confirmed: boolean): Promise<'ok' | 'ask' | 'offline'>`: `'ask'` when on cellular with downloads off and not confirmed
    - `lastCheckError: string | null`, stored as the `last_check_error` setting and cleared by a good check
    - `appTooOld: boolean`
    - `dataBytes: number | null`: the live file's size
  - **`openLive`** opens `SLOT_FILES[parseSlot(user.getSetting('live_slot'))]` and calls `seedBasicsOnce` after the game is built.
  - **The app-too-old message** becomes "Update the app to get newer prices".

- [ ] **Step 1: Write the failing tests.** Rewrite `makeIO` over an in-memory file system (`Set<string>` of names, plus `live`):
  - `download` and `unzip` add their target
  - `remove` deletes
  - `setLive` sets `live`

  Tests:
  - from `legacy`, an update downloads into `cards-a.sqlite`, sets live `a`, and removes `cards-phone.sqlite` with its `-wal` and `-shm`
  - from `a`, it goes to `b` and removes `cards-a.sqlite`
  - a bad checksum leaves live and the files of the live slot untouched, and removes the target and `PART_ZIP`
  - a newer `phone_format` returns `app-too-old` and downloads nothing
  - a failing remove after `setLive` still returns `updated`
  - no call ever names `user.sqlite`
  - **crash at any step:** for each IO call index k, make the kth call throw. Assert that afterwards the file of the slot recorded as live (the last `setLive`, else the starting slot) is still in the set, and was never written by `download` or `unzip`.
  - `parseSlot` and `nextSlot` tables

- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/data`. Expected: FAIL.

- [ ] **Step 3: Implement** `refresh.ts` and the matching `expoIO.ts` (`setLive` writes `live_slot` through a callback; `move` goes away). Then wire `AppData.tsx`: the live slot, settings, marks, `checkNow`, errors and sizes. `SetupScreen` keeps using `downloadNow`.

- [ ] **Step 4: Run all tests and the type check.** Expected: pass.

- [ ] **Step 5: Commit** — "Two-slot data swap"

---

### Task 11: The result panel's text

**Files:**
- Create: `app/src/screens/resultView.ts`, `app/src/screens/__tests__/resultView.test.ts`

**Interfaces:**
- Consumes: `Version`, `CardGroup`, `dollars` from `game/types`; Task 8's `priceLabel`.
- Produces:

```ts
export interface RowView {
  key: string; scryfallId: string; setName: string;
  numberTag: string | null;           // '#57' when another row in the same list has this set name
  finishTag: 'foil' | 'etched' | null;
  price: string;                      // '$13.99' or 'unpriced'
  symbolSet: string | null; noSymbol: boolean;   // noSymbol when symbolSet === 'none'
  lookFor: string; notes: string[]; sameAs: string | null; thisVersion: boolean;
}
export function rowViews(list: Version[], byKey: Map<string, Version>, thisVersion: string | null): RowView[];
export function countLine(qualifying: number, total: number, minCents: number): string;   // '4 of 49 versions at $10+'
export function stickyLine(qualifying: number, unpriced: number, minCents: number): string; // '4 at $10+ · 7 unpriced'
export function nothingLines(total: number, minCents: number): [string, string];           // ['Nothing at $10+', '0 of 26 versions. No alert.']
export function readAsLine(lineUsed: string): string; // 'Read as “Bloodfell Caues”. Not this card? Tap Search.'
export function missingVersionLine(setCode: string, collectorNumber: string, minCents: number): string; // "This version (MOM #123) isn't at $10+."
export function formatPriceDate(priceDate: string, today: Date): string; // 'Nov 4', or 'Nov 4, 2025' in another year
export function parsePrice(text: string): number | null; // cents
export function formatBytes(bytes: number): string;     // '56 MB'
```

  - **`sameAs`** is `"Looks the same as " + parts + ". Check a reference image."`.
    - Each part is `<set name> #<number>` plus ` foil` or ` etched` when not nonfoil, then ` (<price or unpriced>)`.
    - Parts are joined with ", " and a final " and ".
    - It is `null` when `sameAs` is empty. Keys missing from `byKey` are left out.
  - **`stickyLine`** drops " · 0 unpriced".
  - **`parsePrice`:**
    - accepts `7`, `7.5`, `7.50`, `$7.50` and ` 12 `
    - rejects ``, `0`, `-3`, `abc`, `7.555` and anything over $100,000
  - **`missingVersionLine`** is for a typed version that is in neither list. The app never shows that version's price, since it never says what the card in hand is worth.

- [ ] **Step 1: Write the failing tests** for each function, using the examples above. Two rows of "The Zeta Set" get `#57` and `#178`; a lone set gets `null`. The tests also cover a foil row's `finishTag`, `noSymbol` for `symbolSet` `'none'`, `formatPriceDate('2026-11-04', new Date(2026, 10, 9))` = `'Nov 4'`, and the same date with a 2027 today = `'Nov 4, 2026'`.

- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/screens`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run all tests and the type check.** Expected: pass.

- [ ] **Step 5: Commit** — "Result panel text"

---

### Task 12: Theme, set icons and the alert sound (device layer)

**Files:**
- Create: `app/src/screens/theme.ts`, `app/src/screens/SetIcon.tsx`, `app/src/alert/useAlertSignal.ts`, `app/scripts/make_alert.py`, `app/assets/alert.wav`
- Modify: `app/package.json` and `app/package-lock.json` (`npx expo install react-native-svg`), `app/app.json` (add `"android.permission.VIBRATE"`)

**Interfaces:**
- Produces:
  - `theme.ts`: `interface Theme`, `DARK`, `LIGHT`, `useTheme(): Theme` (from `useColorScheme`). Fields and values:

| Field | Dark (from the mockup) | Light |
| --- | --- | --- |
| `bg` | `#0f1012` | `#f6f6f4` |
| `panel` | `#1a1c20` | `#ffffff` |
| `rowOpen` | `#212328` | `#f0f0ee` |
| `text` | `#f2f2f0` | `#141516` |
| `muted` | `#a9adb3` | `#5c6168` |
| `border` | `#3a3e45` | `#c4c8cd` |
| `divider` | `#2c2f35` | `#e2e4e7` |
| `greyPanelBorder` | `#33363c` | `#c4c8cd` |
| `accent` (full alert border, chip) | `#ff9f43` | `#e07b12` |
| `onAccent` | `#1a1206` | `#1a1206` |
| `quiet` (quiet outline, label) | `#e5a50a` | `#a36b00` |
| `link` | `#ffb469` | `#b35a00` |
| `lookAlikeText` / `lookAlikeBg` / `lookAlikeBorder` | `#ffd0a1` / `#2a2219` / `#4a3a28` | `#6b3a00` / `#fff3e6` / `#f0c999` |
| `camera` | `#24262a` | `#24262a` |

  Every text colour must reach 4.5:1 on its background. Check the light column with a contrast script, and darken any light value that fails.
  - `SetIcon({ svg, size, color })` renders `SvgXml` with `fill={color}`, or nothing when `svg` is null.
  - `useAlertSignal(): (plan: { vibrate: boolean; sound: boolean }) => void` uses `Vibration.vibrate(400)` and an `expo-audio` player on `assets/alert.wav`, logging and swallowing errors as Plan 1's tick does.
  - `make_alert.py` writes `alert.wav`: 16-bit mono 44.1 kHz, 0.18 s at 880 Hz then 0.18 s at 1320 Hz, 10 ms fades, peak −6 dBFS, standard library only (as `make_tick.py`).

- [ ] **Step 1: Install and generate.** Run `cd app && npx expo install react-native-svg` and `python3 scripts/make_alert.py`. Expected: the package added at Expo 58's pinned version, and `assets/alert.wav` written.

- [ ] **Step 2: Write the theme, icon and signal files.** Run a contrast check (a short Node script in the scratchpad, using the WCAG luminance formula) over every text-on-background pair in both themes. Expected: every pair ≥ 4.5:1.

- [ ] **Step 3: Type check and tests.** `npx tsc --noEmit && npx jest`. Expected: pass. Jest never imports these files.

- [ ] **Step 4: Commit** — "Theme, set icons and the alert sound"

---

### Task 13: The scan screen and the result panel

**Files:**
- Create: `app/src/scan/result.ts`, `app/src/scan/__tests__/result.test.ts`, `app/src/screens/ResultPanel.tsx`, `app/src/screens/VersionRow.tsx`
- Modify: `app/src/screens/ScanScreen.tsx`, `app/src/screens/format.ts` (remove `versionsLine` and its test)

**Interfaces:**
- Consumes: everything from Tasks 6 to 12.
- Produces:

```ts
// scan/result.ts
export interface Shown { match: CardMatch; thisVersion: string | null } // scryfallId of a typed set-and-number version
export interface ResultModel { groups: CardGroup[]; alert: Alert }
export function resultModel(game: Game, shown: Shown, minCents: number, order: SortOrder, marks: KnownMarks): ResultModel;
export function scanAlert(model: ResultModel): 'full' | 'quiet' | 'known' | 'none';
```

  - `resultModel` gives `{groups: [], alert: none}` for a token.
  - `scanAlert` gives `'known'` when `alert.known && alert.kind === 'none'`, and otherwise `alert.kind`.
- **Behaviour:**
  - **Only the camera commit handler and the search pick** set `shown`, record the scan (`alert: scanAlert(model)`, `minCents: settings.minCents`) and call the signal with `signalPlan(model.alert.kind, source, settings.alertStyle)`.
  - **The panel's render** recomputes `resultModel` from `shown` with the current settings and marks, inside `useMemo`, and never records or signals.
  - **Layout** (spec 3.1, mockup `Main`, `Detail`, `Quiet`):
    - **Top strip:** "Prices as of <formatPriceDate>" (amber when stale), the price chip (`priceLabel`, opens the price sheet; Task 15) and a gear button (`accessibilityLabel` "Settings").
    - **Camera:** the top half, as now.
    - **Result panel:** the bottom half.
      - The panel's look follows the alert:
        - full: 3 px `accent` border, with the "Worth finding" chip or the known label in `accent`
        - quiet: 1.5 px `quiet` border, with the label in `quiet` text
        - known with kind none: `greyPanelBorder` and the "Known" chip
        - none: `greyPanelBorder`, with `nothingLines`
      - **Header:** the label chip, then "Mark known" (or "Unmark" when known), then the card name, `countLine`, the summary, `readAsLine` for tolerant and loose matches, and `missingVersionLine` when it applies.
      - **Rows:** `VersionRow` for each `rowViews` row: the set icon or the "no set symbol" badge, the set name and `numberTag`, the finish tag, the price, and a "This version" tag.
      - **Tapping a row** opens the look-for text, notes and `sameAs`. For a known card it also shows the "Still alert for this version" switch.
      - **Unpriced (N):** folded.
      - **Shorthand off:** each row shows its look-for text inline.
      - **Sticky line:** once the header scrolls away, the card name · `stickyLine`.
      - **Several cards:** each card's group is stacked with its own name, count, summary, rows and Mark known button. The label chip is for the whole result.
      - **A token:** "Token, not tracked".
    - **Bottom bar:** the Shorthand toggle, the sort menu ("Oldest first", "Newest first", "Highest price") and Search. All are remembered through `setSetting`.
  - **Test mode** (`settings.testMode`) keeps Plan 1's tick, Run button and run bar, the frame-size, last-read, counters and code-status lines, and the unmatched list. With test mode off, none of these show.
  - The rest of Plan 1's camera pipeline is unchanged.

- [ ] **Step 1: Write the failing tests** for `scan/result.ts` on golden:
  - Fireball at 1000 cents, oldest: `alert.kind` equals golden's `alert` for that case.
  - Fireball's oracle ID marked known with no kept versions: `scanAlert` is `'known'`.
  - The same, keeping one qualifying `''` version: `'full'`.
  - A `Saproling` token: `{groups: [], alert.kind: 'none'}`.
  - `thisVersion` passes through to the model's caller unchanged (the panel marks it).

- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/scan`. Expected: FAIL.

- [ ] **Step 3: Implement** `result.ts`, then the components and the `ScanScreen` rework.

- [ ] **Step 4: Run all tests and the type check.** Expected: pass.

- [ ] **Step 5: Commit** — "Scan screen: result panel, full and quiet alerts, bottom bar"

---

### Task 14: The search sheet

**Files:**
- Modify: `app/src/screens/SearchSheet.tsx`
- Create: `app/src/screens/searchList.ts`, `app/src/screens/__tests__/searchList.test.ts`

**Interfaces:**
- Consumes: Task 7's `Game` search methods.
- Produces:
  - `onPick(match: CardMatch, thisVersion: string | null)`, replacing `onPick(match)`
  - `searchList(game: Pick<Game, 'searchKind' | 'findPrinting' | 'suggest' | 'numberCandidates'>, text: string, artistId: number | null): SearchItem[]`, where

```ts
export type SearchItem =
  | { kind: 'name'; name: string }
  | { kind: 'printing'; hit: PrintingHit }        // shown first: "Brainstorm" / "Double Masters #44"
  | { kind: 'candidate'; printing: PrintingRef };  // number/total rows: name, set icon, set name #number, artist
```

  - For `set-number`, the printing hit (when found) goes first, then the name suggestions.
  - For `number-total`, only the candidates, narrowed to `artistId` when it's set.
  - For `name`, `suggest(text, 6)` as now.
- **Copy:**
  - With `game.numberSearch`, the box's label and hint are "Name, or set and number (MOM 123), or number/total (38/143)", with "Cards from before 1998 have no number: type the English name." below the box.
  - Without it, the label is "Card name (English)" with no note.
  - For number/total, an "Artist" box sits below the list; its options come from `artistOptions`. Picking an artist narrows the list, and clearing the box widens it again.
  - "No card by that name" shows as now.

- [ ] **Step 1: Write the failing tests** for `searchList` on golden:
  - `'2XM 44'` gives a printing item first, for Brainstorm.
  - `'Fire 2'` gives name items only, starting with "Fire // Ice" when the prefix rules give it. Assert that it contains name items and no printing item.
  - `'61/350'` gives candidate items only, including Counterspell. With Hannibal King's artist id, only Counterspell.
  - `'fireb'` gives names starting with "Fireb".

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.

- [ ] **Step 3: Implement** `searchList` and the sheet. A picked printing or candidate calls `onPick(hit.match, printing.scryfallId)`.

- [ ] **Step 4: Run all tests and the type check.** Expected: pass.

- [ ] **Step 5: Commit** — "Search sheet: names, set and number, number/total with artist"

---

### Task 15: The price sheet, settings and known cards screens

**Files:**
- Create: `app/src/screens/PriceSheet.tsx`, `app/src/screens/SettingsScreen.tsx`, `app/src/screens/KnownCardsScreen.tsx`, `app/src/screens/rates.ts`, `app/src/screens/__tests__/rates.test.ts`
- Modify: `app/src/screens/ScanScreen.tsx` (opens them), `app/src/screens/RunScreen.tsx` (exports its `shareCsv` helper as `shareRunCsv(user: UserStore, runId: number)` for Settings)

**Interfaces:**
- Consumes: Tasks 8 to 11.
- Produces: `rates.presetRates(game: Pick<Game, 'lookup'>, cards: Array<{ oracleIds: string[] }>, marks: KnownMarks): Map<number, number> | null`. It looks up each card once at 0 cents with `maxAlertCents`, then uses `alertRates` over `PRESET_CENTS`.
- **Price sheet** (mockup `Price`):
  - title "Alert at or above", sub "Remembered on this phone.", and Done
  - preset buttons `$2`, `$5`, `$10`, `$20`, `$50`, each with "<n>% alert" when the rates aren't null
  - "Or type any amount", with a `$` prefix and placeholder "e.g. 7.50", read by `parsePrice`
  - the footnote "Percentages: the share of card names you've scanned that would alert at each price." only when the rates show
  - Rates are worked out when the sheet opens, not on every render.
- **Settings** (spec 4.2, word for word):

| Section | What it shows |
| --- | --- |
| Alert price | The value, which opens the price sheet |
| Alert style | Vibration, sound, both, screen only |
| View | Shorthand switch, sort order |
| Card data | "Prices as of …"; `formatBytes(dataBytes)`; "Check for new prices now" (on `'ask'`, an alert "Download on cellular?" with Cancel and Download, then `checkNow(true)`); the "Allow downloads on cellular" switch; `lastCheckError`; "Update the app to get newer prices" when `appTooOld` |
| Known cards (N) | Opens the known cards screen |
| Camera test | "Test mode" switch, and Export (the latest run's CSV, disabled with no run) |
| About | The spec's two paragraphs verbatim, plus the code-status line from `useUpdateStatus` |

- **Known cards:** a search box filtering names case-insensitively, and a list with "Unmark" on each row.

- [ ] **Step 1: Write the failing tests** for `presetRates`:
  - 49 cards give `null`.
  - 50 cards built from golden (repeat golden oracle IDs to reach 50, which is fine for the arithmetic) give a map whose 200-cent rate is at least its 5000-cent rate.
  - A card marked known with no kept versions counts as not alerting.

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.

- [ ] **Step 3: Implement** `rates.ts` and the three screens.

- [ ] **Step 4: Run all tests and the type check.** Expected: pass.

- [ ] **Step 5: Commit** — "Price sheet, settings and known cards"

---

### Task 16: Data release, push and new builds (controller task, with Matt)

**Files:**
- Modify: `BUILD_BREAKDOWN.md` (the build notes)

**Interfaces:**
- Produces: new-format data on `data-latest` with a newer price date than Nov 8; `phase3-plan2` on GitHub with the tests workflow green; new iOS builds on the iPhone 13 and iPhone 15 Pro, and a new Android build on the Pixel 8.

- [ ] **Step 1: Ask Matt** for one OK covering four things:
  - the Scryfall download (`default_cards`, from Scryfall's bulk data, about 81 MB, plus the set list and any new set icons)
  - publishing the new data to `data-latest`
  - pushing `phase3-plan2`
  - publishing fixes from Step 6 as EAS updates to the `preview` channel

- [ ] **Step 2: Build and publish the data.** Run `.venv/bin/python -m bindiver update` and `.venv/bin/python -m bindiver phone-db`, then upload to `data-latest` in the nightly job's order: the zip, then the manifest, then delete the older zip. Check by downloading the manifest with `curl -sL` and comparing its sha256 with the local zip's. Camera-test builds keep working: `phone_format` is still 1.

- [ ] **Step 3: Push** with `git push -u origin phase3-plan2`, and read the Tests workflow's result once with `gh run list --branch phase3-plan2 --limit 1`. Expected: both jobs green. A red job is fixed before any build.

- [ ] **Step 4: Matt registers the iPhone 15 Pro.** He runs `npx eas-cli@27 device:create` in `app/` in his own terminal and opens the link on the 15 Pro.

- [ ] **Step 5: Builds.**
  - **iOS:** Matt runs `npx eas-cli@27 build --profile preview --platform ios` in his terminal. Apple sign-in may be needed to add the new device to the profile.
  - **Android:** the controller runs `npx eas-cli@27 build --profile preview --platform android --non-interactive`.
  - Both builds get a new runtime, because `react-native-svg` and the permission change the fingerprint. This ends Plan 1's iOS update workaround (R38), so record that in `BUILD_BREAKDOWN.md`.

- [ ] **Step 6: Matt installs** on all three phones, turns on Test mode in Settings, and walks through each screen in light and dark mode:
  - the grey code line names the new build, and the first launch keeps his scan history
  - typed results for Fireball (full), Juzám Djinn (quiet), Bloodfell Caves (nothing at the price) and Island ("Known"), each against its mockup board
  - a tapped row, the Unpriced fold, Shorthand off, and the sticky line
  - typed "2XM 44" opens Brainstorm with "This version"; "61/350" lists Counterspell and Brainstorm, and the Artist box narrows it
  - the price sheet, every Settings section, and the known cards list
  - a camera read of a full-alert card vibrates once; a quiet one doesn't

  The controller fixes what he finds, tests first, and publishes each fix with `npx eas-cli@27 update --channel preview --environment preview --platform all --message "<what changed>" --non-interactive`, then `rm -rf dist`. The new builds' `app.json` needs no workaround.

- [ ] **Step 7: Commit** the build notes — "Plan 2 builds"

---

### Task 17: The 200-card phone tests (Matt runs them, the controller records them)

**Files:**
- Modify: `BUILD_BREAKDOWN.md`, and the spec's decisions list if Matt changes the quiet rule

**Interfaces:**
- Consumes: Task 16's builds; Task 4's `check-log`.

- [ ] **Step 1: The 200-card timed stack on the iPhone 13** (spec 6.2, item 2). Matt's stack mixes old border, showcase, borderless, full-art, foil, sleeved and foreign cards. Foreign cards are typed by set and number, or by number/total and artist, and don't count. Matt runs it in test mode with the stack count entered, then exports the run and the unmatched lines.
  - **Pass:** at least 95% of English titles right and under 3 seconds a card.
  - **If it fails:** use superpowers:systematic-debugging on the exported reads before changing anything. The spec's stop rule still applies.

- [ ] **Step 2: Phone versus Mac.** Run `.venv/bin/python -m bindiver check-log <run.csv>`. Expected: 0 disagree. Any disagreement is investigated, and the cause is recorded in the ledger before it's fixed.

- [ ] **Step 3: The same stack on the Pixel 8 and the iPhone 15 Pro** (item 5), each with `check-log`. The iPhone 13 result decides the phase.

- [ ] **Step 4: Shop or dim light** (item 4). Matt scans a mixed stack in a shop or a dim room. Every card the camera misses or misreads must be found by typed search. He notes any that weren't.

- [ ] **Step 5: Alert numbers** (item 6), from `check-log`'s lines on the iPhone 13 run: full, quiet, known and none, and the full alerts that come only from showcase or borderless versions. Ask Matt whether those go quiet too. A yes is a separate change: a fourth quiet kind in Python, the golden fixture and the label order. Write it up as its own task, not done inside this one.

- [ ] **Step 6: Record** all results in `BUILD_BREAKDOWN.md` as Plan 1 did: a table of runs (phone, cards, right, seconds a card), the check-log lines and the alert numbers.

- [ ] **Step 7: Commit** — "Plan 2 phone tests"

After Task 17, the controller runs the final whole-branch review and then superpowers:finishing-a-development-branch. Once the branch is merged to `main`, ask Matt to OK one manual run of the nightly job (`gh workflow run nightly-data.yml`), then check that `data-latest`'s manifest has today's price date.
