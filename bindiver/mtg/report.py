"""Plain-text output for lookups, and the bulk alert-rate report."""

from dataclasses import dataclass
from decimal import Decimal

from .lookup import Version
from .money import dollars


def _cents(min_price):
    return int((Decimal(str(min_price)) * 100).to_integral_value())


def _label(version):
    return f"{version.set_code.upper()} #{version.collector_number}"


def _detail_lines(version, group):
    """Look-for line, hand notes and look-alike lines for one version (unindented)."""
    lines = []
    if not (version.look_for or version.notes or version.same_as):
        lines.append("Look for: any copy (only version)")
    elif version.look_for:
        lines.append(f"Look for: {version.look_for}")
    lines.extend(version.notes)
    for key in version.same_as:
        other = group.versions_by_key[key]
        price = dollars(other.price_cents) if other.price_cents is not None else "unpriced"
        lines.append(f"Looks the same as {other.set_name} {_label(other)} ({price}): check a reference image.")
    return lines


def format_result(result, min_price):
    if result.match == "none":
        return f'No card found for "{result.query}". Try another spelling.'
    if result.match == "token":
        return f'"{result.query}" is a token or emblem. BinDiver only tracks cards.'

    lines = []
    if result.match == "fuzzy":
        names = " / ".join(dict.fromkeys(g.name for g in result.groups))
        lines.append(f'Closest match for "{result.query}": {names}')

    threshold = dollars(_cents(min_price))
    for group in result.groups:
        lines.append(
            f"{group.name}: {len(group.qualifying)} of {group.total_versions} "
            f"versions worth finding at {threshold}+"
        )
        lines.append(group.summary)
        if group.qualifying or group.unpriced:
            lines.append("")
        price_w = max((len(dollars(v.price_cents)) for v in group.qualifying), default=0)
        pad = " " * (2 + price_w + 2)
        for v in group.qualifying:
            lines.append(f"  {dollars(v.price_cents):>{price_w}}  {v.set_name}  {_label(v)}  {v.finish}")
            lines.extend(pad + line for line in _detail_lines(v, group))
        if group.unpriced:
            lines.append(f"  Unpriced ({len(group.unpriced)}):")
            for v in group.unpriced:
                lines.append(f"{pad}{v.set_name}  {_label(v)}  {v.finish}")
                lines.extend(pad + line for line in _detail_lines(v, group))

    lines.append(
        f"Prices: Scryfall market reference as of {result.price_date}, not adjusted for condition."
    )
    return "\n".join(lines)


@dataclass(frozen=True)
class BulkReport:
    checked: int  # distinct names that matched a card exactly
    alert_names: list[str]
    tokens: list[str]
    corrected: list[tuple[str, str]]  # (name given, card it was corrected to); not counted
    unmatched: list[str]


def bulk_report(catalog, names, min_price):
    """How many distinct card names in a stack have at least one version worth finding.

    The names come from an export, so they should match exactly. A name that only
    matches after spelling correction is listed for review, never counted as an alert.
    """
    checked, alerts, tokens, corrected, unmatched = 0, [], [], [], []
    for name in dict.fromkeys(names):
        result = catalog.lookup(name, min_price)
        if result.match == "exact":
            checked += 1
            if any(group.qualifying for group in result.groups):
                alerts.append(name)
        elif result.match == "token":
            tokens.append(name)
        elif result.match == "fuzzy":
            corrected.append((name, " / ".join(dict.fromkeys(g.name for g in result.groups))))
        else:
            unmatched.append(name)
    return BulkReport(
        checked=checked,
        alert_names=sorted(alerts),
        tokens=sorted(tokens),
        corrected=sorted(corrected),
        unmatched=sorted(unmatched),
    )


@dataclass(frozen=True)
class Coverage:
    qualifying: int  # qualifying versions across exactly matched names
    told_apart: int  # of those, versions with no look-alikes left
    unresolved: list[tuple[str, Version, list[Version]]]  # (card, version, its look-alikes)


def coverage_report(catalog, names, min_price):
    """How many qualifying versions the look-for lines fully tell apart from their look-alikes."""
    qualifying, told_apart, unresolved = 0, 0, []
    for name in dict.fromkeys(names):
        result = catalog.lookup(name, min_price)
        if result.match != "exact":
            continue
        for group in result.groups:
            for v in group.qualifying:
                qualifying += 1
                if v.same_as:
                    unresolved.append((group.name, v, [group.versions_by_key[k] for k in v.same_as]))
                else:
                    told_apart += 1
    return Coverage(qualifying=qualifying, told_apart=told_apart, unresolved=unresolved)
