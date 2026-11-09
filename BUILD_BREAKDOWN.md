# BinDiver: Build Breakdown, Cost, and Credentials

Nov 3, 2026 · Companion to `BinDiver.md`

## Context

This document covers what it takes to build the MTG Value Field Guide described in `BinDiver.md`: the work in each phase, the total cost, and the credentials or keys involved. The phone platform is still undecided (iPhone, Android, or both), so it assumes a cross-platform app and shows where costs differ by platform.

## Bottom line

- **Cash cost to build and use it yourself: $0 on Android, $0–$99/yr on iPhone.** Everything else is free: Scryfall, TCGCSV, on-device text reading, GitHub, and Expo's free tier.
- **No API keys are needed for the data.** Scryfall and TCGCSV are both keyless. Scryfall only asks for a `User-Agent` and an `Accept` header.
- **Phases 1 and 2 need no accounts at all.** They run on the Mac with Python and SQLite, which are already installed (Python 3.14, Node 26, git, and `gh` signed in as Angrod).
- **The real cost is time:** about 6–10 Claude Code working sessions, plus Matt's testing time and 3 sourcing trips.

## Decisions (Nov 3, 2026)

- **Phase 3 platform:** an Expo (React Native) app that builds for both phones. iPhone comes first for personal use, and Android gets tested alongside on Matt's Android phone, so a later public release covers both.
- **Xcode:** installed at `/Applications/Xcode.app`. Before the first iPhone build, point the developer tools at it with `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
- **"Known" applies to the card**, with an option to unmute a single version.
- **Prices come from Scryfall only in v1.** TCGCSV can be added later in the nightly job.
- **Default price level (Nov 4, 2026): $10.** At $10, 11% of the scanned card names alert (132 of 1,251). The app must also let Matt set any other threshold for what he's hunting; the command line already takes `--min`.
- **Version order (Nov 4, 2026):** oldest first by default, with newest first and highest price as options. Versions released the same day go by set, collector number, then nonfoil, foil, etched. The command line takes `--sort oldest|newest|price`.
- **Bulk sample:** a ManaBox scan export from Nov 3, 2026: 2,036 cards, 1,269 unique names, 161 sets, all English, 137 foil and 1 etched.

## Phase 3 decisions (Nov 6, 2026)

Full design: `docs/superpowers/specs/2026-11-06-phase3-scan-app-design.md`.

- **Live scanning, no tapping.** A result changes only after the same card has matched 3 reads in a row.
- **English titles only.** Matt types the English name of a foreign card, and foreign cards in a test stack count as typed-search cards. Foreign cards are rare in his bins. Japanese is the most common, and the first language to add after Phase 3.
- **iPhone installs through Matt's Apple Developer account:**
  - EAS cloud builds with internal distribution, installed from a QR code.
  - Each install lasts a year (the provisioning profile's life), with no Mac needed to reinstall.
  - Not TestFlight, whose builds expire after 90 days.
  - JavaScript-only fixes ship with EAS Update, which saves the free plan's 15 iOS builds.
  - Android builds the same way at no cost.
- **One public GitHub repo, `Angrod/BinDiver`,** holding the code, the docs, and the nightly phone database (a `data-latest` release download). That settles the R2 question.
- **Camera test first:** 50 cards, at least 95% read and under 3 s a card, before the rest of the app is built. It is planned separately from the rest of the app.
- **Phone database:** 21.8 MB to download and 49.7 MB on the phone, measured on the Nov 4 data.
- **Vibration is the default alert.** The other choices are sound, both, or screen only.

## Phase 1 results (Nov 3, 2026)

Phase 1's success criteria pass.

- **Database:** 104,665 paper printings and 155,748 printing+finish versions, 9,066 of them unpriced. It builds in 6 seconds: 48 MB on disk, 18 MB compressed.
- **Accuracy:** 20 varied cards, including split, double-faced, reversible, accented and Reserved List cards, match Scryfall's live API version for version, with no price differences. Matt also checked about 5 by hand and was happy with them (Nov 4, 2026).
- **Speed:** about 1 ms for an exact name and about 60 ms for a misspelled one, against a 1-second target.
- **Bulk sample, early alert rates:** of the 1,251 card names in the ManaBox scan, 24% have a version at $2+, 16% at $5+, 11% at $10+ (132 names), 8% at $20+ and 4% at $50+. Only 9 of the 2,036 physical cards were themselves $10+. Another 18 names are tokens or emblems: 17 are recognized as such and not tracked, and 1 (Shu Jing Meteorite) isn't in Scryfall's paper data. Basic lands alert at every level up to $50, so known-card muting will matter.

## Phase 2 results (Nov 4, 2026)

Phase 2's success criteria pass, so Phase 3 is next. The spot text builds and covers the bulk sample, Matt's 20-card self-test passed 20 of 20 (target: 16 of 20), and $10 is the chosen default price level.

- **Build:** the full database rebuild takes 14.4 seconds, with the look-for pass included (target: under 60). The database is 75.2 MB on disk and 28.7 MB compressed (`gzip -c data/cards.sqlite | wc -c` = 28,749,409 bytes).
- **Coverage:** at $10+, 586 of 631 qualifying versions in the ManaBox scan are told apart (93%; target 90%). 45 are unresolved, and no hand pair notes were added to get there.
- **Remaining look-alikes:** Alpha and Beta basic lands (LEA 10, LEB 15 versions), Portal and Intl. Portal basics (POR 5, ITP 4), Summer Magic vs. Unlimited, Revised and Fourth Edition (6 versions), and Unlimited vs. Revised, Fourth Edition and Summer Magic (4 versions: Northern Paladin, Serra Angel, Sleight of Mind, Living Lands); one Pro Tour Collector Set Island. The Collectors' Edition and Intl. Collectors' Edition pairs do have a source; before the fix the code could not use their back note on the basic lands, and now it does.
- **Same-year arts:** when one artist drew several arts for a card in the same year, the printed "art by" words are identical, so those versions now fall to collector number or to "check a reference image" (this is why coverage fell from 94% to 93% against the first build).
- **Counterspell at $25+:** "Counterspell: 20 of 106 versions worth finding at $25.00+. Value sits in old-border 1993-frame nonfoils (7 of 14) and old-border 1997-frame foils (3 of 3). Skip old-border 1997-frame nonfoils and retro-frame foils (0 of 20)." This matches the spec's example.

## Phase 3 camera test results (Nov 9, 2026)

The camera test passes, so Plan 2 (the rest of the app) is next. On Matt's iPhone 13, a 50-card stack read 50 of 50 cards right, averaging 2.54 seconds a card (targets: at least 95% and under 3 seconds).

- **Phone and build:** iPhone 13, EAS preview build `f08732da` (Nov 9), then update `01a1be9f` for run 3. Runs 2 and 3 had the phone in a holder above the cards. All three stacks were English cards.
- **Run 1 (Nov 8, 54 cards, phone in hand):** 54 of 54 right, 5.23 s a card, so speed failed. Old-frame titles such as Cooperation, Drought and Circle of Protection took 9–18 s because ML Kit garbles their font, and the pace between cards was relaxed.
- **Run 2 (Nov 9, 51 cards, same code):** 51 of 51 right, 4.15 s a card (3.61 s without three long pauses). The update hadn't loaded yet: iOS only checks for one when the app starts fresh, not when it comes back from the background.
- **Run 3 (Nov 9, 50 cards, with the update):** 50 of 50 right, none wrong or missed, 2.54 s a card (median 2.41 s), with no pause over 4.2 s.
- **Where the time goes (run 3):** once a card was in the outline, the app read it in a median 0.7 s (average 0.9 s). The fastest read was 0.4 s, which is the floor set by needing three matching reads at least 200 ms apart. The other 1.6 s or so per card was handling. Six cards took 1.8–2.8 s to read while they were being lined up.
- **What the update changed:**
  - Camera reads that miss the normal match get a looser one: 70% alike, same first letter, at least 6 letters, and a clear lead over the next-closest name. In run 3 it committed once, correctly ("Ballisca guad" as Ballista Squad).
  - Short digit-led mana-cost junk is trimmed from the end of a line.
  - The export gained a seconds-to-read column.
  - The camera, the 2× zoom and the outline were unchanged.
- **Misreads:** none of the 155 cards across the three runs was read as the wrong card. 40 reads matched despite misread letters: capital E read as G (Gviscerator, Gxotic Curse, Ghitu Fire-Gater), S as B or Y, i as í, and garbled endings (Radiant's Dragoo15). They are now regression tests: 87 misreads and 9 loose-match garbles.
- **Watch for:** a half-read title can loosely match a different card. Run 2's "radiau" matches Radiate, for example. It needs three matching reads in a row to commit, and none has. An update can remove the loose step if one ever does.
- **Matt's feedback:** reads feel instant once the title is in the orange strip, but the strip is tight to line a card up in.
- **Not tested yet:** Android, and the iPhone 15 Pro (it needs registering and a new build).

## What gets built

### Phase 1: Prove the lookup (Mac only)

- **Data loader:** downloads Scryfall's `default_cards` bulk file (81 MB compressed as of Nov 3, 2026, about 500 MB of JSON), keeps paper printings only, and writes a slim SQLite database: name, Oracle ID, set, collector number, finishes, `usd`/`usd_foil`/`usd_etched`, price date, Scryfall ID, and the fields used to spot printings.
- **Lookup CLI:** takes a name and a price, and returns qualifying printing+finish rows grouped by Oracle ID. Printings with no price show as "unpriced", never hidden.
- **Name matching:** exact, then fuzzy, against about 33k unique names. Handles split and double-faced cards (`A // B`) and Alchemy `A-` names.
- **Tests:** a 20-card hand-check list and a timing check (target under 1 s).

