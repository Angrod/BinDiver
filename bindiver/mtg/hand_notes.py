"""Load and check the hand-written notes file (set-level facts and pair notes)."""

import json
from dataclasses import dataclass
from pathlib import Path

HAND_NOTES_FILE = Path(__file__).with_name("hand_notes.json")

_SET_FIELDS = {"symbol", "except_langs", "back", "foil", "stamp", "numbers", "source"}
_PAIR_FIELDS = {"sets", "notes", "source"}


@dataclass(frozen=True)
class SetNote:
    symbol: bool = True                 # False: the set prints no set symbol
    except_langs: tuple[str, ...] = ()  # languages where it does print one
    back: str | None = None             # card back description
    foil: str | None = None             # name for the set's foil finish
    stamp: str | None = None            # stamp the whole set carries
    numbers: bool = True                # False: no printed collector numbers
    source: str = ""


@dataclass(frozen=True)
class HandNotes:
    sets: dict[str, SetNote]
    pairs: dict[tuple[str, str], str]   # (target set, look-alike set) -> note shown on the target

    def set_note(self, code: str) -> SetNote:
        return self.sets.get(code, SetNote())

    def pair_note(self, target_set: str, other_set: str) -> str | None:
        return self.pairs.get((target_set, other_set))


def _has_source(entry: dict) -> bool:
    source = entry.get("source")
    return isinstance(source, str) and source.startswith(("http://", "https://"))


def _check_text(value, name: str, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{name} field '{field}' must be a non-empty string")
    return value


def _parse_set(code: str, entry) -> SetNote:
    name = f"sets.{code}"
    if not isinstance(entry, dict):
        raise ValueError(f"{name} must be an object")
    for field in entry:
        if field not in _SET_FIELDS:
            raise ValueError(f"{name} has unknown field '{field}'")
    if not _has_source(entry):
        raise ValueError(f"{name} has no source link")
    for field in ("symbol", "numbers"):
        if field in entry and not isinstance(entry[field], bool):
            raise ValueError(f"{name} field '{field}' must be true or false")
    langs = entry.get("except_langs", [])
    if not isinstance(langs, list) or not all(isinstance(lang, str) and lang for lang in langs):
        raise ValueError(f"{name} field 'except_langs' must be a list of language codes")
    for field in ("back", "foil", "stamp"):
        if field in entry:
            _check_text(entry[field], name, field)
    return SetNote(
        symbol=entry.get("symbol", True),
        except_langs=tuple(langs),
        back=entry.get("back"),
        foil=entry.get("foil"),
        stamp=entry.get("stamp"),
        numbers=entry.get("numbers", True),
        source=entry["source"],
    )


def _parse_pair(index: int, entry) -> dict[tuple[str, str], str]:
    name = f"pairs[{index}]"
    if not isinstance(entry, dict):
        raise ValueError(f"{name} must be an object")
    for field in entry:
        if field not in _PAIR_FIELDS:
            raise ValueError(f"{name} has unknown field '{field}'")
    if not _has_source(entry):
        raise ValueError(f"{name} has no source link")
    sets = entry.get("sets")
    if (not isinstance(sets, list) or len(sets) != 2
            or not all(isinstance(code, str) and code for code in sets) or sets[0] == sets[1]):
        raise ValueError(f"{name} field 'sets' must list two different set codes")
    notes = entry.get("notes")
    if not isinstance(notes, dict) or not notes:
        raise ValueError(f"{name} has no notes")
    result = {}
    for code, text in notes.items():
        if code not in sets:
            raise ValueError(f"{name} has a note for {code}, which is not in its sets")
        _check_text(text, name, f"notes.{code}")
        other = sets[1] if code == sets[0] else sets[0]
        result[(code, other)] = text
    return result


def parse_hand_notes(data: dict) -> HandNotes:
    if not isinstance(data, dict):
        raise ValueError("hand notes must be an object")
    for key in data:
        if key not in ("sets", "pairs"):
            raise ValueError(f"hand notes have unknown field '{key}'")
    sets_data = data.get("sets", {})
    pairs_data = data.get("pairs", [])
    if not isinstance(sets_data, dict):
        raise ValueError("hand notes field 'sets' must be an object")
    if not isinstance(pairs_data, list):
        raise ValueError("hand notes field 'pairs' must be a list")
    sets = {code: _parse_set(code, entry) for code, entry in sets_data.items()}
    pairs: dict[tuple[str, str], str] = {}
    for index, entry in enumerate(pairs_data):
        for key, text in _parse_pair(index, entry).items():
            if key in pairs:
                raise ValueError(f"pairs[{index}] repeats the pair {key[0]}/{key[1]}")
            pairs[key] = text
    return HandNotes(sets=sets, pairs=pairs)


def load_hand_notes(path: Path = HAND_NOTES_FILE) -> HandNotes:
    return parse_hand_notes(json.loads(Path(path).read_text(encoding="utf-8")))
