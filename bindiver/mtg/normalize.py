"""Card-name normalization shared by the database builder and the lookup.

Typed or camera-read names rarely match Scryfall's spelling exactly, so both
sides of every name comparison go through normalize_name().
"""

import re
import unicodedata

_LIGATURES = str.maketrans({"æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe"})
_APOSTROPHES = re.compile(r"['’‘`]")
_SPLIT = re.compile(r"\s*//\s*")
_BLANK = re.compile(r"_+")
_NON_WORD = re.compile(r"[^a-z0-9_ ]+")


def normalize_name(raw: str) -> str:
    """Lowercase, strip accents and punctuation, keep blanks as '_', and standardize ' // ' between faces."""
    text = raw.translate(_LIGATURES)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = _APOSTROPHES.sub("", text.casefold())
    # Unfinity's "_____ Goblin" must not collapse to plain "goblin".
    text = _BLANK.sub(" _ ", text)
    faces = [" ".join(_NON_WORD.sub(" ", face).split()) for face in _SPLIT.split(text)]
    return " // ".join(faces)
