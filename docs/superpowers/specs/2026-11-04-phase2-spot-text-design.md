# Phase 2 Design: How to Spot It

Nov 4, 2026 · Builds on Phase 1 (lookup) · See `BinDiver.md` and `BUILD_BREAKDOWN.md`

## Goal

When a card alerts, the text alone should let Matt check the card in his hand against each listed version and rule it in or out, without looking anything up.

**Success (from `BinDiver.md`):**
- Shown results for 20 cards, Matt can tell the listed versions apart from the text alone on at least 16.
- The bulk alert rate is recorded and Matt picks a usable price level. The Phase 1 numbers already exist; Phase 2 adds the spot text that makes an alert usable.

**Decisions made with Matt (Nov 4):**
- Use the **look-for line** format: each version names only the traits that set it apart from the card's other versions.
- Use a **"where it is + what to skip"** value summary.
- **Compute spot text when the database is built,** not at lookup time, so the Phase 3 app can display it without a second implementation.
- **Every version shows its set name and set icon** (Matt, Nov 4). The CLI can't draw icons, so it shows the name; the self-test page and the Phase 3 app show both.
- **Wording fixes from Matt's review:** two separate stamps (List and promo), "old border" vs. "retro frame", "M15 frame", "silver screen foil", "serialized", the "Collectors' Edition" spelling, and Fifth Edition added to the sets with no set symbol.

**Not in Phase 2:** card images, phone UI, condition, exact-copy identification, TCGCSV prices, AI-written text.

## 1. Data: traits stored per printing

The database build also stores the visible traits for each printing: `artist`, `illustration_id`, `border_color`, `frame`, `frame_effects`, `full_art`, `textless`, `promo_types`, `security_stamp`, `card_back_id`, `lang`, and `released_at`. These already exist in Scryfall's `default_cards` file.

Each version (printing + finish) gains these stored columns:

| Column | Meaning |
| --- | --- |
| `look_for` | The rendered look-for line, for example "art by Mark Poole, black border, old border (1993 frame), English, regular card back" |
| `notes` | Hand notes that apply to this version, one per line |
| `same_as` | JSON list of version keys (`printing_id:finish`) still indistinguishable after traits and notes |
| `frame_group` | Frame bucket used by the value summary (see section 3) |

`same_as` stores keys, not prices, so the lookup shows each look-alike's current price.

The build also stores Scryfall's set list (code, name, and `icon_svg_uri`, fetched once a day from `https://api.scryfall.com/sets`), plus each printing's `symbol_set`: the set whose symbol is actually printed on the card. That is the card's own set, the original set for a List card, or `none` for sets with no set symbol.

## 2. Look-for line

### Trait check order and wording

Traits are checked in the order you'd look at a physical card. A trait appears in the line only if it rules out at least one of the card's other versions.

| # | Trait | Wording |
| --- | --- | --- |
| 1 | Art | "art by {artist}". If one artist drew two arts for the card: "art by {artist} ({year of first use} art)" |
| 2 | Border | "black border", "white border", "borderless", "gold border", "silver border", "yellow border" |
| 3 | Finish | "nonfoil", "foil", "etched foil". On the foil finish only, a named special foil replaces "foil": "surge foil", "galaxy foil", "ripple foil", "silver foil", "double rainbow foil", "textured foil", "confetti foil", "raised foil". Any other foil stays "foil". A set whose foils all share one treatment takes the name from hand notes (Innistrad: Double Feature → "silver screen foil") |
| 4 | Frame | 1993 → "old border (1993 frame)", 1997 → "old border (1997 frame)", a 1993 or 1997 frame on a printing released after Scourge → "retro frame", 2003 → "modern frame", 2015 → "M15 frame", future → "Future Sight frame" |
| 5 | Treatment | "showcase frame", "extended art", "full-art", "textless", "colorshifted". Gameplay frames (legendary, snow, enchantment, etc.) are ignored |
| 6 | Language | "English", "French", "Japanese", and so on |
| 7 | Stamp | "date stamp" (prerelease or datestamped), "promo stamp (art box)", "List stamp (lower left)", "serialized" |
| 8 | Holo stamp | "oval holo stamp", "triangle holo stamp", "acorn stamp", "heart stamp", "circle stamp", "no holo stamp" |
| 9 | Card back | "regular card back", or the set's back description from hand notes (for example the Collectors' Edition back), or "non-standard card back" |
| 10 | Set symbol | "{set name} set symbol", or "no set symbol" for sets marked symbol-less in hand notes |
| 11 | Collector number | "collector number {n}", only for sets that print collector numbers (cutoff verified from a source during the build). Never ★ or other Scryfall-only suffixes |

