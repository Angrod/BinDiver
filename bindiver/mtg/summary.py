"""One-line value summary for a card: where the versions worth finding are."""

from collections import defaultdict
from fractions import Fraction

from .money import dollars
from .spot import FRAME_ORDER

FRAME_LABELS = {
    "old-1993": "old-border 1993-frame",
    "old-1997": "old-border 1997-frame",
    "modern": "modern-frame",
    "future": "Future Sight-frame",
    "m15": "M15-frame",
    "retro": "retro-frame",
}
FINISH_ORDER = ("nonfoil", "foil")
FINISH_WORDS = {"nonfoil": "nonfoils", "foil": "foils"}
MAX_SKIP_ITEMS = 4
MIN_SKIP_VERSIONS = 3
WHERE_MIN_SHARE = Fraction(2, 5)
WHERE_MAX_GROUPS = 2
ALMOST_EVERY = Fraction(3, 4)


def _frame_sort_key(frame):
    if frame in FRAME_ORDER:
        return (FRAME_ORDER.index(frame), "")
    return (len(FRAME_ORDER), frame)


def _frame_label(frame):
    return FRAME_LABELS.get(frame, f"{frame}-frame")


def _join(items):
    if len(items) <= 2:
        return " and ".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


class _Group:
    def __init__(self, frame, finish):
        self.frame = frame
        self.finish = finish
        self.total = 0
        self.priced = 0
        self.qualifying = 0

    @property
    def share(self):
        return Fraction(self.qualifying, self.total)

    @property
    def order(self):
        return (_frame_sort_key(self.frame), FINISH_ORDER.index(self.finish))

    @property
    def skip_eligible(self):
        return self.qualifying == 0 and self.priced == self.total

    @property
    def label(self):
        return f"{_frame_label(self.frame)} {FINISH_WORDS[self.finish]}"


def _groups(versions, min_cents):
    groups = {}
    for v in versions:
        frame = v.frame_group or "unknown"
        finish = "nonfoil" if v.finish == "nonfoil" else "foil"
        g = groups.setdefault((frame, finish), _Group(frame, finish))
        g.total += 1
        if v.price_cents is not None:
            g.priced += 1
            if v.price_cents >= min_cents:
                g.qualifying += 1
    return list(groups.values())


def _where(groups):
    ranked = sorted((g for g in groups if g.qualifying >= 1),
                    key=lambda g: (-g.qualifying, -g.share, g.order))
    chosen = [g for g in ranked if g.share >= WHERE_MIN_SHARE][:WHERE_MAX_GROUPS] or ranked[:1]
    return "Value sits in " + _join([f"{g.label} ({g.qualifying} of {g.total})" for g in chosen]) + "."


def _skip(groups):
    by_frame = defaultdict(list)
    for g in groups:
        by_frame[g.frame].append(g)
    items = []  # (size, order, is_whole, label)
    for frame, members in by_frame.items():
        if all(g.skip_eligible for g in members):
            items.append((sum(g.total for g in members), (_frame_sort_key(frame), -1), True,
                          _frame_label(frame)))
        else:
            items.extend((g.total, g.order, False, g.label) for g in members if g.skip_eligible)
    items = [i for i in items if i[0] >= MIN_SKIP_VERSIONS]
    kept = sorted(items, key=lambda i: (-i[0], i[1]))[:MAX_SKIP_ITEMS]
    if not kept:
        return ""
    kept.sort(key=lambda i: i[1])
    whole = [i[3] for i in kept if i[2]]
    singles = [i[3] for i in kept if not i[2]]
    count = f"(0 of {sum(i[0] for i in kept)})"
    if whole and singles:
        return f"Skip {_join(whole)} cards, and {_join(singles)} {count}."
    if whole:
        return f"Skip {_join(whole)} cards {count}."
    return f"Skip {_join(singles)} {count}."


def summarize(versions, min_cents):
    versions = list(versions)
    groups = _groups(versions, min_cents)
    n = len(versions)
    p = sum(g.priced for g in groups)
    q = sum(g.qualifying for g in groups)
    threshold = dollars(min_cents)
    if q == 0:
        text = f"No version is {threshold}+."
        return f"{text} {n - p} unpriced." if n > p else text
    if Fraction(q, p) >= ALMOST_EVERY:
        return f"Almost every version is {threshold}+ ({q} of {n}). Check any copy."
    return " ".join(s for s in (_where(groups), _skip(groups)) if s)