### Phase 2: Prove the teaching (Mac only)

- **Spot-it text generator** built from Scryfall fields: `border_color`, `frame`, `frame_effects` (showcase, extended art, etc.), `finishes`, `promo_types` (prerelease, stamped, serialized…), `full_art`, `textless`, `security_stamp`, `variation`, set name, and release date.
- **Hand-written notes table** for the early printings the data can't tell apart (for example, Alpha's rounded corners versus Beta). Expect a few dozen entries.
- **One-line value summary**, for example "Value is in foils from 2003–2014 frames; nonfoils are bulk."
- **Bulk alert-rate test:** run 200 real bulk names at $10. The easiest input is a ManaBox or TCGplayer CSV export of a bulk lot.

### Phase 3: Prove the scan (the phone app; the biggest phase)

- **App:** Expo (React Native) dev build, one codebase for both phones.
- **Camera text reading:** `react-native-vision-camera` with Google ML Kit text recognition. It runs on-device on both platforms, is free, and works offline. If live frame reading is unreliable, fall back to tap-to-capture.
- **Title isolation:** take the top text line of the card frame, then fuzzy-match it against the local name index. Typed search is always on screen as the backup.
- **Data on the phone:** the SQLite database lives on the device, so the app works offline in shops. It refreshes at most once a day, on Wi-Fi or on request.
- **Nightly data build:** a GitHub Actions job (about 3–5 min a night) rebuilds the slim database and publishes it as a release asset. The phone downloads only that file (21.8 MB compressed, 49.7 MB on the phone, measured on the Nov 4 data with the Phase 2 spot text included) and never parses Scryfall's 500 MB file.
- **Price setting:** $10 by default, changeable to any threshold, and remembered on the phone.
- **Shorthand toggle** (Matt's request, Nov 4, 2026): a quick-glance view for bin diving that shows each version's set icon, set name, finish and price, so a card can be checked and set down in seconds. The full look-for text stays available. A sort menu offers oldest first (the default), newest first, or highest price. Both are prototyped on the self-test page.
- **Alerts:** one optional sound or vibration, plus a screen-only mode.
- **Known-card muting**, stored locally.
- **Module boundary:** MTG-specific lookups sit behind a single `game` interface, per the build guardrails.

### Phase 4: Prove the habit

- **Watchlist:** stores Scryfall printing IDs and dated price snapshots.
- **On-demand refetch:** calls Scryfall's `/cards/collection` directly (75 IDs per call, at most one call every 500 ms). No server is needed.
- **Trip review:** a simple list of cards marked known and alerts silenced over time, to check the "alerts fall" success criterion.

## Cost table

| Item | When needed | Cost |
| --- | --- | --- |
| Scryfall API and bulk data | Phase 1 onward | $0, no key |
| TCGCSV (optional second price source) | Not needed in v1 | $0, no key |
| Python, SQLite, Node | Phases 1–2 | $0 (already installed) |
| GitHub repo and Actions | Phase 3 | $0 (about 150 min/month, inside the free 2,000) |
| Expo account and EAS Build | Phase 3 | $0 on the free tier |
| Android: Android Studio, installing the app as a file | Phase 3 | $0 |
| iPhone: full Xcode, free Apple ID | Phase 3 | $0, but the app expires every 7 days and must be reinstalled from the Mac |
| iPhone: Apple Developer Program | Phase 3, for TestFlight or 1-year installs | **$99/yr** |
| Google Play Console | Only if publishing | $25 one-time |
| On-device text reading (ML Kit / Apple Vision) | Phase 3 | $0 |
| Cloud OCR, AI or LLM API | Not needed | $0 |
| Claude Code | Throughout | Existing plan |

**Realistic totals:** $0 if Android comes first; $99 in year one for painless iPhone installs. Disk space: Xcode needs about 15 GB and Android Studio plus its SDK about 10 GB. The Mac currently has only Apple's command-line tools, not full Xcode.

## Credentials and accounts

**Data APIs (none needed)**

- **Scryfall:** no key. The app sends `User-Agent: BinDiver/<version>` and `Accept: application/json;q=0.9,*/*;q=0.8`, and keeps under 10 requests/sec.
- **TCGCSV:** no key. Its guidelines say to pull data from a separate job, not from the user-facing app, and at most daily. That fits the nightly GitHub job if it's ever added.
- **TCGplayer's own API:** not needed, and closed to new developers anyway. TCGCSV mirrors it.

**Accounts Matt sets up himself (Claude never handles these passwords)**

- **GitHub:** already signed in through `gh`. The nightly job uses GitHub's built-in token, so no secret is needed. Decided Nov 6, 2026: one **public** repo, so the phone downloads the release file without a token.
- **Expo account** (free): run `eas login` in your own terminal.
- **Apple ID** (free) or **Apple Developer Program** ($99/yr): sign in to Xcode or EAS yourself; EAS asks for these credentials interactively.
- **Android:** no account. Turn on developer mode on the phone, or install the APK from a link.

**Not needed in v1:** Anthropic or OpenAI keys, Google Cloud keys, TCGplayer or eBay developer keys.

## What's needed from Matt (not credentials)

1. A list of **20 varied test cards** (starting from Fireball, Counterspell, and Birds of Paradise), and about an hour to hand-check the Phase 1 results against Scryfall.
2. ~~A 200-card bulk sample for Phase 2~~: done, the ManaBox export (see Decisions).
3. ~~Decisions before Phase 3~~: done, see Decisions.
4. **Phase 3 hardware:** an iPhone and an Android phone, and the physical 200-card test stack, including old, foreign, showcase, and stylized cards.
5. **Phase 4:** 3 real sourcing trips.

## Time estimate (rough)

| Phase | Build (Claude Code sessions) | Matt's time |
| --- | --- | --- |
| 1. Lookup | 1 | About 1 hr hand-check |
| 2. Teaching | 1–2 | 1–2 hr bulk test, plus reviewing the spot-it notes |
| 3. Scan | 3–5 (plus 1–2 hr for Xcode/Android Studio setup) | Timed stack tests, including one in a shop |
| 4. Habit | 1–2 | 3 sourcing trips (calendar time) |

## Still open, not blocking Phase 1

- **Terms for a paid or public release:** Scryfall's guidelines restrict putting its data behind a paywall, so check the exact wording of Scryfall's and TCGCSV's terms before going beyond personal use.
- ~~Hosting the nightly database file~~: decided Nov 6, 2026. It's a public GitHub release in `Angrod/BinDiver`.

## Sources

- [Scryfall bulk data listing](https://api.scryfall.com/bulk-data) (file sizes checked Nov 3, 2026)
- [Scryfall: User-Agent and Accept headers now required](https://scryfall.com/blog/category/api)
- [Scryfall FAQ: trouble accessing the API](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17)
- [Scryfall rate limits](https://scryfall.com/docs/api/rate-limits)
- [TCGCSV docs and usage guidelines](https://tcgcsv.com/docs)
- [TCGCSV FAQ](https://tcgcsv.com/faq)
