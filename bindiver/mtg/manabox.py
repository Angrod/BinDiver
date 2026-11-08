"""Read card names from a ManaBox CSV export."""

import csv


def read_manabox_names(path):
    """One entry per physical card: each row's name repeated by its Quantity."""
    names = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            names.extend([row["Name"]] * int(row.get("Quantity") or 1))
    return names
