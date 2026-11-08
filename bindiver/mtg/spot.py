"""Spot-it text: how to recognize a valuable printing by what is visible on the card."""

import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from bindiver.mtg.hand_notes import HandNotes

STANDARD_BACK = "0aeebaf5-8c7d-4636-9e82-8c27447861f7"
SCOURGE_RELEASE = "2003-05-26"
FRAME_ORDER = ("old-1993", "old-1997", "modern", "future", "m15", "retro")
COLLECTOR_NUMBERS_FROM = "1998-06-15"  # Exodus; Task 8 confirms it against a source
LIST_SETS = frozenset({"plst", "ulst"})
_WORLDS = re.compile(r"^wc\d\d$")
_LIST_NUMBER = re.compile(r"^([A-Za-z0-9]+)-(.+)$")


def printing_traits(card):
    """The visible traits of one Scryfall printing, with missing values as None, [] or False."""
    front = (card.get("card_faces") or [{}])[0]
    frame_effects = list(card.get("frame_effects") or [])
    return {
        "artist": card.get("artist") or front.get("artist"),
        "illustration_id": card.get("illustration_id") or front.get("illustration_id"),
        "border_color": card.get("border_color"),
        "frame": card.get("frame"),
        "frame_effects": frame_effects,
        "full_art": bool(card.get("full_art")) or "fullart" in frame_effects,
        "textless": bool(card.get("textless")),
        "promo_types": list(card.get("promo_types") or []),
        "security_stamp": card.get("security_stamp"),
        "card_back_id": card.get("card_back_id") or front.get("card_back_id"),
    }


@dataclass(frozen=True)
class SpotVersion:
    printing_id: str
    finish: str
    set_code: str
    set_name: str
    collector_number: str
    released_at: str
    lang: str
    artist: str | None
    illustration_id: str | None
    border_color: str | None
    frame: str | None
    frame_effects: tuple[str, ...]
    full_art: bool
    textless: bool
    promo_types: tuple[str, ...]
    security_stamp: str | None
    card_back_id: str | None

    @property
    def key(self) -> str:
        return f"{self.printing_id}:{self.finish}"

    @classmethod
    def from_card(cls, card: dict, finish: str) -> "SpotVersion":
        traits = printing_traits(card)
        traits["frame_effects"] = tuple(traits["frame_effects"])
        traits["promo_types"] = tuple(traits["promo_types"])
        return cls(
            printing_id=card["id"], finish=finish, set_code=card["set"], set_name=card["set_name"],
            collector_number=card["collector_number"], released_at=card["released_at"],
            lang=card["lang"], **traits,
        )


@dataclass(frozen=True)
class Spot:
    look_for: str              # "" when nothing needs saying
    notes: tuple[str, ...]
    same_as: tuple[str, ...]   # version keys
    frame_group: str           # frame_bucket(...)
    symbol_set: str | None     # printed symbol's set code, "none" for symbol-less, None if unknown


def frame_bucket(frame: str | None, released_at: str) -> str:
    if frame is None:
        return "unknown"
    if frame in ("1993", "1997"):
        return f"old-{frame}" if released_at <= SCOURGE_RELEASE else "retro"
    return {"2003": "modern", "2015": "m15", "future": "future"}.get(frame, frame)


class _Skip:
    def __repr__(self):
        return "SKIP"


SKIP = _Skip()  # a trait value meaning "can't be said for this version"


@dataclass(frozen=True)
class Context:
    """Per-card facts the traits need."""
    notes: HandNotes
    set_names: Mapping[str, str]
    versions: Sequence[SpotVersion]
    multi_art_artists: frozenset[str] = frozenset()               # artists with 2+ art values here
    art_years: Mapping[str, str] = field(default_factory=dict)    # art value -> earliest release year


def _art_value(v: SpotVersion) -> str:
    return v.illustration_id or "artist:" + (v.artist or "")


def art_facts(versions: Sequence[SpotVersion]) -> tuple[frozenset[str], dict[str, str]]:
    arts_by_artist: dict[str, set[str]] = {}
    years: dict[str, str] = {}
    for v in versions:
        art = _art_value(v)
        if v.artist:
            arts_by_artist.setdefault(v.artist, set()).add(art)
        year = v.released_at[:4]
        if art not in years or year < years[art]:
            years[art] = year
    multi = frozenset(a for a, arts in arts_by_artist.items() if len(arts) >= 2)
    return multi, years


@dataclass(frozen=True)
class Trait:
    value: Callable[[SpotVersion, Context], Any]
    words: Callable[[SpotVersion, Sequence[SpotVersion], Context], str]


def printed_number(collector_number: str) -> str:
    """The collector number as printed on the card: no ★ or other Scryfall-only marks."""
    kept = "".join(ch for ch in collector_number if ch.isalnum())
    if kept[-1:] in ("s", "p") and kept[:-1].isdigit():
        kept = kept[:-1]
    return kept


