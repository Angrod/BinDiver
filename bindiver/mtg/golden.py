"""Golden fixtures: a small database plus Python's expected outputs, so the phone port can prove it matches."""

import json
import sqlite3
from pathlib import Path

from bindiver.mtg.lookup import SORT_ORDERS, Catalog
from bindiver.mtg.normalize import normalize_name
from bindiver.mtg.phone_db import PHONE_FORMAT, write_phone_tables
from bindiver.mtg.quiet import alert_strength, quiet_kinds_of

GOLDEN_NAMES = (
    "Fireball", "Counterspell", "Birds of Paradise", "Lightning Bolt", "Sol Ring", "Llanowar Elves",
    "Dark Ritual", "Swords to Plowshares", "Brainstorm", "Fire // Ice",
    "Island", "Bloodfell Caves", "Delver of Secrets", "Insectile Aberration", "Brazen Borrower",
    "Petty Theft", "Lim-Dûl's Vault", "Æther Vial", "_____ Goblin", "Who // What // When // Where // Why",
    "Jace, the Mind Sculptor", 'Kongming, "Sleeping Dragon"', "B.F.M. (Big Furry Monster)", "Saproling",
    "Shu Jing Meteorite",
    "Crypt of Agadeem", "Rideable Mantis", "Hungry Lynx", "Parasitic Grasp", "Fealty to the Realm",
    "Seymour Flux", "Drooling Groodion", "Sharding Sphinx", "Elusen, the Giving", "Cranial Plating",
    "Thermo-Alchemist", "Quicksilver Dagger", "Echoing Truth", "Cathar Commando", "Chaos Wand",
    "Brotherhood's End", "Ihsan's Shade", "Stable Wormhole", "Temporal Extortion", "Blue Dragon",
    "Serra Angel", "Shivan Dragon", "Juzám Djinn", "Urza's Tower", "Sensei's Divining Top",
    "Explore", "Bone Saw", "Opt", "Burnished Hart",
)
GOLDEN_PRICES = (2, 10, 50)
NORMALIZE_EXTRAS = ("", "  Lightning   Bolt  ", "FIREBALL", "Fire//Ice", "fire  //  ice", "Urza’s Tower",
                    "`Backtick`", "Œuvre", "Dandân", "Séance", "Ifh-Bíff Efreet", "Ach! Hans, Run!",
                    "+2 Mace", "Borrowing 100,000 Arrows", "Mox Pearl (Alpha)")


def golden_cases(catalog, names=GOLDEN_NAMES):
    """One case per name x price x order, holding what Python's lookup returns."""
    cases = []
    for query in names:
        for price in GOLDEN_PRICES:
            for order in SORT_ORDERS:
                result = catalog.lookup(query, price, order)
                if result.match == "fuzzy":
                    raise ValueError(f"{query} matched fuzzily")
                cases.append({
                    "query": query,
                    "min_cents": price * 100,
                    "order": order,
                    "match": result.match,
                    "alert": alert_strength(result.groups),
                    "quiet_kinds": quiet_kinds_of(result.groups),
                    "groups": [{
                        "oracle_id": g.oracle_id,
                        "name": g.name,
                        "total_versions": g.total_versions,
                        "summary": g.summary,
                        "qualifying": [v.key for v in g.qualifying],
                        "unpriced": [v.key for v in g.unpriced],
                    } for g in result.groups],
                })
    return cases


def _dump(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def write_golden(src_db, out_dir, icons, names=GOLDEN_NAMES):
    """Write golden.sqlite, golden.json, normalize.json and names.json into out_dir."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    catalog = Catalog(src_db)
    cases = golden_cases(catalog, names)
    oracle_ids = sorted({g["oracle_id"] for c in cases for g in c["groups"]})
    write_phone_tables(src_db, out_dir / "golden.sqlite", icons, oracle_ids=oracle_ids,
                       extra_norms={normalize_name(n) for n in names})
    _dump(out_dir / "golden.json",
          {"price_date": catalog.price_date, "phone_format": PHONE_FORMAT, "cases": cases})
    with sqlite3.connect(src_db) as con:
        printing_names = [r[0] for r in con.execute("SELECT DISTINCT name FROM printings ORDER BY name")]
        name_rows = [list(r) for r in con.execute("SELECT DISTINCT norm, kind FROM names ORDER BY norm, kind")]
    raws = sorted(printing_names) + list(NORMALIZE_EXTRAS)
    _dump(out_dir / "normalize.json", {"cases": [[raw, normalize_name(raw)] for raw in raws]})
    _dump(out_dir / "names.json", name_rows)
