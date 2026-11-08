# Phase 3, Plan 1: Repo, Phone Database and Camera Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put BinDiver in a public GitHub repo and publish a phone-sized card database. Then put a camera-test build on Matt's iPhone that reads card titles live, matches them against the full database on the phone and logs every read. The plan ends at Matt's 50-card gate.

**Architecture:**
- **Python** gains two commands: `phone-db` (the slimmed database, zip and manifest) and `golden` (fixtures that pin the TypeScript port to Python's exact output).
- **The Expo app in `app/`** ports `normalize`, `sort`, the lookup grouping and the value summary to TypeScript behind a `Game` interface, and adds a trigram-plus-edit-distance title matcher.
- **The scan pipeline is pure TypeScript,** each piece unit-tested: title band → OCR lines → top line → matcher → 3-in-a-row commit. Only the thin device layer (VisionCamera, ML Kit, expo-sqlite, expo-file-system) is checked on the phone rather than by tests.

**Tech Stack:**
- **Python:** 3.14, pytest.
- **App framework:** Expo SDK 58, React Native 0.88.1, TypeScript, Jest 30 with jest-expo 58.
- **Expo modules:** expo-sqlite, expo-file-system (`File`/`Directory`/`Paths`), expo-crypto, expo-network, expo-sharing, expo-audio, expo-keep-awake, expo-updates, expo-build-properties.
- **Unzip:** fflate 0.8.
- **Camera and OCR:** react-native-vision-camera 5.2, react-native-vision-camera-ocr-plus 2.1, react-native-vision-camera-worklets, react-native-worklets 0.13, react-native-nitro-modules, react-native-nitro-image.
- **Builds:** EAS CLI 27.

**Spec:** `docs/superpowers/specs/2026-11-06-phase3-scan-app-design.md`. This plan covers build-order steps 1 to 3: sections 1.1, 1.3, 1.4, 2, 4.3 (tables), 6.1 (the parts listed in each task) and 7. Plan 2 (the full app, the nightly job, the phone tests) is written after the gate.

## Global Constraints

- **Matt signs in himself.** He signs in to GitHub, Expo and Apple himself. Never type, store or ask for his passwords or keys. Commands that prompt for Apple or Expo credentials are run by Matt in his own terminal.
- **Nothing reaches GitHub until Matt approves the file list** (Task 1). Never commit `data/`, `.venv/`, the ManaBox CSV, or anything containing Matt's personal email address (the controller knows it; never write it into a file).
- **Commits:** use the configured identity (`Matt Paul <10762872+Angrod@users.noreply.github.com>`). Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Repo:** `Angrod/BinDiver`, public. Work after Task 1 happens on branch `phase3-plan1`.
- **Data:**
  - `phone_format` = `1`.
  - Download base URL: `https://github.com/Angrod/BinDiver/releases/download/data-latest/`.
  - Phone database file name: `cards-phone.sqlite`.
  - Zip name: `cards-phone-<price_date>.zip`.
- **Exact match with Python:** the TypeScript `normalizeName`, `sortVersions`, `lookupGroups` and `summarize` must equal Python's output exactly on the golden fixtures. Never edit a golden fixture by hand; regenerate it with `python -m bindiver golden`.
- **Tolerant match:**
  - It accepts a candidate only when `5 * distance <= max(len(query), len(candidate))` (similarity at least 0.8).
  - It takes under 20 ms per line.
  - Only trailing words matching `^[0-9wubrgcxso]{1,6}$` may be dropped, at most 3.
- **Commit rule:** 3 reads in a row of the same card.
- **English titles only.** Portrait only. No accounts, no analytics. The app's only network calls are:
  - the two `data-latest` URLs
  - expo-updates' check with Expo's update server (added in Task 14)
- **Identifiers:**
  - iOS `bundleIdentifier` and Android `package`: `com.angrod.bindiver`.
  - Expo slug: `bindiver`.
  - App name: `BinDiver`.
- **Commands:** Python runs as `.venv/bin/python` from the repo root. App commands run from `app/` with Node 26.

## Review Focus

1. **The app is killed mid-download or mid-swap.** The next launch must open a complete database or show the first-download screen, never a partial file. *Pinned by:* Task 9's "leftover part files are removed before a new download" and "a failure after closing the live database still leaves only verified files".
2. **A stale `-wal`/`-shm` file from the old database would corrupt the new one after a swap.** *Pinned by:* Task 9's happy-path assertion that both are removed before the move.
3. **A line of camera text with mana junk that also contains a shorter card name** (Island Sanctuary 1W) must give the longest exact name, not "Island". *Pinned by:* Task 7's misreads, which include it.
4. **Non-card text inside the band** (type line, artist credit, copyright) must not match a card. *Pinned by:* Task 7's junk-lines test.
5. **The "more than 3 days old" date check across midnight and time zones.** It must use the phone's local calendar day. *Pinned by:* Task 9's `isStale` tests at 23:00 and 00:30.

---

### Task 1: Repo and first push (controller task, needs Matt's approval)

**Files:**
- Modify: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Produces: the public repo `Angrod/BinDiver` with `main` holding Phases 1 and 2 plus the Phase 3 spec and this plan, and the local branch `phase3-plan1`.

- [ ] **Step 1: Extend `.gitignore`.** Append these lines:

```
.DS_Store
.superpowers/
app/node_modules/
app/.expo/
app/ios/
app/android/
app/dist/
```

- [ ] **Step 2: Write `README.md`.** It covers:
  - one paragraph on what BinDiver is ("which versions of this MTG card are worth finding?")
  - the status: Phases 1 and 2 done, Phase 3 in progress
  - the Python commands from `bindiver/__main__.py`'s docstring
  - this credit and notice, verbatim:

```
Card data and prices from [Scryfall](https://scryfall.com). BinDiver is not produced by or endorsed by Scryfall.

BinDiver is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
```

- [ ] **Step 3: Initialise git and stage everything.**

Run: `git init -b main && git add -A && git status --short`
Expected: a list of files with no `data/`, `.venv/`, `.pytest_cache/` or `__pycache__/` entries.

- [ ] **Step 4: Check for private data.**

Run: `git grep -n "@gmail" ; git ls-files | grep -iE "manabox|\.csv$|\.sqlite$"`
Expected: no output from either command. The controller also greps for Matt's full address, typed into the command only, never into a file.

- [ ] **Step 5: STOP and get Matt's approval.** Show Matt the full `git status --short` list and say the repo will be public. Wait for his explicit yes. If he removes files, `git rm --cached` them, add them to `.gitignore`, and show the list again.

- [ ] **Step 6: Commit and create the repo.**

```bash
git commit -m "Phases 1 and 2: lookup and spot text, plus the Phase 3 design

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
gh repo create Angrod/BinDiver --public --source . --push
git switch -c phase3-plan1
```

Expected: `gh` prints the repo URL, and `git branch --show-current` prints `phase3-plan1`.

---

### Task 2: The `phone-db` command

**Files:**
- Create: `bindiver/mtg/phone_db.py`
- Modify: `bindiver/__main__.py` (add the `phone-db` subcommand and a docstring line)
- Test: `tests/test_phone_db.py`

**Interfaces:**
- Consumes:
  - `bindiver.mtg.build_db.build_db` (the source database and its `meta`, `printings`, `versions`, `names` and `sets` tables)
  - `bindiver.mtg.bulk_data.fetch_set_icons(icon_uris, data_dir) -> dict[str, bytes]`
- Produces:
  - `PHONE_FORMAT = 1`, `PHONE_DB = "cards-phone.sqlite"`, `MANIFEST = "manifest.json"`
  - `PRINTING_COLUMNS = ("id", "oracle_id", "name", "set_code", "set_name", "collector_number", "released_at", "lang", "symbol_set")`
  - `icon_uris_needed(src_db: Path) -> dict[str, str]`: `{code: icon_svg_uri}` for every `symbol_set` used by a printing, except `none`, whose `sets` row has a URI
  - `write_phone_tables(src_db: Path, dst_db: Path, icons: dict[str, bytes], oracle_ids: set[str] | None = None, extra_norms: frozenset[str] = frozenset()) -> None`:
    - writes a fresh phone-format database, then `VACUUM`s it
    - with `oracle_ids` given, keeps only:
      - those cards' printings and versions
      - `names` rows whose `oracle_id` is in the set or whose `norm` is in `extra_norms`
      - `sets` rows whose code is a kept printing's `set_code` or `symbol_set`
    - copies the `meta` rows, plus `phone_format`
    - `sets` gets `code`, `name` and `icon_svg` (the icon bytes decoded as UTF-8, or NULL)
    - keeps the `printings_oracle` index
  - `build_phone_db(src_db: Path, out_dir: Path, icons: dict[str, bytes]) -> dict`:
    - writes `out_dir/cards-phone.sqlite` and `out_dir/cards-phone-<price_date>.zip` (one entry, `cards-phone.sqlite`, ZIP_DEFLATED, compresslevel 9)
    - deletes any other `cards-phone-*.zip` in `out_dir`
    - writes `out_dir/manifest.json` and returns the manifest dict, with keys in the order `phone_format, price_date, file, zip_bytes, db_bytes, sha256` (sha256 of the zip, lowercase hex)

- [ ] **Step 1: Write the failing tests** in `tests/test_phone_db.py`.
  - **Fixture:** build the Counterspell database the way `conftest.cs_catalog` does (`build_db(cards, db, price_date="2026-11-03", sets=CS_SETS, hand_notes=load_hand_notes(FIXTURES / "hand_notes_test.json"))`).
  - **Icons:** `ICONS = {"7ed": b"<svg>7ed</svg>"}`.
  - **Tests:**
    - `test_printings_keep_only_phone_columns`: the `PRAGMA table_info(printings)` names equal `list(PRINTING_COLUMNS)`, and the row count equals the source's (10).
    - `test_versions_and_names_are_copied_unchanged`: `SELECT * FROM versions ORDER BY printing_id, finish` and `SELECT * FROM names ORDER BY 1, 2, 3` are equal in source and phone database.
    - `test_sets_embed_icon_text`: `dict(SELECT code, icon_svg FROM sets)` equals `{"7ed": "<svg>7ed</svg>", "lea": None}`.
    - `test_meta_has_phone_format_and_price_date`: `meta` has `price_date` = `"2026-11-03"` and `phone_format` = `"1"`.
    - `test_database_is_vacuumed`: `PRAGMA freelist_count` is `0`.
    - `test_zip_holds_only_the_database`: `zipfile.ZipFile(...).namelist()` equals `["cards-phone.sqlite"]`, and the entry's bytes equal the `.sqlite` file's bytes.
    - `test_manifest_describes_the_zip`: the returned dict equals `{"phone_format": 1, "price_date": "2026-11-03", "file": "cards-phone-2026-11-03.zip", "zip_bytes": <zip size>, "db_bytes": <db size>, "sha256": hashlib.sha256(<zip bytes>).hexdigest()}`, and `json.loads(manifest.json)` equals it.
    - `test_older_zips_are_removed`: with `out_dir/cards-phone-2026-11-01.zip` created first, only `cards-phone-2026-11-03.zip` remains afterwards.
    - `test_icon_uris_needed_lists_used_symbol_sets`: equals `{"7ed": "https://svgs.scryfall.io/sets/7ed.svg"}`. The fixture uses `7ed`, `dmr`, `mmq` and `none`, and only `7ed` has a URI.
    - `test_oracle_filter_keeps_only_listed_cards`:
      - `write_phone_tables(src, dst, ICONS, oracle_ids={"cs-oracle"}, extra_norms=frozenset({"saproling"}))` gives 10 printings and the `counterspell` names row.
      - With `oracle_ids={"nope"}` it gives 0 printings, 0 names and 0 sets rows.

- [ ] **Step 2: Run the tests to watch them fail**

Run: `.venv/bin/python -m pytest tests/test_phone_db.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'bindiver.mtg.phone_db'`

- [ ] **Step 3: Implement `bindiver/mtg/phone_db.py`** with the interfaces above. Use `ATTACH DATABASE` to copy from source to destination, and copy the `versions` and `names` `CREATE TABLE` statements from the source's `sqlite_master` so their schema stays identical.

- [ ] **Step 4: Run the tests to watch them pass**

Run: `.venv/bin/python -m pytest -q`
Expected: every test passes (the existing 103 plus the 10 new ones).

- [ ] **Step 5: Add the CLI.** Add `python -m bindiver phone-db` to `bindiver/__main__.py`:
  - It calls `build_phone_db(DB_FILE, DATA_DIR, fetch_set_icons(icon_uris_needed(DB_FILE), DATA_DIR))`.
  - It prints `Phone database: <db MB> MB, zip <zip MB> MB, prices as of <date>`.
  - Add the docstring line.
  - Add a `test_main.py` test that the parser accepts `phone-db`.

- [ ] **Step 6: Run it on the real data**

Run: `.venv/bin/python -m bindiver phone-db && ls -l data/cards-phone* data/manifest.json`
Expected: the printed sizes are about 50 MB and 22 MB, and the zip name carries the database's price date.

- [ ] **Step 7: Commit**

```bash
git add bindiver/mtg/phone_db.py bindiver/__main__.py tests/test_phone_db.py tests/test_main.py
git commit -m "Add phone-db: slimmed phone database, zip and manifest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The `golden` command

**Files:**
- Create: `bindiver/mtg/golden.py`
- Modify: `bindiver/__main__.py` (add `golden --out DIR`)
- Test: `tests/test_golden.py`

**Interfaces:**
- Consumes:
  - `Catalog.lookup(query, min_price, order)` and `SORT_ORDERS` from `lookup.py`
  - `normalize_name`
  - `write_phone_tables` and `icon_uris_needed` from Task 2
- Produces:
  - **`GOLDEN_NAMES`**, exactly these 50, in this order:
    - The ten classics: `"Fireball", "Counterspell", "Birds of Paradise", "Lightning Bolt", "Sol Ring", "Llanowar Elves", "Dark Ritual", "Swords to Plowshares", "Brainstorm", "Fire // Ice"`
    - Names for special handling: `"Island", "Bloodfell Caves", "Delver of Secrets", "Insectile Aberration", "Brazen Borrower", "Petty Theft", "Lim-Dûl's Vault", "Æther Vial", "_____ Goblin", "Who // What // When // Where // Why", "Jace, the Mind Sculptor", 'Kongming, "Sleeping Dragon"', "B.F.M. (Big Furry Monster)", "Saproling", "Shu Jing Meteorite"`
    - Summary-rule cards: `"Crypt of Agadeem", "Rideable Mantis", "Hungry Lynx", "Parasitic Grasp", "Fealty to the Realm", "Seymour Flux", "Drooling Groodion", "Sharding Sphinx", "Elusen, the Giving", "Cranial Plating", "Thermo-Alchemist", "Quicksilver Dagger", "Echoing Truth", "Cathar Commando", "Chaos Wand", "Brotherhood's End", "Ihsan's Shade", "Stable Wormhole", "Temporal Extortion", "Blue Dragon"`
    - Five more: `"Serra Angel", "Shivan Dragon", "Juzám Djinn", "Urza's Tower", "Sensei's Divining Top"`
  - **`GOLDEN_PRICES = (2, 10, 50)`**
  - **`NORMALIZE_EXTRAS`**, exactly: `("", "  Lightning   Bolt  ", "FIREBALL", "Fire//Ice", "fire  //  ice", "Urza’s Tower", "`Backtick`", "Œuvre", "Dandân", "Séance", "Ifh-Bíff Efreet", "Ach! Hans, Run!", "+2 Mace", "Borrowing 100,000 Arrows", "Mox Pearl (Alpha)")`
  - **`golden_cases(catalog: Catalog, names=GOLDEN_NAMES) -> list[dict]`:**
    - one case per name × price × order (names outermost, then prices, then `SORT_ORDERS`)
    - each case is `{"query", "min_cents", "order", "match", "groups": [{"oracle_id", "name", "total_versions", "summary", "qualifying": [version keys], "unpriced": [version keys]}]}`
    - it raises `ValueError(f"{query} matched fuzzily")` on any `fuzzy` match
  - **`write_golden(src_db: Path, out_dir: Path, icons: dict[str, bytes], names=GOLDEN_NAMES) -> None`** writes four files:
    - `golden.sqlite`: `write_phone_tables` limited to the oracle IDs the cases reach, with `extra_norms` = the normalized names
    - `golden.json`: `{"price_date", "phone_format": 1, "cases": [...]}`
    - `normalize.json`: `{"cases": [[raw, normalize_name(raw)], ...]}` for every distinct `printings.name`, sorted, then each of `NORMALIZE_EXTRAS`
    - `names.json`: the sorted distinct `[norm, kind]` pairs from the source `names` table
    - All JSON is written with `ensure_ascii=False`.

- [ ] **Step 1: Write the failing tests** in `tests/test_golden.py`. Use the Counterspell fixture database from Task 2's test.
  - `test_cases_cover_every_name_price_and_order`:
    - `golden_cases(Catalog(db), names=("Counterspell", "Shu Jing Meteorite"))` has 18 cases.
    - The first case is `query == "Counterspell"`, `min_cents == 200`, `order == "oldest"`.
  - `test_case_matches_the_python_lookup`: for Counterspell at $10, sorted by price, the case's `qualifying` equals `[v.key for v in Catalog(db).lookup("Counterspell", 10, "price").groups[0].qualifying]`, and its `summary` equals that group's summary.
  - `test_missing_name_has_no_groups`: the Shu Jing case has `match == "none"` and `groups == []`.
  - `test_fuzzy_match_is_refused`: `golden_cases(Catalog(db), names=("Counterspel",))` raises `ValueError`.
  - `test_golden_db_holds_only_reached_cards`: after `write_golden(db, out, {}, names=("Counterspell",))`, `SELECT DISTINCT oracle_id FROM printings` in `out/golden.sqlite` is `[("cs-oracle",)]`.
  - `test_normalize_cases_include_names_and_extras`: every pair in `normalize.json` satisfies `normalize_name(raw) == norm`, `["Counterspell", "counterspell"]` is present, and the last `len(NORMALIZE_EXTRAS)` raws equal `list(NORMALIZE_EXTRAS)`.
  - `test_names_json_mirrors_the_names_table`: equals `[["counterspell", "full"]]`.

- [ ] **Step 2: Run the tests to watch them fail**

Run: `.venv/bin/python -m pytest tests/test_golden.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'bindiver.mtg.golden'`

- [ ] **Step 3: Implement `bindiver/mtg/golden.py`** with the interfaces above.

- [ ] **Step 4: Run the full suite**

Run: `.venv/bin/python -m pytest -q`
Expected: all tests pass.

- [ ] **Step 5: Add the CLI and run it.** Add `python -m bindiver golden --out DIR`. Its icons are `fetch_set_icons(icon_uris_needed(DB_FILE), DATA_DIR)`; the oracle filter keeps only the golden cards' sets. Add the docstring line and a parser test in `test_main.py`.

Run: `.venv/bin/python -m bindiver golden --out /private/tmp/golden-check && ls -l /private/tmp/golden-check`
Expected: four files. `golden.json` has 450 cases. `golden.sqlite` is under 3 MB.

- [ ] **Step 6: Commit**

```bash
git add bindiver/mtg/golden.py bindiver/__main__.py tests/test_golden.py tests/test_main.py
git commit -m "Add golden: fixtures that pin the phone port to Python's output

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Expo app scaffold and test setup

**Files:**
- Create: `app/` (from the template), `app/src/db/types.ts`, `app/src/testing/nodeDb.ts`
- Test: `app/src/testing/nodeDb.test.ts`

**Interfaces:**
- Produces:

```ts
// app/src/db/types.ts
export type SqlValue = string | number | null;
export interface Db {
  all<T>(sql: string, params?: SqlValue[]): T[];
  get<T>(sql: string, params?: SqlValue[]): T | null;   // null when no row
  run(sql: string, params?: SqlValue[]): { lastInsertRowId: number; changes: number };
  exec(sql: string): void;
  close(): void;
}
// app/src/testing/nodeDb.ts (tests only, uses node:sqlite)
export function openNodeDb(path: string): Db;
export function memoryDb(): Db;
```

- [ ] **Step 1: Create the app**

Run (from the repo root): `npx create-expo-app@latest app --template blank-typescript --no-install && cd app && npm install && npx expo install jest-expo jest @types/jest -- --save-dev && npm install -D @types/node`
Expected: `app/package.json` lists `expo` `~58.x` and `react-native` `0.88.x`. Delete `app/.git` if the template created one.

- [ ] **Step 2: Configure.**
  - **`app/package.json`:** add `"test": "jest"` and `"typecheck": "tsc --noEmit"`, plus `"jest": {"preset": "jest-expo", "testPathIgnorePatterns": ["/node_modules/", "/dist/"]}`.
  - **`app/tsconfig.json`:** keep `"extends": "expo/tsconfig.base"` and set `"strict": true`.
  - **`app/app.json`:**
    - `name` `BinDiver`, `slug` `bindiver`
    - `orientation` `portrait`, `userInterfaceStyle` `automatic`
    - `ios.bundleIdentifier` and `android.package` both `com.angrod.bindiver`

- [ ] **Step 3: Write the failing test** `app/src/testing/nodeDb.test.ts`:
  - `memoryDb()`: after `exec("CREATE TABLE t (a TEXT, b INTEGER)")` and `run("INSERT INTO t VALUES (?, ?)", ["x", 1])`, `all("SELECT * FROM t")` equals `[{a: "x", b: 1}]`.
  - `get("SELECT * FROM t WHERE a = ?", ["y"])` is `null`.
  - `run` returns `lastInsertRowId` `1`.

- [ ] **Step 4: Run it to watch it fail**

Run: `npm test -- src/testing`
Expected: FAIL, cannot find module `./nodeDb`.

- [ ] **Step 5: Implement** `types.ts` and `nodeDb.ts`. `nodeDb.ts` uses `DatabaseSync` from `node:sqlite`, and spreads `params` into `prepare(sql).all/get/run`.

- [ ] **Step 6: Run the checks**

Run: `npm test && npm run typecheck`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add app .gitignore
git commit -m "Scaffold the Expo app with Jest and a node:sqlite test database

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: TypeScript normalize, sort and lookup

**Files:**
- Create:
  - `app/src/game/mtg/types.ts`
  - `app/src/game/mtg/normalize.ts`
  - `app/src/game/mtg/sort.ts`
  - `app/src/game/mtg/lookup.ts`
  - `app/src/game/mtg/__fixtures__/` (generated)
- Test:
  - `app/src/game/mtg/__tests__/normalize.test.ts`
  - `app/src/game/mtg/__tests__/sort.test.ts`
  - `app/src/game/mtg/__tests__/lookup.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 4); fixtures (Task 3).
- Produces:

```ts
export type SortOrder = 'oldest' | 'newest' | 'price';
export type NameKind = 'full' | 'face' | 'token';
export interface Version {
  scryfallId: string; setCode: string; setName: string; collectorNumber: string;
  releasedAt: string; lang: string; finish: string; priceCents: number | null;
  frameGroup: string; lookFor: string; notes: string[]; sameAs: string[];
  symbolSet: string | null; key: string;            // `${scryfallId}:${finish}`
}
export interface CardGroup {
  oracleId: string; name: string; qualifying: Version[]; unpriced: Version[];
  totalVersions: number; versionsByKey: Map<string, Version>;
}
export function normalizeName(raw: string): string;
export function sortVersions(versions: Version[], order: SortOrder): Version[];
export function resolveExact(db: Db, norm: string): { match: 'exact' | 'token' | 'none'; oracleIds: string[] };
export function cardName(db: Db, oracleId: string): string;
export function lookupGroups(db: Db, oracleIds: string[], minCents: number, order: SortOrder): CardGroup[];
```

**Porting rules** (from `normalize.py` and `lookup.py`):
- **`normalizeName`:** the same steps in the same order:
  1. ligatures
  2. NFKD, then remove `\p{Mn}`
  3. lowercase, then remove `['’‘`]`
  4. `_+` becomes `" _ "`
  5. split on `\s*\/\/\s*`
  6. in each face, replace `[^a-z0-9_ ]+` with a space and collapse spaces
  7. join with `" // "`
  
  `normalize.json` (every real card name) is the referee: if a name differs, fix the port, never the fixture.
- **`sortVersions`:** a stable sort on `(releasedAt, setCode, numberKey(collectorNumber), finishRank, finish)`. Then a stable re-sort for `newest` (by `releasedAt` descending) or `price` (unpriced last, then by `priceCents` descending).
  - `numberKey` is the leading digits as a number (Infinity when there are none), then the whole string.
  - `finishRank` is nonfoil 0, foil 1, etched 2, anything else 3.
- **`resolveExact`:** full names win over faces. A token norm gives `token` with no IDs. Oracle IDs are sorted ascending.
- **`cardName`:** the name most printings use, with ties broken by shorter length (in code points) and then alphabetically. This is Python's `_card_name`.
- **`lookupGroups`:** the same SQL and the same qualifying and unpriced split as `Catalog._group`, one group per oracle ID in ascending order. `notes` splits on `"\n"` when non-empty, and `sameAs` is parsed from JSON.

- [ ] **Step 1: Generate the fixtures**

Run (repo root): `.venv/bin/python -m bindiver golden --out app/src/game/mtg/__fixtures__`
Expected: `golden.sqlite`, `golden.json`, `normalize.json` and `names.json` in that folder.

- [ ] **Step 2: Write the failing tests.**
  - **`normalize.test.ts`:** for every `[raw, norm]` in `normalize.json`, `normalizeName(raw)` equals `norm`. Use one `expect` over the list of mismatches (which must equal `[]`), so a failure prints only the differing names.
  - **`sort.test.ts`**, with hand-built versions:
    - same-day versions sort by set, then number (`"9"` before `"10"`, `"67"` before `"67★"`), then nonfoil, foil, etched
    - `newest` keeps that tie order within a day
    - `price` puts unpriced versions last and keeps tie order between equal prices
  - **`lookup.test.ts`:** for each case in `golden.json`:
    - `resolveExact(db, normalizeName(case.query)).match` equals `case.match`.
    - Mapping each group to `{oracle_id, name, total_versions, qualifying: keys, unpriced: keys}` equals `case.groups` with `summary` left out.
    - Use `test.each` over the cases and name each test `"$query at $min_cents ($order)"`.

- [ ] **Step 3: Run the tests to watch them fail**

Run: `npm test -- src/game/mtg`
Expected: FAIL, the modules are not found.

- [ ] **Step 4: Implement** the four modules following the porting rules.

- [ ] **Step 5: Run the checks**

Run: `npm test && npm run typecheck`
Expected: PASS. All normalize cases and all 450 golden cases pass.

- [ ] **Step 6: Commit**

```bash
git add app/src/game
git commit -m "Port normalize, sort and lookup to TypeScript, pinned by golden fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: TypeScript value summary

**Files:**
- Create: `app/src/game/mtg/summary.ts`, `app/src/game/mtg/money.ts`
- Modify:
  - `app/src/game/mtg/types.ts` (`CardGroup` gains `summary: string`)
  - `app/src/game/mtg/lookup.ts` (`lookupGroups` fills `summary` from all the group's versions)
  - `app/src/game/mtg/__tests__/lookup.test.ts` (compare `summary` too)
- Test: `app/src/game/mtg/__tests__/summary.test.ts`

**Interfaces:**
- Produces: `export function summarize(versions: Version[], minCents: number): string;` and `export function dollars(cents: number): string;`

**Porting rules** (from `summary.py` and `money.py`):
- Copy the constants exactly:
  - `FRAME_ORDER = ["old-1993", "old-1997", "modern", "future", "m15", "retro"]`
  - `FRAME_LABELS` as in `summary.py`
  - `MAX_SKIP_ITEMS = 4`, `MIN_SKIP_VERSIONS = 3`
  - `WHERE_MIN_SHARE` = 2/5, `WHERE_MAX_GROUPS = 2`, `ALMOST_EVERY` = 3/4
- Compare fractions by cross-multiplying integers, never with floats. For example, `q * 4 >= p * 3` stands for `q/p >= 3/4`, and `share` comparisons in sorts compare `a.q * b.t` with `b.q * a.t`.
- `dollars`: `$` + whole dollars with thousands commas + `.` + two-digit cents. For example, `dollars(123456)` is `"$1,234.56"`.

- [ ] **Step 1: Write the failing tests.**
  - **`summary.test.ts`:** `dollars(5)` is `"$0.05"`, `dollars(1000)` is `"$10.00"` and `dollars(123456)` is `"$1,234.56"`.
  - **`lookup.test.ts`:** the golden comparison now includes `summary`.

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npm test -- src/game/mtg`
Expected: FAIL. `summarize` and `dollars` are missing, and the golden cases fail on `summary`.

- [ ] **Step 3: Implement** `summary.ts` and `money.ts`, and wire `summary` into `lookupGroups`.

- [ ] **Step 4: Run the checks**

Run: `npm test && npm run typecheck`
Expected: PASS, including Fireball at 1000 cents, oldest first: `"Value sits in old-border 1993-frame nonfoils (4 of 17). Skip modern-frame cards, and M15-frame foils (0 of 18)."`

- [ ] **Step 5: Commit**

```bash
git add app/src/game
git commit -m "Port the value summary to TypeScript

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Title matcher

**Files:**
- Create: `app/src/game/mtg/match.ts`, `app/src/game/mtg/__fixtures__/misreads.json`
- Test: `app/src/game/mtg/__tests__/match.test.ts`

**Interfaces:**
- Consumes: `normalizeName`, `NameKind` (Task 5); `names.json` (Task 3).
- Produces:

```ts
export interface NameIndex { /* opaque */ }
export interface LineMatch {
  norm: string; kind: 'exact' | 'tolerant'; isToken: boolean;
  similarity: number; lineUsed: string;          // lineUsed = the normalized text that matched
}
export function buildNameIndex(entries: Array<[string, NameKind]>): NameIndex;
export function matchLine(index: NameIndex, raw: string): LineMatch | null;
export function prefixMatches(index: NameIndex, typed: string, limit: number): string[]; // norms
```

**Algorithm** (verified with a Python prototype on the Nov 4 names: 50 of 50 misreads, 1.4 ms a line):
- **Index:**
  - Each norm keeps its best kind: full, then face, then token.
  - The trigrams of `` ` ${norm} ` `` map to entry indexes.
- **Tries:**
  - `words = normalizeName(raw).split(" ")`.
  - The tries are the whole line, then, while fewer than 4 tries exist, more than one word remains and the last word matches `^[0-9wubrgcxso]{1,6}$`, the line minus that word.
- **Exact:** the first try (fewest words dropped) that is a key in the index wins, with `similarity` 1.
- **Tolerant**, for each try:
  1. Count shared trigrams per entry.
  2. Keep the top 50 by count (ties by norm ascending).
  3. For each candidate, `L = max(len(try), len(norm))`. Reject it if `|len diff| * 5 > L`.
  4. Compute the Levenshtein distance `d`, with an early exit once `5 * d > L`. Accept when `5 * d <= L`, with `similarity = 1 - d / L`.
  5. The best is by similarity (descending), then shared count (descending), then norm (ascending).
  
  Across tries, the highest similarity wins, and ties go to fewer words dropped.
- **Result:** `isToken` is true when the winning norm's kind is `token`.
- **`prefixMatches`:** non-token norms that start with `normalizeName(typed)`, sorted by length and then alphabetically, first `limit`.

- [ ] **Step 1: Write the fixture** `misreads.json` as `[[read, expected card name], ...]` with exactly these 50 pairs:

```json
[["Bloodfell Caues","Bloodfell Caves"],["Firebal","Fireball"],["Fireball XR","Fireball"],
 ["Lightning Bolt R","Lightning Bolt"],["Serra Angel 3WW","Serra Angel"],["Counterspel1","Counterspell"],
 ["Counterspell UU","Counterspell"],["Birds of Paradlse","Birds of Paradise"],["Birds of Paradise G","Birds of Paradise"],
 ["Llanowar Eives","Llanowar Elves"],["LIanowar Elves","Llanowar Elves"],["Swords to Pl0wshares","Swords to Plowshares"],
 ["Swords to Plowshares W","Swords to Plowshares"],["Dark Ritua1","Dark Ritual"],["Brainstorrn","Brainstorm"],
 ["Sol Rinq","Sol Ring"],["Shivan Dragon 4RR","Shivan Dragon"],["Shivan Dragcn","Shivan Dragon"],
 ["Urzas Tower","Urza's Tower"],["Urza s Tower","Urza's Tower"],["Jace the Mind Sculptor","Jace, the Mind Sculptor"],
 ["Jace, the Mind Scu1ptor 2UU","Jace, the Mind Sculptor"],["Aether Vial","Æther Vial"],["AEther Vial 1","Æther Vial"],
 ["Lim-Dul's Vault","Lim-Dûl's Vault"],["Lim Dul s Vau1t UB","Lim-Dûl's Vault"],["Juzam Djinn","Juzám Djinn"],
 ["Delver of Secrets U","Delver of Secrets"],["Insectile Aberratlon","Insectile Aberration"],["Brazen Borrower 1UU","Brazen Borrower"],
 ["Elvish Mystic G","Elvish Mystic"],["Island Sanctuary 1W","Island Sanctuary"],["Dark Confidant 1B","Dark Confidant"],
 ["Tarmogoyf 1G","Tarmogoyf"],["Thoughtseize B","Thoughtseize"],["Wrath of G0d 2WW","Wrath of God"],
 ["Wrath of Cod","Wrath of God"],["Mox Pear1 0","Mox Pearl"],["Ancestral Recal1 U","Ancestral Recall"],
 ["Craterhoof Behernoth","Craterhoof Behemoth"],["Craterhoof Behemoth 5GGG","Craterhoof Behemoth"],["Rhystic Study 2U","Rhystic Study"],
 ["Sensei's Divining Top 1","Sensei's Divining Top"],["Senseis Divininq Top","Sensei's Divining Top"],["Eternal Witness 1GG","Eternal Witness"],
 ["Sakura-Tribe Elder 1G","Sakura-Tribe Elder"],["Sakura Tribe EIder","Sakura-Tribe Elder"],["Llanowar Elves G","Llanowar Elves"],
 ["Grizzly Bears 1G","Grizzly Bears"],["Grizzly Bcars","Grizzly Bears"]]
```

- [ ] **Step 2: Write the failing tests** in `match.test.ts`. Build the index once from `names.json`.
  - `each misread finds its card`: for every pair, `matchLine(index, read)?.norm` equals `normalizeName(expected)`.
  - `junk lines match nothing`: `matchLine` returns `null` for each of `"Creature — Elf Druid"`, `"Instant"`, `"Illus. Mark Poole"`, `"© 1993 Wizards of the Coast"`, `"Tap: Add G"` and `"xkcd qwerty"`.
  - `exact names match themselves`: for entries `i * 187`, `i` from 0 to 199, `matchLine(index, norm)` gives `{norm, kind: 'exact', similarity: 1}`.
  - `longest exact name wins over a dropped word`: `"Island Sanctuary 1W"` gives norm `"island sanctuary"`, kind `exact`, lineUsed `"island sanctuary"`.
  - `tokens are flagged`: `matchLine(index, "Saproling")` gives `isToken: true`, kind `exact`.
  - `misreads average under 20 ms`: the total `performance.now()` time over the 50 misreads, divided by 50, is less than 20.
  - `prefix matches by length then name`: `prefixMatches(index, "fireb", 6)` equals `["fireball", "firebolt", "fireblast", "firebending", "firebreathing", "fireborn knight"]`.

- [ ] **Step 3: Run the tests to watch them fail**

Run: `npm test -- src/game/mtg/__tests__/match.test.ts`
Expected: FAIL, `./match` is not found.

- [ ] **Step 4: Implement `match.ts`** following the algorithm.

- [ ] **Step 5: Run the checks**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/game/mtg
git commit -m "Add the title matcher: trigram candidates, edit distance, mana-word dropping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The `Game` interface and the MTG game

**Files:**
- Create: `app/src/game/types.ts`, `app/src/game/mtg/index.ts`
- Test: `app/src/game/mtg/__tests__/game.test.ts`

**Interfaces:**
- Consumes: `resolveExact`, `cardName`, `lookupGroups` (Tasks 5 and 6); `buildNameIndex`, `matchLine`, `prefixMatches` (Task 7); `Db`.
- Produces:

```ts
// app/src/game/types.ts
import type { CardGroup, SortOrder } from './mtg/types';
export interface CardMatch {
  oracleIds: string[]; name: string; match: 'exact' | 'tolerant' | 'typed';
  isToken: boolean; lineUsed: string;
}
export interface Game {
  matchTitle(line: string): CardMatch | null;
  find(typed: string): CardMatch | null;          // match: 'typed'
  suggest(typed: string, limit: number): string[]; // display names
  lookup(oracleIds: string[], minCents: number, order: SortOrder): CardGroup[];
  setIcon(code: string): string | null;
}
// app/src/game/mtg/index.ts
export function createMtgGame(db: Db): Game;   // builds the index from SELECT norm, kind FROM names
```

**Rules:**
- **Names:** a matched card's `name` is `cardName(db, oracleIds[0])`. For a token, `name` is the matched norm and `oracleIds` is `[]`.
- **`find`:** an exact resolve of `normalizeName(typed)` first, then `matchLine`. It returns `null` when neither finds anything.
- **`suggest`:**
  - `prefixMatches` mapped to display names, with duplicates removed, keeping order.
  - When there are no prefix matches, it returns `[name]` from `find(typed)` when that is a non-token card, otherwise `[]`.
- **`setIcon`:** returns `icon_svg` from `sets`, or `null` for `none` and for missing codes.

- [ ] **Step 1: Write the failing tests** against `golden.sqlite` (through `openNodeDb`):
  - `matchTitle("Fireball XR")` gives name `"Fireball"`, match `exact`, `isToken` false, and `oracleIds` equal to the Fireball case's `groups[0].oracle_id` from `golden.json` (wrapped in a list).
  - `matchTitle("Bloodfell Caues")` gives name `"Bloodfell Caves"`, match `tolerant`.
  - `matchTitle("Insectile Aberration")` gives name `"Delver of Secrets // Insectile Aberration"`.
  - `matchTitle("Saproling")` gives `isToken` true and `oracleIds` `[]`.
  - `matchTitle("xkcd qwerty")` is `null`.
  - `find("fire // ice")` gives name `"Fire // Ice"`, match `typed`.
  - `find("Shu Jing Meteorite")` is `null`.
  - `suggest("fire", 6)` equals `["Fire // Ice", "Fireball"]`.
  - `suggest("fireblal", 6)` equals `["Fireball"]`.
  - `lookup(fireballIds, 1000, "oldest")[0].qualifying` keys equal the golden case's.
  - `setIcon(code)` contains `"<svg"` for `db.get("SELECT code FROM sets WHERE icon_svg IS NOT NULL LIMIT 1")`, and `setIcon("none")` is `null`.

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npm test -- src/game/mtg/__tests__/game.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement** `types.ts` and `createMtgGame`.

- [ ] **Step 4: Run the checks**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/game
git commit -m "Add the Game interface and the MTG game behind it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Data refresh logic

**Files:**
- Create:
  - `app/src/data/manifest.ts`
  - `app/src/data/policy.ts`
  - `app/src/data/refresh.ts`
- Test:
  - `app/src/data/__tests__/manifest.test.ts`
  - `app/src/data/__tests__/policy.test.ts`
  - `app/src/data/__tests__/refresh.test.ts`

**Interfaces:**
- Produces:

```ts
// manifest.ts
export const PHONE_FORMAT = 1;
export const DATA_BASE_URL = 'https://github.com/Angrod/BinDiver/releases/download/data-latest/';
export interface Manifest { phone_format: number; price_date: string; file: string; zip_bytes: number; db_bytes: number; sha256: string }
export function parseManifest(json: unknown): Manifest;   // throws Error('bad manifest')
// policy.ts
export type NetworkKind = 'wifi' | 'cellular' | 'none' | 'unknown';
export function needsCheck(lastCheckAt: string | null, now: Date): boolean;   // null or more than 24 h ago
export function decideDownload(m: Manifest, localPriceDate: string | null): 'download' | 'up-to-date' | 'app-too-old';
export function downloadPermission(network: NetworkKind, allowCellular: boolean): 'go' | 'ask' | 'offline';
export function isStale(priceDate: string, today: Date): boolean;   // more than 3 local calendar days old
// refresh.ts
export const LIVE_DB = 'cards-phone.sqlite';
export const PART_ZIP = 'download.zip.part';
export const PART_DB = 'cards-phone.sqlite.part';
export interface RefreshIO {
  fetchManifest(url: string): Promise<unknown>;
  download(url: string, to: string): Promise<void>;
  sha256(name: string): Promise<string>;
  unzip(zipName: string, entry: string, to: string): Promise<void>;
  readMeta(dbName: string): { price_date: string; phone_format: string };
  closeLive(): void;
  move(from: string, to: string): void;   // overwrites
  remove(name: string): void;             // no error when missing
}
export type RefreshResult =
  | { status: 'updated'; priceDate: string } | { status: 'up-to-date' }
  | { status: 'app-too-old' } | { status: 'failed'; error: string };
export async function refresh(io: RefreshIO, localPriceDate: string | null): Promise<RefreshResult>;
```

**Rules:**
- **`parseManifest`** requires:
  - an integer `phone_format`
  - `price_date` matching `^\d{4}-\d{2}-\d{2}$`
  - `file` matching `^cards-phone-\d{4}-\d{2}-\d{2}\.zip$`
  - positive integer `zip_bytes` and `db_bytes`
  - `sha256` matching `^[0-9a-f]{64}$`
- **`decideDownload`:**
  - `app-too-old` when `phone_format > PHONE_FORMAT`, whatever the date
  - `download` when there is no local date or the manifest's date is later (ISO strings compare)
  - otherwise `up-to-date`
- **`downloadPermission`:** wifi is `go`. Cellular is `go` when `allowCellular` is on, otherwise `ask`. None is `offline`. Unknown is `ask`.
- **`refresh`**, in order:
  1. remove `PART_ZIP` and `PART_DB`
  2. fetch and parse `DATA_BASE_URL + 'manifest.json'`
  3. decide (return early unless `download`)
  4. download `DATA_BASE_URL + m.file` to `PART_ZIP`
  5. compare the sha256 (on mismatch, `failed` / `"checksum mismatch"`)
  6. unzip entry `cards-phone.sqlite` to `PART_DB`
  7. `readMeta(PART_DB)` must match the manifest: the same `price_date`, and `Number(meta.phone_format)` equal to `m.phone_format`. Otherwise it returns `failed` / `"database does not match manifest"`.
  8. `closeLive()`
  9. remove `LIVE_DB + '-wal'` and `LIVE_DB + '-shm'`
  10. `move(PART_DB, LIVE_DB)`
  11. remove `PART_ZIP`
  12. return `updated`
  
  Any thrown error removes both part files and returns `failed` with the error's message.

- [ ] **Step 1: Write the failing tests.** `refresh.test.ts` uses a fake `RefreshIO` that records every call in order.
  - **`manifest.test.ts`:** a valid manifest round-trips. Each of these throws: a missing field, `file: "../x.zip"`, a 63-character sha256, and `phone_format: "1"`.
  - **`policy.test.ts`:**
    - `needsCheck(null, now)` is true. 23 hours ago is false. 25 hours ago is true.
    - `decideDownload`: a later date gives `download`. The same date gives `up-to-date`. An earlier date gives `up-to-date`. `phone_format: 2` with a later date gives `app-too-old`. A null local date gives `download`.
    - `downloadPermission` for all four network kinds × both settings.
    - `isStale("2026-11-04", new Date(2026, 10, 7, 23, 0))` is false. `isStale("2026-11-04", new Date(2026, 10, 8, 0, 30))` is true.
  - **`refresh.test.ts`:**
    - `same price date downloads nothing`: there is no `download` call, and the result is `up-to-date`.
    - `newer phone format keeps the old data`: the result is `app-too-old`, with no `download`, `closeLive` or `move` calls.
    - `bad checksum keeps the old data`: the result is `failed` / `"checksum mismatch"`. There are no `closeLive` or `move` calls, and both part files are removed afterwards.
    - `mismatched database keeps the old data`: when `readMeta` returns another price date, the result is `failed` and nothing is moved.
    - `download error keeps the old data`: `download` rejects, and the result is `failed` with its message.
    - `happy path swaps after closing`: the calls end `closeLive, remove(-wal), remove(-shm), move(PART_DB, LIVE_DB), remove(PART_ZIP)`, and the result is `{status: 'updated', priceDate}`.
    - `leftover part files are removed before a new download`: the first two calls are `remove(PART_ZIP)` and `remove(PART_DB)`.
    - `a failure after closing the live database still leaves only verified files`: `move` throws. The result is `failed`, and no call ever wrote to `LIVE_DB` except that `move`.
    - `user data is never touched`: no call in any test names a file containing `user`.

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npm test -- src/data`
Expected: FAIL, the modules are not found.

- [ ] **Step 3: Implement** the three modules. Leave all I/O to `RefreshIO`; `refresh.ts` imports nothing from Expo.

- [ ] **Step 4: Run the checks**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/data
git commit -m "Add the data refresh logic: manifest checks, policy and safe swap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: User store, run summary and CSV export

**Files:**
- Create:
  - `app/src/user/schema.ts`
  - `app/src/user/store.ts`
  - `app/src/user/runReport.ts`
- Test: `app/src/user/__tests__/store.test.ts`, `app/src/user/__tests__/runReport.test.ts`

**Interfaces:**
- Consumes: `Db`; `memoryDb` in tests.
- Produces:

```ts
// schema.ts — USER_SCHEMA creates, with IF NOT EXISTS, the five tables of spec 4.3, then sets PRAGMA user_version = 1
export const USER_SCHEMA: string;
// store.ts
export interface NewScan {
  at: string; runId: number | null; oracleIds: string[]; name: string;
  source: 'camera' | 'search'; rawText: string; lineUsed: string;
  match: 'exact' | 'tolerant' | 'typed'; priceDate: string; minCents: number; alerted: boolean;
}
export interface Scan extends NewScan { id: number; markedWrong: boolean }
export interface TestRun { id: number; startedAt: string; stoppedAt: string | null; stackCount: number }
export interface UserStore {
  getSetting(key: string): string | null; setSetting(key: string, value: string): void;
  recordScan(s: NewScan): number; setMarkedWrong(scanId: number, wrong: boolean): void;
  startRun(stackCount: number, at: string): number; stopRun(runId: number, at: string): void;
  setStackCount(runId: number, n: number): void;
  currentRun(): TestRun | null;   // latest run with stoppedAt null
  latestRun(): TestRun | null;
  runScans(runId: number): Scan[];   // ordered by at, then id
}
export function createUserStore(db: Db): UserStore;   // runs USER_SCHEMA
// runReport.ts
export interface RunSummary { cardsRead: number; rightReads: number; readRate: number | null; avgSecondsPerCard: number | null }
export function summarizeRun(run: TestRun, scans: Scan[]): RunSummary;
export const CSV_HEADER = 'at,seconds_since_previous,source,raw_text,line_used,name,match,price_date,min_cents,alerted,marked_wrong';
export function runToCsv(scans: Scan[]): string;
```

**Rules:**
- **Tables:** `scans.oracle_id` stores `oracleIds.join(',')`. Booleans are stored as 0/1.
- **`summarizeRun`:**
  - `rightReads` is the camera scans not marked wrong.
  - `readRate` is `rightReads / stackCount`, or `null` when `stackCount` is 0.
  - `avgSecondsPerCard` is the time from the first scan to the last, ÷ (scans − 1), in seconds. It is `null` with fewer than 2 scans.
- **`runToCsv`:**
  - header line, then one line per scan, `\n` endings, and a trailing `\n`
  - `seconds_since_previous` is empty for the first row, otherwise one decimal place
  - `alerted` and `marked_wrong` are `yes`/`no`
  - RFC 4180 quoting: a field containing `,`, `"` or a newline is wrapped in `"` with inner `"` doubled

- [ ] **Step 1: Write the failing tests.**
  - **`store.test.ts`:**
    - Settings round-trip, and a missing key is `null`.
    - `recordScan` then `runScans` returns the scan with `markedWrong` false and `oracleIds` restored as an array.
    - `setMarkedWrong` persists.
    - `startRun(50, t)` makes `currentRun()` return that run. After `stopRun`, `currentRun()` is `null` and `latestRun()` has `stoppedAt` set.
    - Running `createUserStore` twice on the same database keeps the data.
  - **`runReport.test.ts`**, with 4 scans in a run with `stackCount` 3:
    - The scans are camera at `T+0 s`, camera marked wrong at `T+2 s`, search at `T+5 s`, and camera at `T+9 s`.
    - `summarizeRun` gives `{cardsRead: 4, rightReads: 2, readRate: 2/3, avgSecondsPerCard: 3}`.
    - With `stackCount` 0, `readRate` is `null`.
    - `runToCsv` for two scans, the second named `Kongming, "Sleeping Dragon"` and 2.5 s after the first, gives a second data line containing `2.5,` and `"Kongming, ""Sleeping Dragon"""`. The first line equals `CSV_HEADER`.

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npm test -- src/user`
Expected: FAIL, the modules are not found.

- [ ] **Step 3: Implement** the three modules.

- [ ] **Step 4: Run the checks**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/user
git commit -m "Add the user store, test-run summary and CSV export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Scan pipeline logic

**Files:**
- Create:
  - `app/src/scan/geometry.ts`
  - `app/src/scan/lines.ts`
  - `app/src/scan/commit.ts`
- Test:
  - `app/src/scan/__tests__/geometry.test.ts`
  - `app/src/scan/__tests__/lines.test.ts`
  - `app/src/scan/__tests__/commit.test.ts`

**Interfaces:**
- Produces:

```ts
// geometry.ts
export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }
export type Percent = `${number}%`;
export interface PercentRegion { left: Percent; top: Percent; width: Percent; height: Percent }
export const CARD_ASPECT = 63 / 88;          // width / height
export const OUTLINE_SHARE = 0.88;           // outline fits within 88% of the view in both directions
export const BAND_TOP = 0.03, BAND_HEIGHT = 0.12;   // title strip, as shares of the outline's height
export const FRAME_ASPECT = 9 / 16;          // display-oriented frame (CommonResolutions.FHD_16_9)
export function cardOutline(view: Size): Rect;
export function titleBand(outline: Rect): Rect;
export function viewRectToFrameRegion(rect: Rect, view: Size, frameAspect?: number): PercentRegion; // undoes resizeMode 'cover'
// lines.ts
export interface OcrLine { text: string; x: number; y: number; width: number; height: number }
export function linesFromText(text: { blocks: Array<{ lines: Array<{ lineText: string; lineFrame: { x: number; y: number; width: number; height: number } }> }> }): OcrLine[];
export function topLine(lines: OcrLine[]): OcrLine | null;   // smallest y; ties → smaller x; blank text ignored
// commit.ts
export class CommitTracker {
  constructor(required?: number);           // default 3
  push(key: string | null): string | null;  // returns the key when a new card commits
  get current(): string | null;
}
```

**Rules:**
- **`cardOutline`:** `height = min(0.88 * view.height, 0.88 * view.width / CARD_ASPECT)`, `width = height * CARD_ASPECT`, centred in the view.
- **`viewRectToFrameRegion`:**
  - When `view.width / view.height > frameAspect`, the frame fills the view's width. Its height in view points is `view.width / frameAspect`, centred, with the overflow cropped. Otherwise the frame fills the height.
  - Percentages are formatted with `toFixed(2)` and a `%` suffix.
- **`CommitTracker`:**
  - `null` is ignored and doesn't break a streak.
  - A different key restarts the streak at 1.
  - When the streak reaches `required` and the key isn't `current`, it commits.
  - Pushing the current key never commits again.

- [ ] **Step 1: Write the failing tests** (geometry values use `toBeCloseTo(value, 4)`):
  - **`geometry.test.ts`:**
    - `cardOutline({width: 390, height: 380})` is `{x: 75.3, y: 22.8, width: 239.4, height: 334.4}`.
    - `cardOutline({width: 200, height: 380})` is `{x: 12, y: 67.0794, width: 176, height: 245.8413}`.
    - `titleBand({x: 75.3, y: 22.8, width: 239.4, height: 334.4})` is `{x: 75.3, y: 32.832, width: 239.4, height: 40.128}`.
    - `viewRectToFrameRegion({x: 0, y: 0, width: 390, height: 380}, {width: 390, height: 380})` is `{left: "0.00%", top: "22.60%", width: "100.00%", height: "54.81%"}`.
    - The band above in the same view is `{left: "19.31%", top: "27.33%", width: "61.38%", height: "5.79%"}`.
    - `viewRectToFrameRegion({x: 0, y: 0, width: 300, height: 600}, {width: 300, height: 600})` is `{left: "5.56%", top: "0.00%", width: "88.89%", height: "100.00%"}`.
  - **`lines.test.ts`:**
    - `linesFromText` flattens 2 blocks of 2 and 1 lines into 3 `OcrLine`s, in block order.
    - `topLine` picks `"Fireball"` at y 40 over `"Sorcery"` at y 300, skips a blank-text line at y 10, and breaks a y tie by smaller x.
    - `topLine([])` is `null`.
  - **`commit.test.ts`:**
    - `a, a` commits nothing.
    - `a, a, a` commits `a` on the third push.
    - Then `a, a, a` again commits nothing.
    - `b, b, null, b` commits `b`.
    - `c, c, d, c, c` commits nothing.
    - One more `c` commits `c`.

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npm test -- src/scan`
Expected: FAIL, the modules are not found.

- [ ] **Step 3: Implement** the three modules.

- [ ] **Step 4: Run the checks**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/scan
git commit -m "Add the scan pipeline logic: outline, title band, top line, commit rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Device adapters, first download and typed search

**Files:**
- Create:
  - `app/src/db/expoDb.ts`
  - `app/src/data/expoIO.ts`
  - `app/src/data/network.ts`
  - `app/src/app/AppData.tsx`
  - `app/src/screens/SetupScreen.tsx`
  - `app/src/screens/SearchSheet.tsx`
  - `app/src/screens/HomeScreen.tsx`
- Modify: `app/App.tsx`, `app/package.json` (dependencies)

**Interfaces:**
- Consumes: `Db`, `RefreshIO`, `refresh`, `needsCheck`, `downloadPermission`, `createMtgGame`, `Game`, `createUserStore`.
- Produces:
  - `openExpoDb(name: string, directory?: string): Db`, wrapping `openDatabaseSync(name, {}, directory)` with `getAllSync`, `getFirstSync` (null when none), `runSync` and `execSync`
  - `createExpoRefreshIO(dir: Directory, closeLive: () => void): RefreshIO`
  - `currentNetwork(): Promise<NetworkKind>`
  - `useAppData(): { game: Game | null; priceDate: string | null; user: UserStore; status: string; downloadNow(confirmedCellular: boolean): Promise<void> }`
  - `<SearchSheet visible onPick(match: CardMatch) onCancel />`

**Rules:**
- **Where files live:**
  - The cards database lives in `new Directory(Paths.document, 'cards')`, which is created if missing, and opens as `openExpoDb(LIVE_DB, cardsDir.uri)`.
  - `user.sqlite` opens with `openExpoDb('user.sqlite')` in expo-sqlite's default directory, so a swap can never touch it.
- **`expoIO`:**
  - `fetchManifest`: `fetch(url, { cache: 'no-store' })`, then `.json()`.
  - `download`: `File.downloadFileAsync(url, new File(dir, to), { idempotent: true })`.
  - `sha256`: `Crypto.digest(CryptoDigestAlgorithm.SHA256, await file.bytes())`, as lowercase hex.
  - `unzip`: fflate `unzipSync(bytes, { filter: f => f.name === entry })`, then `file.write(bytes)`.
  - `readMeta`: open with `openExpoDb`, read `meta`, and close.
  - `move`: `moveSync(dest, { overwrite: true })`.
  - `remove`: delete if it exists.
  - If expo-sqlite rejects a `file://` directory URI on the device, pass the path without the `file://` prefix.
- **`AppData`:**
  - On mount, it opens the user store.
  - If the live database exists, it opens it and builds the game, showing "Loading cards…" while the index builds.
  - On mount and when the app becomes active, it runs `refresh` only when `needsCheck(user.getSetting('last_check_at'), now)` and `downloadPermission(network, user.getSetting('allow_cellular') === '1')` is `go`. It always stores `last_check_at`.
  - After `updated`, it reopens the database and rebuilds the game.
- **`SetupScreen`** (no live database):
  - Text: "BinDiver needs its card data: one download of about 22 MB."
  - A **Download** button. On cellular, it first shows an `Alert` reading "Download about 22 MB on cellular?" with Cancel and Download.
  - Status text while working, and the error text on failure.
  - When the network is `none`: "Connect to the internet to download the card data." The Download button stays disabled until the network changes (check `currentNetwork()` again when the app becomes active).
- **`currentNetwork`:** from expo-network `getNetworkStateAsync()`:
  - `isConnected === false` → `none`
  - `NetworkStateType.WIFI` → `wifi`
  - `NetworkStateType.CELLULAR` → `cellular`
  - anything else → `unknown`
- **Price date:** read from the live database's `meta` row `price_date`.
- **`HomeScreen`** (a temporary shell until Task 13): "Prices as of <date>", a **Search** button opening `SearchSheet`, and the picked card's name with "N versions at $10+". N is the total of `qualifying.length` across `game.lookup(ids, 1000, 'oldest')`.
- **`SearchSheet`:**
  - A text input labeled "Card name (English)", with suggestions from `game.suggest(text, 6)` as you type.
  - Tapping a suggestion calls `game.find(name)`, then `onPick`.
  - When `find` returns null, it shows "No card by that name".
  - A **Cancel** button.

- [ ] **Step 1: Install**

Run (in `app/`): `npx expo install expo-sqlite expo-file-system expo-crypto expo-network && npm install fflate@0.8`
Expected: these appear in `package.json` with `~58` versions (fflate `^0.8`).

- [ ] **Step 2: Implement** the files above.

- [ ] **Step 3: Verify the code builds**

Run: `npm test && npm run typecheck && npx expo-doctor && npx expo export --platform ios --output-dir dist`
Expected: tests pass, there are no type errors, expo-doctor reports no failed checks, and the iOS bundle exports without errors. `dist/` is gitignored.

- [ ] **Step 4: Commit**

```bash
git add app
git commit -m "Add device adapters, the first-download screen and typed search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Camera test screen

**Files:**
- Create:
  - `app/src/scan/useTitleReader.ts`
  - `app/src/screens/ScanScreen.tsx`
  - `app/src/screens/RunScreen.tsx`
  - `app/assets/tick.wav`
  - `app/scripts/make_tick.py`
- Modify:
  - `app/App.tsx` (show `ScanScreen` once data is ready; remove `HomeScreen`)
  - `app/app.json`
  - `app/babel.config.js`
  - `app/package.json`

**Interfaces:**
- Consumes:
  - `cardOutline`, `titleBand`, `viewRectToFrameRegion`, `linesFromText`, `topLine` and `CommitTracker` (Task 11)
  - `Game` (Task 8)
  - `UserStore`, `summarizeRun` and `runToCsv` (Task 10)
  - `useAppData` and `SearchSheet` (Task 12)
- Produces: `useTitleReader({ region, active, onText }): { frameOutput }`. Its `onText(rawText: string, lines: OcrLine[], frameSize: Size)` callback runs on the React Native thread.

**Rules:**
- **Camera:**
  - `useTextRecognition({ language: 'latin', scanRegion: region, frameSkipThreshold: 6 })`
  - `useFrameOutput({ pixelFormat: 'rgb', targetResolution: CommonResolutions.FHD_16_9, onFrame })`
  - In the worklet: `scanText(frame)`, then `scheduleOnRN(onText, text.resultText, linesFromText(text), { width: frame.width, height: frame.height })`, then `frame.dispose()`.
  - `<Camera device={useCameraDevice('back')} isActive={active} outputs={[frameOutput]} constraints={[{ resolutionBias: frameOutput }]} resizeMode="cover" />`
  - Camera permission comes from `useCameraPermission()`. When it's refused, the camera area says "BinDiver needs the camera to read card titles." and has a button that opens the phone's Settings (`Linking.openSettings()`). Search still works.
- **Screen layout:**
  - The camera view takes the top 50% of the screen, with the outline drawn from `cardOutline(viewSize)` and the band from `titleBand`, highlighted orange (`#ff9f43`).
  - Tap the camera to pause or resume. Below it: "Tap to pause".
  - The bottom shows the last committed card's name (large) and "N versions at $10+", plus a **Search** button.
  - A token shows "Token, not tracked". A tolerant match shows `Read as “<lineUsed>”`.
  - The screen stays awake (`useKeepAwake()`).
  - A top strip shows "Prices as of <date>". The date turns amber (`#e5a50a`) when `isStale(priceDate, new Date())`.
- **Per text callback:**
  1. `topLine(lines)`
  2. `game.matchTitle(line.text)`
  3. `tracker.push(match ? match.oracleIds.join(',') || match.name : null)`
  4. On a commit:
     - record a scan (source `camera`, the run's ID, `minCents` 1000, `alerted` = any qualifying version)
     - play the tick
     - show the result
- **Tick:**
  - `app/scripts/make_tick.py` writes a 40 ms, 1 kHz, 16-bit mono, 44.1 kHz WAV with 5 ms fades to `assets/tick.wav`.
  - It plays with expo-audio `useAudioPlayer(require('../../assets/tick.wav'))`, using `seekTo(0)` then `play()`.
  - Call `setAudioModeAsync({ playsInSilentMode: true })` once.
- **Test mode** (always on in this build):
  - **Run button:** a **Run** button opens `RunScreen`.
  - **Before a run:** a number box labeled "English cards in the stack", and **Start**.
  - **During a run:**
    - scanning continues
    - the screen shows "<N> read · <elapsed>" and **Stop**
    - every scan records with the run's ID
    - a typed search during a run records source `search`, match `typed`
  - **After Stop:**
    - "Cards read", "Read right" (a percentage), and "Seconds per card" (one decimal place)
    - the scan list, newest first, each row with a "Wrong" switch (`setMarkedWrong`)
    - **Export:** writes `runToCsv` to `new File(Paths.cache, 'bindiver-run-<runId>.csv')` and calls `Sharing.shareAsync(file.uri, { mimeType: 'text/csv' })`.
  - **Frame size:** a small grey line on the scan screen shows the first frame's size, for example "Frame 1080×1920". This checks the `FRAME_ASPECT` assumption.
- **`app.json` additions:**
  - `ios.infoPlist.NSCameraUsageDescription`: "BinDiver reads card titles with the camera."
  - `android.permissions`: `["android.permission.CAMERA"]`
  - plugins:
    - `["expo-build-properties", { "android": { "minSdkVersion": 26 } }]`
    - `["react-native-vision-camera-ocr-plus", { "disableTranslate": true, "disableNonLatinTextRecognition": true }]`
- **`babel.config.js`:** presets `['babel-preset-expo']`, plugins `['react-native-worklets/plugin']`.

- [ ] **Step 1: Install**

Run (in `app/`): `npx expo install expo-sharing expo-audio expo-keep-awake expo-build-properties && npm install react-native-vision-camera@5.2 react-native-vision-camera-ocr-plus@2.1 react-native-vision-camera-worklets@5.2 react-native-worklets@0.13 react-native-nitro-modules@0.37 react-native-nitro-image@0.15`
Expected: the packages are installed. `npx expo install --check` reports no version mismatches. If it does, accept its suggested versions for Expo packages only.

- [ ] **Step 2: Generate the tick**

Run (in `app/`): `python3 scripts/make_tick.py && ls -l assets/tick.wav`
Expected: a file of about 3.6 KB.

- [ ] **Step 3: Implement** the files above.

- [ ] **Step 4: Verify the code builds**

Run: `npm test && npm run typecheck && npx expo-doctor && npx expo export --platform ios --output-dir dist && npx expo prebuild --platform ios --no-install --clean`
Expected:
- Everything passes.
- Prebuild writes `ios/` (gitignored) with `NSCameraUsageDescription` in `ios/BinDiver/Info.plist`, which you can check with `grep -c NSCameraUsageDescription ios/BinDiver/Info.plist` (expect `1`).

Then delete `ios/`.

- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "Add the camera test screen: live title reading, commit tick, test runs and export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: First data release and first phone builds (controller task, with Matt)

**Files:**
- Create: `app/eas.json`
- Modify: `app/app.json` (EAS project ID, `updates`, `runtimeVersion`)

**Interfaces:**
- Consumes: `phone-db` (Task 2); the app (Tasks 4 to 13).
- Produces:
  - the `data-latest` release
  - an installed iPhone build
  - an Android APK
  - the `preview` update channel

- [ ] **Step 1: Build fresh data and ask before publishing**

Run: `.venv/bin/python -m bindiver update && .venv/bin/python -m bindiver phone-db`
Then ask Matt: "Make `Angrod/BinDiver` public and publish the card database as a public download?" Wait for yes. The repo was created private (ledger, Task 1); the phone downloads release assets without a token, so they only work once the repo is public: `gh repo edit Angrod/BinDiver --visibility public --accept-visibility-change-consequences`.

- [ ] **Step 2: Publish it**

```bash
gh release create data-latest --repo Angrod/BinDiver --title "Card data (latest)" --notes "Phone database for BinDiver. Card data and prices from Scryfall." data/cards-phone-*.zip
gh release upload data-latest data/manifest.json --repo Angrod/BinDiver --clobber
curl -sL https://github.com/Angrod/BinDiver/releases/download/data-latest/manifest.json
```

Expected: the printed manifest equals `data/manifest.json`.

- [ ] **Step 3: Matt signs in to Expo.** Ask Matt to create a free account at expo.dev and run, in his own terminal, `cd ~/code/BinDiver/app && npx eas-cli@27 login`.

- [ ] **Step 4: Configure EAS**

Run (in `app/`): `npx eas-cli@27 init --non-interactive --force && npx expo install expo-updates && npx eas-cli@27 update:configure --non-interactive`
- Then set `"runtimeVersion": { "policy": "fingerprint" }` in `app.json`.
- Write `app/eas.json`:

```json
{
  "cli": { "version": ">= 27.0.0", "appVersionSource": "remote" },
  "build": {
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": { "buildType": "apk" }
    }
  }
}
```

- [ ] **Step 5: Matt registers his iPhone.** In his terminal: `npx eas-cli@27 device:create`. He chooses "Website", opens the link on his iPhone, and installs the profile.

- [ ] **Step 6: Matt starts the iPhone build.** In his terminal: `npx eas-cli@27 build --profile preview --platform ios`. He signs in to Apple when asked and lets EAS create the certificates. Then:
  - He scans the build page's Install QR code with his iPhone.
  - If iOS asks, he turns on Developer Mode (Settings → Privacy & Security → Developer Mode) and restarts.

- [ ] **Step 7: Check on the phone.** Matt opens BinDiver. Expected:
  1. The first-download screen downloads the data.
  2. "Prices as of <date>" appears.
  3. Searching "fireb" suggests Fireball.
  4. The camera view shows the outline.
  5. The frame line reads exactly `Frame 1080×1920`. Anything else means the crop is wrong.
  6. A held-up Fireball commits with a tick, and the grey debug line shows what was read.
  7. The title is sharp when the card fills the outline (2× zoom, `CAMERA_ZOOM_X`).
  8. Reads still work with the phone tilted sideways.

- [ ] **Step 8: Android.** Matt runs `npx eas-cli@27 build --profile preview --platform android` and installs the APK from the build page on his Android phone. He repeats Step 7 there. Known risk before the Android gate: the 2× zoom is probably lost when the camera stops and restarts (every sheet open/close). Re-apply zoom when the camera starts and show the zoom in the debug line; this is JavaScript-only and ships with `eas update`.

- [ ] **Step 9: Commit**

```bash
git add app/eas.json app/app.json app/package.json app/package-lock.json
git commit -m "Configure EAS internal builds and updates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

JavaScript-only fixes from here on ship with `npx eas-cli@27 update --channel preview --message "<what changed>"`. Native changes, such as new packages or `app.json` plugins, need a new build.

---

### Task 15: The 50-card camera gate (Matt runs it, the controller records it)

**Files:**
- Modify: `BUILD_BREAKDOWN.md` (add "Phase 3 camera test results")
- Modify: `app/src/game/mtg/__fixtures__/misreads.json` (add real misreads from the log)

- [ ] **Step 1: Matt runs the test** on his iPhone, in good light at home:
  - **The stack:** 50 mixed cards, including old border, showcase, borderless, full-art, foil and sleeved cards, plus 2 or 3 foreign cards that he types.
  - **Starting:** enter the number of English cards, then Start.
  - **Scanning:** slide each card onto the last, coming in from below or from the side (not down from the top, which drags rules text through the title band), and type each foreign card's English name with Search.
  - **Order:** no two cards with the same name next to each other; the commit rule never commits the same card twice in a row.
  - **Finishing:** Stop, mark any wrong reads, then Export and send the CSV.
  - **Android:** the same test on his Android phone, if its build works. The iPhone result decides the gate.

- [ ] **Step 2: Analyse the CSV.** Count the reads, wrong reads, misses (English cards minus right reads) and seconds per card, timed only between consecutive right camera reads with no typed search between them (as the app's summary does). Also read the exported unmatched-lines CSV. List every tolerant match with its `raw_text` and `line_used`.

- [ ] **Step 3: Add real misreads.** For every wrong or tolerant read whose right card is known, append `[raw_text, right name]` to `misreads.json`. Run `npm test`. If one fails, fix `match.ts` (it must still pass every older case), and ship the fix with `eas update`.

- [ ] **Step 4: Record the result** in `BUILD_BREAKDOWN.md`: date, phone, cards, read rate, seconds per card, misses and their causes.
  - **Pass:** at least 95% of English titles right (2 or fewer wrong or missed in 50) and under 3 s a card on average. Then Plan 2 gets written.
  - **Fail:** follow spec section 2.4's fallbacks in order.
    - **Fallback 1:** tune `BAND_TOP`, `BAND_HEIGHT`, `OUTLINE_SHARE` and `frameSkipThreshold`. Ship with `eas update` and rerun.
    - **Fallbacks 2 to 4:** these need their own plan. Stop and talk to Matt.

- [ ] **Step 5: Commit, and finish the branch**

```bash
git add BUILD_BREAKDOWN.md app/src/game/mtg/__fixtures__/misreads.json app/src/game/mtg/match.ts
git commit -m "Record the Phase 3 camera test result

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then use superpowers:finishing-a-development-branch to merge `phase3-plan1` into `main`, by a PR on `Angrod/BinDiver`.