def _list_prefix(target: SpotVersion, ctx: Context) -> str | None:
    match = _LIST_NUMBER.match(target.collector_number)
    if match and match.group(1).lower() in ctx.set_names:
        return match.group(1).lower()
    return None


def symbol_set(target: SpotVersion, ctx: Context) -> str | None:
    if target.set_code in LIST_SETS:
        return _list_prefix(target, ctx)
    note = ctx.notes.set_note(target.set_code)
    if not note.symbol and target.lang not in note.except_langs:
        return "none"
    return target.set_code


_BORDER_WORDS = {
    "black": "black border", "white": "white border", "borderless": "borderless",
    "gold": "gold border", "silver": "silver border", "yellow": "yellow border",
}
_FRAME_WORDS = {
    "old-1993": "old border (1993 frame)", "old-1997": "old border (1997 frame)",
    "retro": "retro frame", "modern": "modern frame", "m15": "M15 frame",
    "future": "Future Sight frame",
}
_NAMED_FOILS = (
    ("surgefoil", "surge foil"), ("galaxyfoil", "galaxy foil"), ("ripplefoil", "ripple foil"),
    ("silverfoil", "silver foil"), ("doublerainbow", "double rainbow foil"),
    ("textured", "textured foil"), ("confettifoil", "confetti foil"), ("raisedfoil", "raised foil"),
)
_FINISH_WORDS = {"nonfoil": "nonfoil", "foil": "foil", "etched": "etched foil"}
_LANGUAGES = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German", "it": "Italian",
    "pt": "Portuguese", "ja": "Japanese", "ko": "Korean", "ru": "Russian",
    "zhs": "Simplified Chinese", "zht": "Traditional Chinese", "he": "Hebrew", "la": "Latin",
    "grc": "Ancient Greek", "ar": "Arabic", "sa": "Sanskrit", "ph": "Phyrexian", "qya": "Quenya",
}


def _art_words(v, ruled, ctx):
    words = f"art by {v.artist or 'unknown artist'}"
    if v.artist in ctx.multi_art_artists:
        words += f" ({ctx.art_years[_art_value(v)]} art)"
    return words


def _border_words(v, ruled, ctx):
    if v.border_color is None:
        return "unknown border"
    return _BORDER_WORDS.get(v.border_color, f"{v.border_color} border")


def _finish_words(v, ruled, ctx):
    if v.finish == "foil":
        for flag, name in _NAMED_FOILS:
            if flag in v.promo_types:
                return name
        return ctx.notes.set_note(v.set_code).foil or "foil"
    return _FINISH_WORDS.get(v.finish, v.finish)


def _frame_words(v, ruled, ctx):
    bucket = frame_bucket(v.frame, v.released_at)
    return _FRAME_WORDS.get(bucket, f"{bucket} frame")


@dataclass(frozen=True)
class _Item:
    """One present-or-absent feature: how to test it and how to word each side."""
    has: Callable[[SpotVersion, Context], bool]
    present: Callable[[SpotVersion, Context], str]
    absent: Callable[[SpotVersion, Context], str]  # worded from a ruled-out version that has it


def _present_absent_value(items, v, ctx):
    return frozenset(i.present(v, ctx) for i in items if i.has(v, ctx))


def _present_absent_words(items, v, ruled, ctx):
    mine = [i.present(v, ctx) for i in items if i.has(v, ctx)]
    missing = []
    for item in items:
        if item.has(v, ctx):
            continue
        for other in ruled:
            if item.has(other, ctx):
                phrase = item.absent(other, ctx)
                if phrase not in missing:
                    missing.append(phrase)
    return ", ".join(mine + missing)


def _effect_item(effect, present, absent):
    return _Item(lambda v, ctx: effect in v.frame_effects, lambda v, ctx: present, lambda v, ctx: absent)


def _flag_item(attr, present, absent):
    return _Item(lambda v, ctx: getattr(v, attr), lambda v, ctx: present, lambda v, ctx: absent)


def _promo_item(tags, present, absent):
    return _Item(lambda v, ctx: any(t in v.promo_types for t in tags),
                 lambda v, ctx: present, lambda v, ctx: absent)


