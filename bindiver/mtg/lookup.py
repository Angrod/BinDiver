"""Name in, versions worth finding out.

A lookup resolves a typed or scanned name to one or more Oracle cards, then
lists every paper printing and finish at or above the chosen price. Versions
with no price are returned separately so they are never silently dropped.
"""

import difflib
import json
import re
import sqlite3
from collections import Counter
from dataclasses import dataclass, field
from decimal import Decimal

from .normalize import normalize_name
from .summary import summarize

FUZZY_CUTOFF = 0.8
SORT_ORDERS = ("oldest", "newest", "price")
_FINISH_RANK = {"nonfoil": 0, "foil": 1, "etched": 2}


@dataclass(frozen=True)
class Version:
    scryfall_id: str
    set_code: str
    set_name: str
    collector_number: str
    released_at: str
    lang: str
    finish: str
    price_cents: int | None
    frame_group: str = ""
    look_for: str = ""
    notes: tuple[str, ...] = ()
    same_as: tuple[str, ...] = ()
    symbol_set: str | None = None
    symbol_icon: str | None = None
    quiet_kind: str = ""

    @property
    def key(self) -> str:
        return f"{self.scryfall_id}:{self.finish}"


@dataclass(frozen=True)
class CardGroup:
    oracle_id: str
    name: str
    qualifying: list[Version]
    unpriced: list[Version]
    total_versions: int
    versions_by_key: dict[str, Version] = field(default_factory=dict)
    summary: str = ""


@dataclass(frozen=True)
class LookupResult:
    query: str
    match: str  # "exact", "fuzzy", "token" or "none"
    groups: list[CardGroup]
    price_date: str


def _number_key(collector_number):
    """Natural order for collector numbers: 9 before 10, and 67 before 67★."""
    digits = re.match(r"\d+", collector_number)
    return (int(digits.group()) if digits else float("inf"), collector_number)


def sort_versions(versions, order="oldest"):
    """Versions oldest first, newest first, or by price (highest first, unpriced last).

    Versions released the same day go by set, collector number, then nonfoil, foil, etched,
    in every order.
    """
    if order not in SORT_ORDERS:
        raise ValueError(f"order must be one of {SORT_ORDERS}, not {order!r}")
    ordered = sorted(versions, key=lambda v: (
        v.released_at, v.set_code, _number_key(v.collector_number),
        _FINISH_RANK.get(v.finish, len(_FINISH_RANK)), v.finish))
    # Python's sort is stable, so these re-sorts keep the tie order above.
    if order == "newest":
        ordered.sort(key=lambda v: v.released_at, reverse=True)
    elif order == "price":
        ordered.sort(key=lambda v: (v.price_cents is None, -(v.price_cents or 0)))
    return ordered


def _card_name(printing_names):
    """The name most printings use; reversible printings ("Sol Ring // Sol Ring") are the minority."""
    counts = Counter(printing_names)
    return min(counts, key=lambda name: (-counts[name], len(name), name))


class Catalog:
    def __init__(self, db_path):
        self._conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        self._full: dict[str, set[str]] = {}
        self._face: dict[str, set[str]] = {}
        self._tokens: set[str] = set()
        for norm, oracle_id, kind in self._conn.execute("SELECT norm, oracle_id, kind FROM names"):
            if kind == "token":
                self._tokens.add(norm)
            else:
                index = self._full if kind == "full" else self._face
                index.setdefault(norm, set()).add(oracle_id)
        self._all_names = sorted(self._full.keys() | self._face.keys() | self._tokens)
        (self.price_date,) = self._conn.execute(
            "SELECT value FROM meta WHERE key = 'price_date'"
        ).fetchone()

    def lookup(self, query: str, min_price, order: str = "oldest") -> LookupResult:
        """Versions at or above min_price, listed in `order` (one of SORT_ORDERS)."""
        if order not in SORT_ORDERS:
            raise ValueError(f"order must be one of {SORT_ORDERS}, not {order!r}")
        min_cents = int((Decimal(str(min_price)) * 100).to_integral_value())
        match, oracle_ids = self._resolve(normalize_name(query))
        groups = [self._group(oracle_id, min_cents, order) for oracle_id in sorted(oracle_ids)]
        return LookupResult(query=query, match=match, groups=groups, price_date=self.price_date)

    def _ids_for(self, norm):
        # A full card name wins over a face of some other card with the same text.
        return self._full.get(norm) or self._face.get(norm) or set()

    def _resolve(self, norm):
        if ids := self._ids_for(norm):
            return "exact", ids
        if norm in self._tokens:
            return "token", set()
        close = difflib.get_close_matches(norm, self._all_names, n=1, cutoff=FUZZY_CUTOFF)
        if close:
            if ids := self._ids_for(close[0]):
                return "fuzzy", ids
            return "token", set()
        return "none", set()

    def _group(self, oracle_id, min_cents, order):
        rows = self._conn.execute(
            """
            SELECT p.id, p.name, p.set_code, p.set_name, p.collector_number,
                   p.released_at, p.lang, v.finish, v.price_cents,
                   v.frame_group, v.look_for, v.notes, v.same_as, p.symbol_set,
                   CASE WHEN p.symbol_set = 'none' THEN NULL ELSE s.icon_svg_uri END,
                   v.quiet_kind
            FROM printings p JOIN versions v ON v.printing_id = p.id
                 LEFT JOIN sets s ON s.code = p.symbol_set
            WHERE p.oracle_id = ?
            """,
            (oracle_id,),
        ).fetchall()
        name = _card_name(r[1] for r in rows)
        versions = [
            Version(
                scryfall_id=r[0], set_code=r[2], set_name=r[3], collector_number=r[4],
                released_at=r[5], lang=r[6], finish=r[7], price_cents=r[8],
                frame_group=r[9], look_for=r[10], notes=tuple(r[11].split("\n")) if r[11] else (),
                same_as=tuple(json.loads(r[12])), symbol_set=r[13], symbol_icon=r[14], quiet_kind=r[15],
            )
            for r in rows
        ]
        qualifying = sort_versions(
            (v for v in versions if v.price_cents is not None and v.price_cents >= min_cents), order)
        unpriced = sort_versions((v for v in versions if v.price_cents is None), order)
        return CardGroup(
            oracle_id=oracle_id,
            name=name,
            qualifying=qualifying,
            unpriced=unpriced,
            total_versions=len(versions),
            versions_by_key={v.key: v for v in versions},
            summary=summarize(versions, min_cents),
        )
