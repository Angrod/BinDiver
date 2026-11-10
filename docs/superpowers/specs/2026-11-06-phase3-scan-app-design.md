# Phase 3 Design: The Scan App

Nov 6, 2026 · Builds on Phases 1 and 2 · See `BinDiver.md` and `BUILD_BREAKDOWN.md` · Mockup: https://claude.ai/artifact/GPF8XPf6y3kUcQmsoB2LyW

## Goal

Hold the phone over a card in a bin. Within seconds, see which of that card's versions are worth your price or more, and how to spot each one. The app never says what the card in your hand is worth.

**Success (from `BinDiver.md`):**
- A mixed stack of 200 cards: at least 95% of titles read correctly, averaging under 3 seconds a card.
- A mixed stack in a shop or poor light: typed search recovers every card the camera misreads.

**Decisions made with Matt (Nov 6):**
- **Live scanning, no tapping.** The result changes only after a new title has matched the same card 3 reads in a row.
- **English titles only.** For a foreign card, Matt types the English name, or (from Plan 2) its set and number (section 3.1). Foreign cards in a test stack count as typed-search cards, not camera misses. Japanese is the first language to add after Phase 3; that needs Scryfall's all-languages names and a Japanese text reader.
- **iPhone first, using Matt's Apple Developer account.**
  - Builds come from Expo's cloud service (EAS) as *internal distribution* builds. Matt installs one by scanning a QR code, after registering his iPhone once (`eas device:create`).
  - An install keeps working until its Apple provisioning profile expires, which is a year, and no Mac is needed to reinstall.
  - TestFlight isn't used, because its builds expire after 90 days.
  - Fixes that only change JavaScript reach the installed app through EAS Update, without a new build. This saves the free plan's 15 iOS builds.
  - Android is built the same way at no cost and tested on Matt's Android phone. The iPhone decides pass or fail.
- **One public GitHub repo** (`Angrod/BinDiver`) holds the code, the docs, and the nightly card database as a public download.
- **Camera test first.** It is not throwaway: it becomes the scan screen of the finished app.
- **Vibration is the default alert.**
- **"Known" applies to the card** (decided Nov 3), with a per-version "Still alert for this version" switch.
- **From the mockup (approved):** collector numbers on rows whose set names repeat, alert rates on the price presets, and a dark look that follows the phone's light or dark setting.

**Decisions made with Matt for Plan 2 (Nov 9, after the camera test):**
- **Quiet alert for old-border, Secret Lair and serialized cards.** When every version at the price is one of these, the result shows without vibration or sound (section 3.2): an old-border printing (printed through Scourge, 2003), a Secret Lair version, or a serialized one. Retro-frame reprints, showcase and borderless versions still alert in full. In the camera runs, this cut buzzes from 30 to 11 per 142 cards.
- **Basic lands start as known** (section 4.1), including the snow-covered basics and Wastes.
- **Foreign cards** can be looked up by set code and collector number (2014 on) and by "number/total" plus artist (1998 to 2014), as well as by English name (section 3.1). Camera reading stays English-only.
- **The iPhone 15 Pro** joins the iPhone 13 and the Pixel 8 for the phone tests. It needs registering (`eas device:create`) before Plan 2's builds.
- **Quieting showcase and borderless versions too** waits for the 200-card test's alert numbers. In the camera runs it would have cut buzzes from 11 to 9 per 142 cards.

**Not in Phase 3:** the watchlist and price refetch (Phase 4), reading non-English titles with the camera, art recognition, an App Store or Play Store release, accounts, analytics, condition.

## 1. How the pieces fit

One repo, three parts:

| Part | Where | Job |
| --- | --- | --- |
| Python build | `bindiver/` (exists) | Builds the card database and all spot text, as it does now. Still the only place look-for text, notes and look-alikes are made |
| Nightly job | `.github/workflows/nightly-data.yml` | Runs the Python build each day and publishes a phone-sized database |
| Phone app | `app/` (Expo, TypeScript) | Camera, matching, results, alerts, known cards, settings |

### 1.1 The phone database

A new command, `python -m bindiver phone-db`, writes a slimmed copy of `data/cards.sqlite`:

