# BinDiver

Most Magic: The Gathering scanners tell you what the card in your hand is worth. BinDiver answers a different question: **which versions of this card are worth finding?** Scan or type a card name and it lists the printings and finishes at or above your price, with a short "look for" line for each. That line says how to tell the version apart from the others: border, frame, finish, stamps, set symbol and so on. It's built for digging through bulk bins.

## Status

- **Phase 1, the lookup:** done. A local card database built from Scryfall's bulk data, plus name matching.
- **Phase 2, the teaching:** done. Look-for text for each version, and a one-line summary of where the value sits.
- **Phase 3, the scan:** in progress. A phone app that reads card titles with the camera, offline. See `docs/superpowers/specs/2026-11-06-phase3-scan-app-design.md`.

## Using the command line

Needs Python 3.12 or later.

```
python -m bindiver update                                    # fetch Scryfall data (at most once a day) and rebuild
python -m bindiver lookup "Fireball" --min 10 --sort price   # sort: oldest (default), newest or price
python -m bindiver report scan.csv --min 5 --min 10 --min 20
python -m bindiver coverage scan.csv --min 10
python -m bindiver selftest scan.csv --min 10 --out data/selftest.html
```

Prices are Scryfall's market references for their date. They aren't adjusted for condition.

## Credits

Card data and prices from [Scryfall](https://scryfall.com). BinDiver is not produced by or endorsed by Scryfall.

BinDiver is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
