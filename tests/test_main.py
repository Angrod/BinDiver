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


def test_update_offline_rebuilds_from_saved_files_without_the_network(tmp_path, monkeypatch, capsys):
    import gzip
    import json
    import bindiver.__main__ as cli
    from bindiver.mtg import bulk_data
    from bindiver.mtg.lookup import Catalog

    card = {"object": "card", "id": "c1", "oracle_id": "o1", "name": "Bolt", "layout": "normal",
            "games": ["paper"], "set": "lea", "set_name": "Limited Edition Alpha", "collector_number": "1",
            "lang": "en", "released_at": "1993-08-05", "border_color": "black", "frame": "1993",
            "finishes": ["nonfoil"], "prices": {"usd": "5.00"}}
    with gzip.open(tmp_path / "default_cards.jsonl.gz", "wt", encoding="utf-8") as f:
        f.write(json.dumps(card) + "\n")
    (tmp_path / "default_cards.meta.json").write_text(json.dumps(
        {"updated_at": "2026-11-08T09:08:00+00:00", "downloaded_at": "2026-11-09T10:00:00+00:00"}))
    (tmp_path / "sets.json").write_text(json.dumps(
        {"downloaded_at": "2026-11-09T10:00:00+00:00", "data": [{"code": "lea", "name": "Limited Edition Alpha"}]}))

    def no_network(url):
        raise AssertionError("network call")
    monkeypatch.setattr(bulk_data, "_get", no_network)
    monkeypatch.setattr(cli, "DATA_DIR", tmp_path)
    monkeypatch.setattr(cli, "DB_FILE", tmp_path / "cards.sqlite")

    cli.main(["update", "--offline"])
    assert Catalog(tmp_path / "cards.sqlite").price_date == "2026-11-08"
    assert "Prices as of 2026-11-08" in capsys.readouterr().out


def test_update_offline_without_saved_data_exits(tmp_path, monkeypatch):
    import bindiver.__main__ as cli
    monkeypatch.setattr(cli, "DATA_DIR", tmp_path)
    monkeypatch.setattr(cli, "DB_FILE", tmp_path / "cards.sqlite")
    with pytest.raises(SystemExit, match="No saved Scryfall data"):
        cli.main(["update", "--offline"])
