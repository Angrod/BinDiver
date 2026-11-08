# MTG Value Field Guide: Build Plan

Nov 3, 2026 · @Matt

## Context

Existing MTG scanners answer "what is this card worth?" This app answers a different question: "which versions of this card are worth finding?"

The idea began as ScoutIQ for cards: scan fast, get a buy-or-skip signal. It then moved away from identifying the exact printing, because art alone often can't separate printings. Scanning now opens a reference for that card, so the app teaches value while the user judges the physical card.

**What exists today:**

- [ManaBox](https://manabox.app/guides/scanner/faq/) identifies cards by art and plays three sounds at fixed price thresholds that users can't change.
- [SortSwift](https://sortswift.com/features/mobile-app) offers custom price triggers with sounds and color overlays, inside shop-focused software.
- No product found in this research alerts when any printing clears a user-set price. That search was not exhaustive.

**What Matt can reuse:** Scryfall and TCGCSV experience from the offer calculator, plus Claude Code and GitHub. He already works MTG bulk, sells on eBay and TCGplayer, and owns a real test bench of cards.

## Goal

Build a phone tool that shows, within seconds of scanning any MTG card, which of its printings and finishes are above the user's chosen price, and how to spot them.

The first user is Matt: digging through bulk bins, checking lots in person, and learning which versions are worth watching for. If it proves useful to him, wider release becomes a separate decision.

The app should get quieter as the user learns. Once a card is marked as known, it stops alerting, so what's left is what the user doesn't know yet.

## Scope

The first version does one job: name in, versions worth finding out.

| Feature | Version 1 | Later or never |
| --- | --- | --- |
| Card input | Read the title with the camera, with typed search as backup | Art recognition |
| Results | Printings and finishes at or above the user's price, oldest first, with newest first or highest price as options | Exact-copy identification |
| Each result | Set, collector number, finish, price, price date, how to spot it | Condition-adjusted value |
| Summary | One line on where the value sits, built from the price data | Written guides for each card |
| Alerts | One optional sound or vibration | Tones matched to value |
| Learning | Mark a card as known to silence it | Quizzes or study modes |
| Watchlist | Save a card and chosen versions, then refetch prices on request | Background price alerts, ownership tracking |
| Games | MTG only | Yu-Gi-Oh, Pokémon, then others; sports as a separate project |

## Guardrails

**Product**

- Never imply the app has valued the card in hand. Results read as "versions worth finding," not "your card is worth."
- Don't add exact-printing identification to version 1. That would rebuild the problem this design removed.
- Label prices as market references with their date, and don't adjust them for condition.
- If a printing has no price, show it as unpriced rather than hiding it. Old cards are where a gap would hurt most.
- Keep scanning usable with the sound off and the screen as the only signal.

**Data**

- Follow [Scryfall's API rules](https://scryfall.com/docs/api/rate-limits): use bulk files for rapid lookups, and cache data for at least 24 hours.
- Don't refresh prices more than daily, since [Scryfall updates them once a day](https://scryfall.com/docs/api).
- Save stable printing IDs in the watchlist, and treat stored prices as dated snapshots.

**Build**

- Keep game-specific lookups, versions, and prices behind one module boundary, without building other games yet.
- Prefer free data and personal use until the app earns a reason to change that.
- Don't start the next phase until the current phase's success criteria pass.
- Matt gets a walkthrough as each piece is built, not documentation at the end.

## Plan

Build in four phases, with each one testing the riskiest remaining assumption.

1. **Prove the lookup.** Load Scryfall's bulk data locally. Type a card name and a price, and return qualifying printings and finishes, grouped by [Oracle ID](https://pypi.org/project/scrython/3.0.0/).
2. **Prove the teaching.** Add the "how to spot it" text from border, frame, finish, and collector number data, plus the one-line value summary. Run it on Fireball, Counterspell, Birds of Paradise, and a sample of real bulk.
3. **Prove the scan.** Choose iOS, Android, or web, then read card titles with the camera and run a timed test on a physical stack. Add the sound and known-card muting here.
4. **Prove the habit.** Add the watchlist and on-demand refetch, then use the app on real sourcing trips before deciding what comes next.

## Success criteria

These targets are proposed starting points. Adjust them after Phase 1 shows real numbers.

| Phase | Test | Pass |
| --- | --- | --- |
| 1. Lookup | Check 20 varied cards by hand against Scryfall | All qualifying printings and finishes appear, with no wrong prices |
| 1. Lookup | Time a lookup after the data has loaded | Under 1 second |
| 2. Teaching | Show results for 20 cards and try to find each version in a reference image | Matt can tell the listed versions apart from the text alone on at least 16 |
| 2. Teaching | Run 200 real bulk cards at $10 | Alert rate is recorded, and a usable price level is chosen |
| 3. Scan | Scan a mixed stack of 200 cards | At least 95% of titles read correctly, averaging under 3 seconds per card |
| 3. Scan | Scan a mixed stack in a shop or poor light | Typed search recovers every failed read |
| 4. Habit | Use it on 3 real sourcing trips | At least one purchase or skip changes because of the app |
| 4. Habit | Review known cards after those trips | Matt can name versions he didn't know before, and alerts fall on repeat cards |

**Stop or rethink if:** the alert rate stays too high to be useful at any sensible price, or camera scanning isn't faster than typing. If only the alert rate fails, drop the sound and keep the guide.

## Risks and open questions

| Risk | Why it matters | Response |
| --- | --- | --- |
| Too many alerts | Staple cards may almost always have a qualifying version | Measure it in Phase 2, then raise the price or rely on known-card muting |
| Scan failures | Titles on old, foreign, stylized, or showcase cards may read poorly | Keep typed search, and include these cards in the test stack |
| Stale prices | [One package's documentation warns](https://search.r-project.org/CRAN/packages/scryr/scryr.pdf) that bulk-file prices can go stale | Show the price date, and check high-value results before buying |
| Weak spot text | Data may not describe the real differences between early printings | Test it in Phase 2, and hand-write notes for key sets if needed |

**Open questions**

- [ ] Which phone platform comes first: iOS, Android, or web?
- [ ] Should prices come from Scryfall alone, or also from TCGCSV?
- [ ] Do Scryfall's and TCGCSV's terms allow a paid or public version? Check before any release beyond personal use.
- [ ] Does "known" apply to a card, or to each version?
- [ ] Does the app need to work offline in shops with poor signal?

## Sources

- [ManaBox scanner FAQ](https://manabox.app/guides/scanner/faq/)
- [SortSwift mobile app features](https://sortswift.com/features/mobile-app)
- [Scryfall API documentation](https://scryfall.com/docs/api)
- [Scryfall rate limits](https://scryfall.com/docs/api/rate-limits)
- [Scrython package documentation](https://pypi.org/project/scrython/3.0.0/)
- [scryr package documentation](https://search.r-project.org/CRAN/packages/scryr/scryr.pdf)