### Notes on the wording

- **Frames.** Players lump the 1993 and 1997 frames together as "old border," so both say "old border" with the frame year in parentheses. Wizards has called new printings in those frames "retro frame" since 2021. BinDiver uses "retro frame" for every 1993- or 1997-frame printing released after Scourge (May 26, 2003), the last set before Eighth Edition brought in the modern frame. That also covers the few pre-2021 reprints, such as Time Spiral Timeshifted (2006), Judge gift cards, and early printings on The List. Checked against the Nov 3 data: 1,000+ printings fall on the retro side, and none of them use the 1993 frame.
- **Stamps.** "Promo stamp (art box)" is the silver planeswalker symbol in the art box on promo-pack and other stamped promos (Scryfall `stamped`). "List stamp (lower left)" is the white planeswalker symbol at the bottom left of The List reprints. Scryfall has no field for it, so hand notes mark the sets: `plst`, plus `ulst` (the Unfinity foil List) if a source confirms it carries the stamp.
- **The List.** A List card prints its original set's symbol and number, not The List's. Its Scryfall collector number carries the original set code (for example `XLN-217`), so the set-symbol trait names that set. In the Nov 3 data, all 5,741 List numbers have a prefix that matches a set code. Collector numbers are never shown for List cards. If a future prefix doesn't match, the set-symbol trait is left out.
- **World Championship decks.** Scryfall adds player initials to their collector numbers (for example `kb315`), and those initials aren't printed on the card. Collector numbers are never shown for wc97–wc04.
- **Special foils.** Scryfall's `silverfoil` flag is on 369 Lord of the Rings scroll-showcase and borderless cards, which retailers list as "Silver Foil" ([Card Kingdom](https://cardkingdom.com/mtg/the-lord-of-the-rings-tales-of-middle-earth-variants/fall-of-gil-galad-0616-scroll-showcase-silver-foil-foil)). It is not Innistrad: Double Feature's silver screen foil, which Scryfall doesn't flag at all; hand notes name that one. Surge foils have their own flag (`surgefoil`) and keep "surge foil".

### Algorithm

For a target version, the look-alikes are every other version of the same Oracle card, across all finishes and prices.

1. Walk the traits in order. If the target's value differs from at least one remaining look-alike, add the trait's wording to the line and drop the look-alikes it rules out. Values are compared as the words they print. So two versions that read the same, such as two arts one artist drew in the same year, never rule each other out, and they fall through to later traits.
2. Stop when no look-alikes remain.
3. If look-alikes remain after all 11 traits, apply hand notes for each remaining (target set, look-alike set) pair. A pair note adds its line to `notes` and rules out that look-alike.
4. Anything still left goes in `same_as`. The display shows *"Looks the same as {set name} {number} ({price or 'unpriced'}): check a reference image."*

All of this runs once per database build. Even the largest groups, such as basic lands with 1,000+ versions, are fine to compare pairwise.

## 3. Value summary

This is computed at lookup time, because the price threshold belongs to the user.

