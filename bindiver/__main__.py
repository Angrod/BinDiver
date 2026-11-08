"""BinDiver command line.

    python -m bindiver update                  # fetch Scryfall data (max once a day) and rebuild
    python -m bindiver lookup "Fireball" --min 10 --sort price   # oldest (default), newest or price
    python -m bindiver report scan.csv --min 5 --min 10 --min 20
    python -m bindiver coverage scan.csv --min 10
    python -m bindiver selftest scan.csv --min 10 --out data/selftest.html
"""

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

from bindiver.mtg.build_db import build_db, iter_bulk
from bindiver.mtg.bulk_data import BULK_FILE, fetch_set_icons, read_local_meta, update, update_sets
from bindiver.mtg.hand_notes import HAND_NOTES_FILE
from bindiver.mtg.lookup import SORT_ORDERS, Catalog
from bindiver.mtg.manabox import read_manabox_names
from bindiver.mtg.report import bulk_report, coverage_report, format_result
from bindiver.mtg.selftest import pick_names, render_html

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DB_FILE = DATA_DIR / "cards.sqlite"


def cmd_update(args):
    meta = update(DATA_DIR)
    sets = update_sets(DATA_DIR)
    price_date = datetime.fromisoformat(meta["updated_at"]).date().isoformat()
    if needs_rebuild(args.force_build, DB_FILE.exists(), _db_price_date(), price_date,
                     _mtime(DB_FILE), _mtime(HAND_NOTES_FILE)):
        start = time.perf_counter()
        build_db(iter_bulk(DATA_DIR / BULK_FILE), DB_FILE, price_date=price_date, sets=sets)
        print(f"Built {DB_FILE.name} in {time.perf_counter() - start:.1f}s")
    size_mb = DB_FILE.stat().st_size / 1e6
    print(f"Prices as of {price_date}. Database: {size_mb:.1f} MB")


def needs_rebuild(force, db_exists, db_price_date, price_date, db_mtime, notes_mtime):
    """Rebuild when forced, missing, priced on another date, or the hand notes were edited since."""
    return (force or not db_exists or db_price_date != price_date
            or (db_mtime is not None and notes_mtime is not None and notes_mtime > db_mtime))


def _mtime(path):
    try:
        return path.stat().st_mtime
    except OSError:
        return None


def _db_price_date():
    try:
        return Catalog(DB_FILE).price_date
    except Exception:
        return None


def _catalog():
    if not DB_FILE.exists():
        sys.exit("No card database yet. Run: python -m bindiver update")
    return Catalog(DB_FILE)


def cmd_lookup(args):
    catalog = _catalog()
    for name in args.names:
        start = time.perf_counter()
        result = catalog.lookup(name, args.min, order=args.sort)
        elapsed_ms = (time.perf_counter() - start) * 1000
        print(format_result(result, args.min))
        if args.timing:
            print(f"({elapsed_ms:.0f} ms)")
        print()


def cmd_report(args):
    catalog = _catalog()
    names = read_manabox_names(args.csv)
    print(f"{len(names)} cards, {len(set(names))} unique names, prices as of {catalog.price_date}\n")
    for min_price in args.min or [10]:
        report = bulk_report(catalog, names, min_price)
        rate = len(report.alert_names) / report.checked if report.checked else 0
        print(f"At ${min_price:,.2f}+: {len(report.alert_names)} of {report.checked} card names alert ({rate:.0%})")
        if args.list:
            for name in report.alert_names:
                print(f"    {name}")
    if report.tokens:
        print(f"\nTokens and emblems, not tracked ({len(report.tokens)}): {', '.join(report.tokens)}")
    if report.corrected:
        pairs = ", ".join(f"{given} -> {card}" for given, card in report.corrected)
        print(f"Only matched after spelling correction, not counted ({len(report.corrected)}): {pairs}")
    if report.unmatched:
        print(f"Not found ({len(report.unmatched)}): {', '.join(report.unmatched)}")


def cmd_coverage(args):
    catalog = _catalog()
    names = read_manabox_names(args.csv)
    cov = coverage_report(catalog, names, args.min)
    pct = cov.told_apart / cov.qualifying if cov.qualifying else 0
    print(
        f"At ${args.min:,.2f}+: {cov.told_apart:,} of {cov.qualifying:,} "
        f"qualifying versions told apart ({pct:.0%})"
    )
    print(f"Still look the same ({len(cov.unresolved)}):")
    for card, version, others in cov.unresolved:
        alikes = ", ".join(f"{o.set_code.upper()} #{o.collector_number} {o.finish}" for o in others)
        print(f"  {card}: {version.set_code.upper()} #{version.collector_number} {version.finish} ~ {alikes}")


def cmd_selftest(args):
    catalog = _catalog()
    names = read_manabox_names(args.csv)
    report = bulk_report(catalog, names, args.min)
    listed_counts = {}
    for name in report.alert_names:
        group = catalog.lookup(name, args.min).groups[0]
        listed_counts[name] = len(group.qualifying) + len(group.unpriced)
    picked = pick_names(report.alert_names, listed_counts)
    icon_uris = {}
    for name in picked:
        result = catalog.lookup(name, args.min)
        for group in result.groups if result.match == "exact" else []:
            for v in group.qualifying + group.unpriced:
                if v.symbol_icon and v.symbol_set:
                    icon_uris[v.symbol_set] = v.symbol_icon
    icons = fetch_set_icons(icon_uris, DATA_DIR)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_html(catalog, picked, args.min, icons), encoding="utf-8")
    print(f"Wrote {out} ({out.stat().st_size / 1e3:.0f} KB): {len(picked)} cards, {len(icons)} set icons")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="bindiver", description="Which versions of this card are worth finding?")
    sub = parser.add_subparsers(required=True)

    p = sub.add_parser("update", help="download Scryfall data (at most daily) and rebuild the database")
    p.add_argument("--force-build", action="store_true", help="rebuild even if prices haven't changed")
    p.set_defaults(func=cmd_update)

    p = sub.add_parser("lookup", help="list versions of a card at or above a price")
    p.add_argument("names", nargs="+")
    p.add_argument("--min", type=float, default=10.0, help="price threshold in USD (default 10)")
    p.add_argument("--sort", choices=SORT_ORDERS, default="oldest",
                   help="list versions oldest first (default), newest first, or by price")
    p.add_argument("--timing", action="store_true", help="print how long each lookup took")
    p.set_defaults(func=cmd_lookup)

    p = sub.add_parser("report", help="alert rate for a ManaBox CSV export")
    p.add_argument("csv")
    p.add_argument("--min", type=float, action="append", help="threshold in USD; repeat to compare")
    p.add_argument("--list", action="store_true", help="list the names that alert")
    p.set_defaults(func=cmd_report)

    p = sub.add_parser("coverage", help="how many qualifying versions in a ManaBox CSV are fully told apart")
    p.add_argument("csv")
    p.add_argument("--min", type=float, default=10.0, help="price threshold in USD (default 10)")
    p.set_defaults(func=cmd_coverage)

    p = sub.add_parser("selftest", help="write the 20-card self-test page")
    p.add_argument("csv")
    p.add_argument("--min", type=float, default=10.0, help="price threshold in USD (default 10)")
    p.add_argument("--out", default=str(DATA_DIR / "selftest.html"))
    p.set_defaults(func=cmd_selftest)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
