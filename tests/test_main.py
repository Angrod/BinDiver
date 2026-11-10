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


def test_phone_db_command_is_accepted(tmp_path, monkeypatch, capsys):
    import bindiver.__main__ as cli
    db = tmp_path / "cards.sqlite"
    db.touch()
    monkeypatch.setattr(cli, "DB_FILE", db)
    monkeypatch.setattr(cli, "icon_uris_needed", lambda db: {})
    monkeypatch.setattr(cli, "fetch_set_icons", lambda uris, data_dir: {})
    monkeypatch.setattr(cli, "build_phone_db", lambda db, out, icons: {
        "db_bytes": 50_000_000, "zip_bytes": 22_000_000, "price_date": "2026-11-03"})

    cli.main(["phone-db"])
    assert capsys.readouterr().out.strip() == "Phone database: 50.0 MB, zip 22.0 MB, prices as of 2026-11-03"


def test_golden_command_is_accepted(tmp_path, monkeypatch, capsys):
    import bindiver.__main__ as cli
    db = tmp_path / "cards.sqlite"
    db.touch()
    seen = {}
    monkeypatch.setattr(cli, "DB_FILE", db)
    monkeypatch.setattr(cli, "icon_uris_needed", lambda db: {})
    monkeypatch.setattr(cli, "fetch_set_icons", lambda uris, data_dir: {})
    monkeypatch.setattr(cli, "write_golden", lambda src, out, icons: seen.update(out=out))

    cli.main(["golden", "--out", str(tmp_path / "g")])
    assert seen["out"] == tmp_path / "g"
    assert "g" in capsys.readouterr().out