**Groups.** Each version falls into a group by frame and finish (nonfoil, or foil and etched together). The frame buckets match the frame trait in section 2, so retro printings never share a group with old-border cards. In frame order, the bucket labels are "old-border 1993-frame", "old-border 1997-frame", "modern-frame", "Future Sight-frame", "M15-frame", and "retro-frame". Each group's label adds "nonfoils" or "foils".

In the rules below, *q* is the number of qualifying versions, *p* the number of priced versions, and *n* all versions, all for the card.

**Rules, in order:**
1. **No version qualifies:** "No version is $X+." If any are unpriced, add "{n − p} unpriced."
2. **q / p ≥ 75%:** "Almost every version is $X+ ({q} of {n}). Check any copy."
3. **Otherwise, where it is:** groups with q ≥ 1 and at least 40% of the group's versions qualifying, sorted by q (high first), then share. Use up to 2 groups. If no group reaches 40%, use the single group with the highest q. Example: "Value sits in old-border 1993-frame nonfoils (7 of 14) and old-border 1997-frame foils (3 of 3)."
4. **What to skip:** a *skip-eligible* group has zero qualifying versions and **every version priced**. A group containing an unpriced version is never a skip.
   - If both finishes of a frame are skip-eligible, they become one whole-frame item, "{frame} cards." Otherwise each eligible group is its own item.
   - Keep items with at least 3 versions, then take the 4 largest and list them in frame order. Whole-frame items come first and share the word "cards"; single-finish items follow. The count covers every listed item.
   - Example: "Skip old-border 1997-frame, modern-frame and M15-frame cards, and retro-frame foils (0 of 52)."
   - Every skipped frame is named. There is no "or later" wording, so a skip can't silently take in retro printings.
5. The summary is the rule 3 sentence followed by the rule 4 sentence, if there is one.

## 4. Hand notes

These live in a data file, `bindiver/mtg/hand_notes.json`, read by the database build.

```json
{
  "sets": {
    "ced":  {"symbol": false, "back": "Collectors' Edition back", "source": "https://…"},
    "5ed":  {"symbol": false, "except_langs": ["zhs"], "source": "https://…"},
    "dbl":  {"foil": "silver screen foil", "source": "https://…"},
    "plst": {"stamp": "List stamp (lower left)", "source": "https://…"}
  },
  "pairs": [
    {"sets": ["lea", "leb"],
     "notes": {"lea": "Alpha's corners are more rounded than Beta's.",
               "leb": "Beta's corners are less rounded than Alpha's."},
     "source": "https://…"}
  ]
}
```

