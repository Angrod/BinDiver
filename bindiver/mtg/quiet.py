"""Which alerts are quiet: every qualifying version is an old-border, Secret Lair or serialized one."""

from collections.abc import Iterable, Sequence

from .lookup import CardGroup

QUIET_KINDS = ("old border", "Secret Lair", "serialized")


def quiet_kind(frame_group: str, set_name: str, promo_types: Iterable[str]) -> str:
    """The quiet kind of one version, or '' for an ordinary version. Checked in QUIET_KINDS order."""
    if frame_group in ("old-1993", "old-1997"):
        return "old border"
    if set_name.startswith("Secret Lair"):
        return "Secret Lair"
    if "serialized" in promo_types:
        return "serialized"
    return ""


def _kinds(groups: Sequence[CardGroup]) -> list[str]:
    return [v.quiet_kind for g in groups for v in g.qualifying]


def alert_strength(groups: Sequence[CardGroup]) -> str:
    """'none' with no qualifying version, 'quiet' when all of them are quiet kinds, else 'full'."""
    kinds = _kinds(groups)
    if not kinds:
        return "none"
    return "full" if "" in kinds else "quiet"


def quiet_kinds_of(groups: Sequence[CardGroup]) -> list[str]:
    """The quiet kinds present, in QUIET_KINDS order, when the alert is quiet; otherwise []."""
    if alert_strength(groups) != "quiet":
        return []
    present = set(_kinds(groups))
    return [k for k in QUIET_KINDS if k in present]