| Table | Contents |
| --- | --- |
| `meta` | As now (`price_date` and the rest), plus `phone_format` = `1` |
| `printings` | Only `id`, `oracle_id`, `name`, `set_code`, `set_name`, `collector_number`, `released_at`, `lang`, `symbol_set`, with the `printings_oracle` index. Plan 2 adds `artist_id` and an index on `(set_code, collector_number)` |
| `versions` | As now. Plan 2 adds `quiet_kind`: `old border` (`frame_group` `old-1993` or `old-1997`), `Secret Lair` (a set whose name starts "Secret Lair": `sld`, `slc`, `slp`, `slu`, `pssc`) or `serialized` (`promo_types` includes `serialized`), checked in that order; empty for every other version |
| `names` | As now |
| `sets` | `code`, `name`, and `icon_svg` (the icon's SVG text, embedded so the phone never fetches icons). Plan 2 adds `printed_total`: Scryfall's `printed_size`, or `card_count` when that is missing (only 169 of 1,067 sets have `printed_size`; M15 prints 269 but has a `card_count` of 284) |
| `artists` (Plan 2) | `id`, `name`: each artist stored once (2,561 names for about 105k printings) |

**Icons for dark mode:** 159 of the 743 set icons set `fill="#000"` themselves, and the rest set no fill. The build strips `fill="#000"`, so the app can colour every icon by setting one fill.

It then runs `VACUUM`, zips the file, and writes a manifest. All three go in `data/` (already gitignored):
- `cards-phone.sqlite`
- `cards-phone-<price date>.zip`, holding one entry, `cards-phone.sqlite`
- `manifest.json`

```json
{"phone_format": 1, "price_date": "2026-11-04", "file": "cards-phone-2026-11-04.zip",
 "zip_bytes": 21795244, "db_bytes": 49713152, "sha256": "<sha256 of the zip file>"}
```

Measured on the Nov 4 data without icons:
- 21.8 MB compressed. This was measured with gzip; zip uses the same compression.
- 49.7 MB on the phone.
- Icons add about 1 to 2 MB.

`phone_format` goes up only when the app would misread the file. An app that finds a format it doesn't know keeps its current data (section 1.3).

Plan 2's additions only add a table, columns and an index, and the app never reads the card database with `SELECT *`. So `phone_format` stays `1`, and builds from before Plan 2 keep getting new prices. The Plan 2 app checks for the `artists` table and hides the number searches when it's missing. If a change ever has to break old builds, the nightly job builds both formats until those builds are retired.

### 1.2 The nightly job

- **When:** every 6 hours, plus a manual run button and a run whenever `bindiver/` changes on `main` (so hand-note fixes ship the same day). GitHub Actions is free for public repos.
- **Steps:**
  1. Read `manifest.json` from the `data-latest` release.
  2. Ask Scryfall's bulk-data listing for the current price date, the date of `default_cards`' `updated_at`. That's one small request.
  3. If the date equals the manifest's, and the run wasn't started by a code change or by hand, stop here. This keeps the 81 MB download to once a day.
  4. Run `python -m bindiver update`, then `python -m bindiver phone-db`.
  5. Upload the new zip to `data-latest`, then the new manifest, then delete the older zip. Uploading in that order means a phone never reads a manifest that names a missing file.
- **Set icons** are kept in GitHub's cache between runs, so the job doesn't re-download about 1,000 icons from Scryfall every night.
- The job uses GitHub's built-in token. No secrets.
- **Download address** (fixed, built into the app): `https://github.com/Angrod/BinDiver/releases/download/data-latest/manifest.json`, and the same path with the manifest's `file` name for the database.

### 1.3 Data on the phone

- **First launch:** the app explains that it needs one download of about 25 MB. On Wi-Fi it starts right away. On cellular it asks first ("Download on cellular?").
- **After that:** when the app opens or comes back to the front, and the last check was more than 24 hours ago, it fetches the manifest. It downloads only when the manifest's `price_date` is newer than the phone's.
- **Wi-Fi only**, unless "Allow downloads on cellular" is on in Settings.
- **Check now:** Matt can tap "Check for new prices now" at any time. On cellular with that setting off, it asks before downloading.
- **Safe swap:**
  1. Download to a temporary file.
  2. Check the zip's sha256 against the manifest.
  3. Unzip it.
  4. Open the database and confirm its `price_date` and `phone_format` match the manifest.
  5. Only then replace the old file.
  
  If any step fails, the old copy stays in use and the app tries again at the next check.

  **From Plan 2, two slots.** The database lives in one of two files, `cards-a.sqlite` and `cards-b.sqlite`, and `user.sqlite` records which one is live. A download goes into the other slot. Only once it opens and checks out does the record switch to it. The old slot is deleted after that, so a crash at any moment leaves at least one good copy. (The camera-test app moves the new file over the old one, and a move that overwrites deletes first.)
- **Offline:** everything works from the last good copy.
- **Price date:** the top strip always shows "Prices as of Nov 4". The date turns amber once it is more than 3 days old.
- **Matt's own data** (known cards, scan history, settings) lives in a separate `user.sqlite` that a data download never touches.

### 1.4 The phone's own logic

TypeScript ports of the Python rules that run per lookup:

| Python | TypeScript | Must match |
| --- | --- | --- |
| `normalize.normalize_name` | `normalize.ts` | Exactly |
| `lookup.sort_versions` (oldest, newest, price; same tie rules) | `sort.ts` | Exactly |
| `lookup.Catalog._group` (qualifying, unpriced, card name, totals) | `lookup.ts` | Exactly |
| `summary.summarize` | `summary.ts` | Exactly. It depends on the price setting, so it has to run on the phone |
| `difflib` fuzzy match | `match.ts` (section 2.2) | The right card, not the same scores |

Look-for text, notes and `same_as` are read from the database and never re-implemented.

**The game boundary.** Everything MTG-specific sits in `app/src/game/mtg/` behind one interface, `Game`, in `app/src/game/types.ts`. Camera, alerts, known cards, settings and data download use only that interface. Its jobs:
- match a camera line to a card
- suggest names for typed search
- find a typed name
- look up a card's versions at a price and sort order
- give a set's icon

The MTG code reads the database through a small `Db` interface. The phone uses `expo-sqlite`, and the tests on the Mac use Node's built-in `node:sqlite` on the same file format.

## 2. The camera test

The first thing built.

### 2.1 What you see

- A camera view with a card-shaped outline. The title strip at the top of the outline is highlighted, so you know where the name goes.
- When a card is read, its name shows large at the bottom with a count such as "3 versions at $10+". The count proves the full database works on the phone.
- A short tick plays on each read so you know to slide the next card on. The tick is camera-test only.
- The screen stays awake while scanning.

### 2.2 How it reads

- **Reader:** VisionCamera v5 with Google ML Kit text recognition through `react-native-vision-camera-ocr-plus` v2, on the phone, offline. It runs up to about 5 reads a second, tuned during the test.
- **Title line:**
  - Only text lines whose box sits inside the highlighted strip count.
  - The topmost of those is the title.
  - A read whose strip holds any piece of the card's copyright line ("© 2026 Wizards of the Coast", "Viacom") counts as no title, since the strip is then over the bottom of a card. This blocks only the joke card "Of the Coast", which typing still finds. (Added after the Nov 9 runs.)
- **Mana symbols:**
  - The reader turns mana symbols at the end of the line into junk text.
  - So the matcher tries the whole line first, then drops up to 3 trailing words one at a time, and keeps the best match.
- **Matching:** an exact name match first (`names` table, full names before faces, as in Python). Failing that, a tolerant match:
  - A trigram index narrows the roughly 33k names to a few dozen candidates.
  - Edit distance then picks the closest one.
  - A match needs similarity of at least 0.8, the Python cutoff.
  - Target: under 20 ms per line.
- **Loose matches (camera only, added Nov 9):** a camera line that misses both of those gets one more try, for badly garbled old-frame titles: the closest name at similarity 0.7 or more that starts with the line's first character, for lines of at least 6 letters, and only when it beats the next-closest name by 0.02. Typed search stays at 0.8. These count as match kind `loose`.
- **Blank-name cards (added Nov 9):** cards named with blanks, such as "_____ _____ Rocketship", also match the words printed around the blanks ("Rocketship"), unless those words are part of another card's name or two blank cards share them.
- **Tokens:** a token name shows "Token, not tracked", with no alert.
- **Commit rule:**
  - A card counts as read once the same card has matched 3 reads in a row.
  - A line that matches nothing is ignored, and the last result stays on screen.
  - A read that holds the copyright line starts the count of 3 again.
  - Reading the same card again does nothing.

### 2.3 What it records

Every committed read is written to `user.sqlite` (section 4.3). In test mode a run screen adds:
- **Start and Stop**, and a box for how many cards were in the stack, so missed cards count against the total.
- **Summary:**
  - cards read
  - read rate: right reads ÷ English cards in the stack
  - average seconds per card: time from the first read to the last, divided by the number of reads after the first
- **Mark wrong:** tap any read to mark it wrong.
- **Export:** a share button sends the run as a CSV file. Each row has:
  - time, seconds since the previous read, and seconds the card took to read
  - raw text, and the line used
  - matched name and match kind (exact, tolerant, loose, typed)
  - price date, price setting, and whether it alerted
  - whether it was marked wrong

### 2.4 How it is run, and the gate

- **Cards:** 50 mixed cards in good light at home: old border, showcase, borderless, full-art, foil, sleeved, and 2 or 3 foreign cards, which are typed and don't count.
- **Phones:** iPhone first. Android runs the same test once its build works.
- **Pass:** at least 95% of English titles right (2 or fewer wrong or missed) and under 3 seconds a card. Then the rest of the app gets built on top.
- **If it fails, in order:**
  1. Tune how the title line is picked.
  2. On iPhone, switch to Apple's own text reader through a small frame-processor plugin of our own.
  3. Tap-to-read.
  4. If none of these passes, the stop rule in `BinDiver.md` applies: stop and rethink before building more.

## 3. The scan screen and the alert

Portrait, one hand. The mockup's five boards show each state.

### 3.1 Layout

- **Top strip:** "Prices as of Nov 4" (amber after 3 days), the price chip ("$10+", tap to change), and a gear button for Settings.
- **Camera (top half):** the outline and title strip. Tap to pause scanning, tap again to resume ("Tap to pause").
- **Result (bottom half):**
  - It shows the last card read and stays until the next one, so Matt can lift the phone and read it.
  - **Header:** the card name, "4 of 49 versions at $10+", and the one-line value summary.
  - **Versions:** one row per qualifying version, in the chosen order. Each row has:
    - the set icon, or a "no set symbol" badge when `symbol_set` is `none`
    - the set name, plus "#<collector number>" when another row in the list has the same set name
    - a foil or etched tag
    - the price
  - **Tapping a row** opens:
    - its look-for text
    - its notes
    - any look-alikes from `same_as`, each with its own current price ("Looks the same as … Check a reference image.")
  - **Unpriced (N):** a folded section, never hidden. Its rows open the same way.
  - **Sticky header:** when the panel scrolls, a sticky line keeps the count ("4 at $10+ · 7 unpriced").
  - **Shorthand off:** each row shows its look-for text inline, as on the self-test page.
  - **Tolerant match:** "Read as “Bloodfell Caues”. Not this card? Tap Search."
  - **Nothing at the price:** a grey panel, "Nothing at $10+", "0 of 26 versions. No alert."
- **Bottom bar:**
  - The Shorthand switch.
  - The sort menu: Oldest first (default), Newest first, Highest price.
  - Search.
  - The phone remembers the Shorthand and sort choices.
- **Search:**
  - The camera pauses while you type.
  - The box sits at the top, so suggestions stay above the keyboard. Its hint reads "Name, or set and number (MOM 123), or number/total (38/143)". Below the box: "Cards from before 1998 have no number: type the English name."
  - **A name:** names that start with what you typed come first, then tolerant matches. Text with no Latin letters or digits suggests nothing.
  - **Set code and number** (printed on cards from 2014 on, the same in every language), such as "MOM 123", "mom 0123" or "123 MOM":
    - Leading zeros are dropped, since Scryfall stores "0123" as "123".
    - Suffixes are kept: "250p", "325★", "30c".
    - A stray single letter from the printed rarity ("R 0123 MOM") is ignored.
    - The List's "KLD-242" style works too.
    - The match opens that card's result, with the typed version marked "This version".
  - **Number/total** (printed from Exodus, 1998; from 2014 the set code is printed beside it, so that works too), such as "38/143": every card numbered 38 in a set whose `printed_total` is 143, from printings released in 1998 or later, as a list of candidates. An "Artist" box below, with suggestions from the `artists` table, narrows the list. The artist is printed in Latin letters on Japanese cards too. Time Spiral Timeshifted has its own total, 121.
  - Picking a name shows its result in the same panel. Cancel resumes the camera.
  - A name that isn't in the data shows "No card by that name".
- **Price sheet** (from the chip): "Alert at or above".
  - Presets $2, $5, $10, $20, $50, and a box for any amount. Remembered on the phone.
  - Each preset shows its alert rate: the share of distinct card names in the scan history that would alert at that price, worked out from current prices.
  - The rates stay hidden until 50 distinct names have been scanned.

### 3.2 The alert

- **When:** a newly read card has at least one *priced* version at or above the price, and isn't muted as known (section 4.1). Versions with no price never trigger an alert.
- **Two strengths (from Plan 2):**
  - **Full alert:** at least one of those versions has an empty `quiet_kind` (section 1.1). This gives the orange border, the "Worth finding" label, and the signal.
  - **Quiet alert:** every one of those versions has a `quiet_kind`: an old-border printing (printed through Scourge, 2003), a Secret Lair version, or a serialized one. This gives a thinner amber outline, no vibration or sound, and a label naming the kinds, such as "Old border only · 3 versions at $10+" or "Old border or Secret Lair only · 4 versions at $10+". These are easy to rule out by eye (the old frame, the Secret Lair set symbol, the stamped serial number), and Secret Lair and serialized cards rarely reach bulk bins.
  - Retro-frame reprints (`frame_group` `retro`: 30th Anniversary, the Remastered sets, Modern Horizons, Time Spiral Timeshifted), showcase and borderless versions count as full alerts, because they are modern products found in modern bins.
  - For a known card, the same rule runs over its kept versions only.
  - **The same list either way.** A quiet alert, a full alert and a known card all show every version at the price, and the folded unpriced ones, with the same rows and the same look-for text when a row is opened (section 3.1). The strength changes only the border, the label and the signal.
- **On screen:**
  - The result panel gets a thick orange border and a "Worth finding" label.
  - The colour differs from the grey panel in lightness as well as hue, so it reads in poor light and for colourblind eyes.
- **Signal:** vibration (default), sound, both, or screen only (Settings). Quiet alerts never signal.
- **Alert rates** on the price presets count full alerts only, since those are what make the phone buzz.
- **No repeats:** the alert fires once per newly read card, never again for the same result.

## 4. Known cards and settings

### 4.1 Known cards

- **Mark known:** every result has a "Mark known" button.
- **A known card still shows its full result.** The panel is grey, with a "Known" label instead of "Worth finding", no alert, and an "Unmark" button.
- **Still alert for this version:** on a known card, opening a version row shows this switch.
  - Example: Island marked known, Alpha Islands kept on alert.
  - If a kept version is at or above the price, the card alerts again and the label reads "Known · 1 version still alerts".
- **Settings → Known cards (N):** a searchable list with Unmark on each card.
- **Basic lands start as known (from Plan 2).** On first launch, the app marks Plains, Island, Swamp, Mountain, Forest, Wastes and their snow-covered versions as known, once. In the camera runs, Island and Plains each had 50 to 70 versions at $10+, mostly modern promos and foils, so every basic in a bin would otherwise buzz. A setting records that this was done, so an Unmark sticks. Known marks live in `user.sqlite` by oracle ID, so a data download never touches them.

### 4.2 Settings

The gear button opens Settings:

| Setting | Contents |
| --- | --- |
| Alert price | The same value as the price chip |
| Alert style | Vibration (default), sound, both, screen only |
| View | Shorthand on or off, sort order (both remembered) |
| Card data | "Prices as of Nov 4", the file size, "Check for new prices now", "Allow downloads on cellular" (off by default), and the last check's error if it failed |
| Known cards | The list from section 4.1 |
| Camera test | Test mode on or off (the tick and the run screen), and Export |
| About | "Card data and prices from Scryfall." No Scryfall logo, since its rules forbid implying endorsement. Plus the Wizards Fan Content Policy notice: "BinDiver is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC." |

### 4.3 What `user.sqlite` stores

| Table | Columns |
| --- | --- |
| `known_cards` | `oracle_id` (key), `name`, `marked_at` |
| `known_kept_versions` | `oracle_id`, `version_key` (`scryfall_id:finish`), together the key |
| `scans` | `id`, `at`, `run_id` (test runs only, else empty), `oracle_id`, `name`, `source` (`camera` or `search`), `raw_text`, `line_used`, `match` (`exact`, `tolerant`, `loose`, `typed`), `price_date`, `min_cents`, `alerted` (a full alert), `marked_wrong`, `read_ms` (camera reads: how long the card took to read), `alert` (from Plan 2: `full`, `quiet`, `known` or `none`) |
| `test_runs` | `id`, `started_at`, `stopped_at`, `stack_count` |
| `settings` | `key`, `value` |

A kept version that later disappears from the data is ignored. `marked_at` and `scans` are what Phase 4's trip review needs to show alerts falling as Matt learns.

**Nothing leaves the phone.** There are no accounts and no analytics. The only network traffic is:
- the manifest and database download from GitHub
- the app's check with Expo's update server for a newer version of its own code (EAS Update), when the app starts and when it comes back to the front (at most once a minute). Each check carries a random ID that expo-updates makes for each install (the `EAS-Client-ID` header), which is how Expo counts installs. Not yet decided for a public release: accept it, or host updates without it.
- Google ML Kit's own traffic: it sends Google metrics about how its text reader performs and is used, and it fetches model updates. Matt accepted this on 2026-11-08 rather than switch to Apple's text reader.

None of these carries Matt's data: the update check's install ID is random, not tied to an account. ML Kit reads the camera frames on the phone and doesn't send them or the text it reads.

## 5. When things go wrong

| Situation | What happens |
| --- | --- |
| First launch, no connection | A screen says the one-time download needs a connection. Nothing else works until then |
| Download or checksum fails | Old data stays in use. Settings shows the error, and the next check tries again |
| Data format newer than the app | Old data stays in use. Settings says "Update the app to get newer prices", and the date goes amber once it's 3 days old |
| Camera permission refused | The camera area explains it and links to the phone's Settings. Typed search still works |
| Reads match nothing | The last result stays. No alert |
| Name not in the data (e.g. Shu Jing Meteorite) | Typed search shows "No card by that name" |
| Token | "Token, not tracked", no alert |
| A name that is several cards | Each card's result is shown, stacked, as Python returns them |

## 6. Testing

### 6.1 Automated, on the Mac

- **Phone database (pytest):**
  - It keeps exactly the listed columns, and every `symbol_set` icon is embedded.
  - `VACUUM` has run.
  - The manifest's size and sha256 match the zip, and its `price_date` and `phone_format` match the database.
- **Nightly skip rule (pytest):** an unchanged price date skips the build, unless the run was forced. This is a Python function the workflow calls.
- **Matching the Mac exactly (Jest):**
  - `python -m bindiver golden` writes a small phone-format database with about 50 cards and their expected results at $2, $10 and $50 in all 3 sort orders: rows, order, counts, unpriced list, and summary line.
  - The cards are the Phase 1 hand-check 20, the Phase 2 self-test 20, and cards covering each summary rule, including Island for its many printings.
  - The fixture is committed under `app/src/game/mtg/__fixtures__/`, and the TypeScript output must match it exactly. It is regenerated whenever the Python lookup or summary changes.
- **Misreads (Jest):**
  - `misreads.json` lists camera-style misreads and the card each must find. It starts with about 30 by hand:
    - dropped or swapped letters, u/v, rn/m, l/I
    - trailing mana junk
    - missing apostrophes and commas
    - "Bloodfell Caues"
    - accented and split names
  - It grows from the camera-test log.
  - Also: 200 real names typed correctly must match themselves exactly, and each match must take under 20 ms.
- **Known cards (Jest):**
  - A known card doesn't alert.
  - A kept version at or above the price makes it alert again, with the "Known · 1 version still alerts" label.
  - Unmark restores the normal alert.
- **Refresh (Jest):**
  - A bad checksum keeps the old data.
  - A newer `phone_format` keeps the old data.
  - `user.sqlite` survives a data swap.
  - The date turns amber after 3 days.
- **Commit rule (Jest):**
  - 3 matching reads in a row commit a card.
  - 2 don't.
  - The same card again doesn't re-alert.
- **Both test suites run on every push** (`.github/workflows/tests.yml`).

### 6.2 On Matt's phone

1. **Camera test:** 50 cards, the gate in section 2.4.
2. **200-card timed stack:**
   - At least 95% of English titles read right with no typing, averaging under 3 seconds a card, so about 10 minutes for the stack.
   - Foreign cards are typed and don't count against the 95%.
3. **Phone versus Mac:** Matt exports the run, and `python -m bindiver check-log run.csv` replays every read through the Python lookup at the run's price setting. It lists any card where the phone and the Mac disagree on alerting, and warns if their price dates differ.
4. **Shop or dim light:** a mixed stack in a shop or a poorly lit room. Every card the camera misses or misreads must be found by typed search. All of them.
5. **Android and the iPhone 15 Pro:** the 200-card stack on the Pixel 8 and the iPhone 15 Pro as well. The iPhone 13 result decides the phase.
6. **Alert numbers:** the 200-card run records how many cards give a full alert, a quiet alert and none. It also records how many full alerts come only from showcase or borderless versions. Whether those go quiet too is decided from these numbers.

Results are recorded in `BUILD_BREAKDOWN.md`, as for Phases 1 and 2.

## 7. Build order

1. **Repo:**
   - `git init`.
   - Matt approves the list of files going public.
   - Create `Angrod/BinDiver` (public) and push.
2. **Python side:** `phone-db`, `golden` and the tests in section 6.1. The first database goes to `data-latest` by hand.
3. **Camera test app:**
   - Expo dev build, data download and swap, the TypeScript port with golden tests, matching, the commit rule, the test-mode log, and export.
   - First EAS builds, with Matt signing in to Expo and Apple himself and registering his iPhone. If iOS asks, he turns on Developer Mode.
   - **Gate:** Matt's 50-card test passes (section 2.4).
4. **Full app:**
   - the results panel, sort, price sheet, alert, known cards, search, settings
   - the quiet alert, basics starting as known, and the set-and-number and number/total searches (the phone database gains `artists` and `printed_total`)
   - the two-slot data swap
   - the nightly job and the test workflow
   - new EAS builds for iOS (the iPhone 13 and the 15 Pro, registered first) and Android, since set icons need `react-native-svg`, a native library. The new iOS build also ends the camera test's workaround for publishing iOS updates.
5. **Phone tests:** section 6.2, then the results go into `BUILD_BREAKDOWN.md`.

**Before any store release (not in Phase 3):**
- Turn Android's code shrinking (R8) back on, with keep rules for ML Kit, and re-run the camera test, since shrinking can strip what native libraries need.
- Decide on the update check's per-install ID (section 4.3): accept it, or host updates without it.

**Two implementation plans.**
- **The first** covers steps 1 to 3 and ends at the camera gate.
- **The second** covers steps 4 and 5. It's written after the gate passes, so it can build on whatever the camera test found, such as a switch to Apple's text reader.

## 8. Files

| File | Change |
| --- | --- |
| `bindiver/mtg/phone_db.py` (new) | Build the phone database, zip and manifest (section 1.1); the nightly skip rule. Plan 2: `artists`, `printed_total`, the `(set_code, collector_number)` index, icon fills stripped |
| `bindiver/mtg/golden.py` (new) | Write the golden fixture (section 6.1) |
| `bindiver/mtg/check_log.py` (new) | Compare an exported phone run with the Python lookup |
| `bindiver/__main__.py` | `phone-db`, `golden` and `check-log` commands |
| `.github/workflows/nightly-data.yml` (new) | Section 1.2 |
| `.github/workflows/tests.yml` (new) | pytest and the app's Jest tests on every push |
| `app/` (new) | The Expo app: `src/game/` (the `Game` interface and `mtg/`), `src/data/` (download, check, swap, `Db`), `src/user/` (`user.sqlite`), `src/scan/` (camera, title line, commit rule), `src/screens/` (scan, search, price sheet, settings, test run) |
| `README.md` (new) | What BinDiver is, the Scryfall credit, and the Fan Content Policy notice |
| `.gitignore` | Add `app/node_modules/`, `app/.expo/`, `app/ios/`, `app/android/` (generated by Expo) |
| `tests/` | Tests for the three new Python modules |

No open-source licence in Phase 3, so the code is all rights reserved by default. A licence can be added if the app is ever released.