**Set fields:**
- `symbol: false` means the set prints no set symbol. `except_langs` lists languages where it does.
- `back` is the card back description. It applies to every printing in the set, even where Scryfall lists the standard back (as it does for Collectors' Edition basic lands).
- `foil` is the name for the set's foil finish.
- `stamp` is the stamp the whole set carries.

**Rules for writing them:**
- Every note has a source link (MTG Wiki, Scryfall, or Wizards). No source, no note.
- **First pass:**
  - The early sets without a set symbol: Alpha, Beta, Unlimited, Revised, Summer Magic, both Collectors' Editions, Foreign Black Border, 4th Edition, 4th Edition Foreign Black Border, and Fifth Edition, plus any others the coverage check shows are needed.
  - Fifth Edition's Simplified Chinese printing does have a symbol, so `5ed` lists `zhs` in `except_langs`. The Nov 3 data holds 6 Simplified Chinese Fifth Edition cards.
  - The List stamp (`plst`, and `ulst` if confirmed), Innistrad: Double Feature's silver screen foil, the 30th Anniversary back, and World Championship gold borders.
- Matt corrects the notes during the 20-card test. His corrections win over the sources.

## 5. Display (CLI)

```
Counterspell: 21 of 106 versions worth finding at $25.00+
Value sits in old-border 1993-frame nonfoils (7 of 14) and old-border 1997-frame foils (3 of 3). Skip old-border 1997-frame nonfoils and retro-frame foils (0 of 20).

  $919.92  Limited Edition Beta  LEB #55  nonfoil
           Look for: art by Mark Poole, black border, old border (1993 frame), English, regular card back
           Beta's corners are less rounded than Alpha's.
  $155.00  Seventh Edition  7ED #67★  foil
           Look for: art by Mark Romanoski, black border
  …
  Unpriced (4):
           Limited Edition Alpha  LEA #54  nonfoil
           Look for: …
Prices: Scryfall market reference as of 2026-11-03, not adjusted for condition.
```

The summary's counts come from the Nov 3 data. Retro foils (0 of 3) are a skip; retro nonfoils aren't, because one of the two is unpriced.

Unpriced versions get look-for lines too. Old unpriced printings are where the guidance matters most.

**Set icons** appear next to the set name on the self-test page and, later, in the app. The icon is the `symbol_set`'s Scryfall icon. A set with no printed symbol shows "no set symbol" instead, because Scryfall draws an icon even for Alpha, and Alpha cards don't print one. Icons are downloaded once and kept locally (they're small SVGs), so the page and the app don't depend on Scryfall being reachable.

## 6. Testing

- **Unit tests** use a hand-built Counterspell family: Alpha, Beta, Unlimited, Revised, Collectors' Edition, Foreign Black Border French, the 7th Edition black-bordered foil vs. white-bordered nonfoil, a Mercadian Masques foil, and a Dominaria Remastered retro-frame printing. Every expected look-for line and note is written out by hand.
- **Wording tests:**
  - A 1997-frame printing released after Scourge says "retro frame".
  - A promo-pack card says "promo stamp (art box)".
  - A List card says "List stamp (lower left)" and names its original set's symbol.
  - A Lord of the Rings scroll-showcase foil says "silver foil", while its nonfoil says "nonfoil".
- **Summary tests,** one per rule:
  - no qualifying versions
  - almost every version
  - where it is
  - a single-finish skip
  - a whole-frame skip
  - retro printings kept out of the old-border groups
  - an unpriced group that must not become a skip
- **Guard tests:** no collector number for sets before the cutoff, and no ★.
- **Coverage check on real data:** across the bulk sample's alert names at $10, the share of qualifying versions with an empty `same_as`. Target **90% or more** before Matt's test, with the unresolved list printed so it can drive the next hand notes.
- **Matt's self-test:** a page with 20 cards, 10 classics from the Phase 1 list and 10 from the bulk sample's alerts. It shows each version's text next to a link to its Scryfall image, and Matt marks each card pass or fail. A pass means he could pick out every listed version from the text alone.
- **Terms to confirm in that test:**
  - "old border (1993 frame)" vs. "retro frame"
  - "serialized"
  - "ripple foil" and "silver foil"
  - whether lines like "black border, old border (1993 frame)" read clearly with "border" twice

## 7. Files

| File | Change |
| --- | --- |
| `bindiver/mtg/bulk_data.py` | Fetch Scryfall's set list daily; download set icons |
| `bindiver/mtg/build_db.py` | Store traits, the set list, and `symbol_set`; compute and store `look_for`, `notes`, `same_as`, `frame_group` |
| `bindiver/mtg/spot.py` (new) | Trait wording and the look-for algorithm (section 2) |
| `bindiver/mtg/summary.py` (new) | Value summary rules (section 3) |
| `bindiver/mtg/hand_notes.json` (new) | Hand notes (section 4) |
| `bindiver/mtg/hand_notes.py` (new) | Load and check the hand notes file |
| `bindiver/mtg/selftest.py` (new) | Matt's 20-card self-test page, with set icons |
| `bindiver/mtg/lookup.py` | Return the new fields on each `Version` |
| `bindiver/mtg/report.py` | Display (section 5); a coverage command for the check above |
| `tests/` | Fixture family and the tests above |