_TREATMENT_ITEMS = (
    _effect_item("showcase", "showcase frame", "no showcase frame"),
    _effect_item("extendedart", "extended art", "no extended art"),
    _flag_item("full_art", "full-art", "not full-art"),
    _flag_item("textless", "textless", "not textless"),
    _effect_item("colorshifted", "colorshifted", "not colorshifted"),
)
_STAMP_ITEMS = (
    _promo_item(("datestamped", "prerelease"), "date stamp", "no date stamp"),
    _promo_item(("stamped",), "promo stamp (art box)", "no promo stamp"),
    _Item(lambda v, ctx: bool(ctx.notes.set_note(v.set_code).stamp),
          lambda v, ctx: ctx.notes.set_note(v.set_code).stamp,
          lambda v, ctx: "no " + ctx.notes.set_note(v.set_code).stamp.split(" (")[0]),
    _promo_item(("serialized",), "serialized", "not serialized"),
)
_HOLO_WORDS = {
    "oval": "oval holo stamp", "triangle": "triangle holo stamp", "acorn": "acorn stamp",
    "heart": "heart stamp", "circle": "circle stamp",
}


def _treatment_value(v, ctx):
    return _present_absent_value(_TREATMENT_ITEMS, v, ctx)


def _treatment_words(v, ruled, ctx):
    return _present_absent_words(_TREATMENT_ITEMS, v, ruled, ctx)


def _stamp_value(v, ctx):
    return _present_absent_value(_STAMP_ITEMS, v, ctx)


def _stamp_words(v, ruled, ctx):
    return _present_absent_words(_STAMP_ITEMS, v, ruled, ctx)


def _holo_words(v, ruled, ctx):
    if v.security_stamp is None:
        return "no holo stamp"
    return _HOLO_WORDS.get(v.security_stamp, f"{v.security_stamp} stamp")


def _language_words(v, ruled, ctx):
    return _LANGUAGES.get(v.lang, f"language code {v.lang}")


def _back_words(v, ruled, ctx):
    note = ctx.notes.set_note(v.set_code).back  # a set's back applies to all its printings
    if note:
        return note
    if v.card_back_id == STANDARD_BACK:
        return "regular card back"
    if v.card_back_id is None:
        return "no card back (double-faced)"
    return "non-standard card back"


def _symbol_words(v, ruled, ctx):
    symbol = symbol_set(v, ctx)
    if symbol == "none":
        return "no set symbol"
    return f"{ctx.set_names.get(symbol, v.set_name)} set symbol"


def _number_words(v, ruled, ctx):
    return f"collector number {printed_number(v.collector_number)}"


def _compared_as_worded(words):
    """Compare versions on the words the collector will read, so look-alikes never rule each other out."""
    return lambda v, ctx: words(v, (), ctx)


def _skip_unless(words, can_say):
    return lambda v, ctx: words(v, (), ctx) if can_say(v, ctx) else SKIP


def _symbol_known(v, ctx):
    return symbol_set(v, ctx) is not None


def _number_printed(v, ctx):
    # Scryfall prefixes World Championship numbers with player initials (kb315, mlp315); the card doesn't.
    return not (v.set_code in LIST_SETS or _WORLDS.match(v.set_code) or v.released_at < COLLECTOR_NUMBERS_FROM
                or not ctx.notes.set_note(v.set_code).numbers)


TRAITS = [
    Trait(_compared_as_worded(_art_words), _art_words),
    Trait(_compared_as_worded(_border_words), _border_words),
    Trait(_compared_as_worded(_finish_words), _finish_words),
    Trait(_compared_as_worded(_frame_words), _frame_words),
    Trait(_treatment_value, _treatment_words),
    Trait(_compared_as_worded(_language_words), _language_words),
    Trait(_stamp_value, _stamp_words),
    Trait(_compared_as_worded(_holo_words), _holo_words),
    Trait(_compared_as_worded(_back_words), _back_words),
    Trait(_skip_unless(_symbol_words, _symbol_known), _symbol_words),
    Trait(_skip_unless(_number_words, _number_printed), _number_words),
]


def spot_card(versions: Sequence[SpotVersion], notes: HandNotes,
              set_names: Mapping[str, str]) -> dict[str, Spot]:
    ctx = Context(notes, set_names, versions, *art_facts(versions))
    values = {v.key: [t.value(v, ctx) for t in TRAITS] for v in versions}
    out = {}
    for target in versions:
        remaining = [o for o in versions if o.key != target.key]
        parts = []
        for i, trait in enumerate(TRAITS):
            if not remaining:
                break
            mine = values[target.key][i]
            if mine is SKIP:
                continue
            ruled = [o for o in remaining if values[o.key][i] != mine]
            if ruled:
                parts.append(trait.words(target, ruled, ctx))
                remaining = [o for o in remaining if values[o.key][i] == mine]
        pair_notes, same_as = [], []
        for o in remaining:
            note = notes.pair_note(target.set_code, o.set_code)
            if note is None:
                same_as.append(o.key)
            elif note not in pair_notes:
                pair_notes.append(note)
        out[target.key] = Spot(", ".join(parts), tuple(pair_notes), tuple(same_as),
                               frame_bucket(target.frame, target.released_at), symbol_set(target, ctx))
    return out
