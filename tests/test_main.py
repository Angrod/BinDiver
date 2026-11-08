import pytest

from bindiver.__main__ import needs_rebuild


@pytest.mark.parametrize("kwargs", [
    dict(force=True),
    dict(db_exists=False),
    dict(db_price_date="2026-11-03"),
    dict(notes_mtime=200.0),
])
def test_needs_rebuild_true_cases(kwargs):
    base = dict(force=False, db_exists=True, db_price_date="2026-11-04", price_date="2026-11-04",
                db_mtime=100.0, notes_mtime=50.0)
    assert needs_rebuild(**(base | kwargs)) is True


def test_needs_rebuild_false_when_nothing_changed():
    assert needs_rebuild(force=False, db_exists=True, db_price_date="2026-11-04",
                         price_date="2026-11-04", db_mtime=100.0, notes_mtime=50.0) is False


def test_lookup_command_sorts_oldest_first_unless_told_otherwise(cs_catalog, monkeypatch, capsys):
    import bindiver.__main__ as cli
    monkeypatch.setattr(cli, "_catalog", lambda: cs_catalog)

    cli.main(["lookup", "Counterspell", "--min", "25"])
    out = capsys.readouterr().out
    assert out.index("Limited Edition Beta") < out.index("Seventh Edition")

    cli.main(["lookup", "Counterspell", "--min", "25", "--sort", "newest"])
    out = capsys.readouterr().out
    assert out.index("Seventh Edition") < out.index("Limited Edition Beta")

    cli.main(["lookup", "Counterspell", "--min", "25", "--sort", "price"])
    out = capsys.readouterr().out
    assert out.index("Seventh Edition") < out.index("Unlimited Edition")
