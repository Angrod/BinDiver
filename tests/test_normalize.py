import pytest

from bindiver.mtg.normalize import normalize_name


@pytest.mark.parametrize(
    "raw, want",
    [
        ("  FIREBALL ", "fireball"),
        ("Lim-Dûl's Vault", "lim duls vault"),
        ("Lim-Dul's Vault", "lim duls vault"),
        ("Æther Vial", "aether vial"),
        ("Jace, the Mind Sculptor", "jace the mind sculptor"),
        ("Fire // Ice", "fire // ice"),
        ("fire//ice", "fire // ice"),
        ("Gaea’s Cradle", "gaeas cradle"),
        ("_____ Goblin", "_ goblin"),
        ("_____", "_"),
    ],
)
def test_normalize_name(raw, want):
    assert normalize_name(raw) == want
