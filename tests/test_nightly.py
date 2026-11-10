import pytest

from bindiver.mtg import nightly


@pytest.mark.parametrize("manifest, scryfall, forced, expected", [
    ("2026-11-09", "2026-11-09", False, False),
    ("2026-11-09", "2026-11-09", True, True),
    ("2026-11-08", "2026-11-09", False, True),
    (None, "2026-11-09", False, True),
])
def test_should_build(manifest, scryfall, forced, expected):
    assert nightly.should_build(manifest, scryfall, forced) is expected


def fake_fetch(manifest):
    def fetch(url):
        if url == nightly.MANIFEST_URL:
            return manifest
        assert url == nightly.BULK_ENDPOINT
        return {"updated_at": "2026-11-09T09:04:12.345+00:00"}
    return fetch


def test_nightly_check_compares_manifest_and_bulk_dates():
    assert nightly.nightly_check(False, fake_fetch({"price_date": "2026-11-09"})) is False
    assert nightly.nightly_check(False, fake_fetch({"price_date": "2026-11-08"})) is True
    assert nightly.nightly_check(True, fake_fetch({"price_date": "2026-11-09"})) is True


def test_nightly_check_builds_when_manifest_is_missing():
    assert nightly.nightly_check(False, fake_fetch(None)) is True


def test_cli_writes_build_line_to_github_output(tmp_path, monkeypatch, capsys):
    import bindiver.__main__ as cli
    out = tmp_path / "output.txt"
    monkeypatch.setenv("GITHUB_OUTPUT", str(out))
    monkeypatch.setattr(nightly, "fetch_json", fake_fetch({"price_date": "2026-11-09"}))
    cli.main(["nightly-check"])
    assert capsys.readouterr().out.strip() == "build=false"
    assert out.read_text() == "build=false\n"


def test_cli_forced_builds_and_works_without_github_output(monkeypatch, capsys):
    import bindiver.__main__ as cli
    monkeypatch.delenv("GITHUB_OUTPUT", raising=False)
    monkeypatch.setattr(nightly, "fetch_json", fake_fetch({"price_date": "2026-11-09"}))
    cli.main(["nightly-check", "--forced"])
    assert capsys.readouterr().out.strip() == "build=true"


# --- sanity_problems: the gate between the phone build and the upload ---

import sqlite3

LOW = {"printings": 3, "names": 2, "versions": 4, "sets": 2, "artists": 2}


def make_phone_db(tmp_path, printings=3, names=2, versions=4, priced=4, sets=2, artists=2):
    path = tmp_path / "cards-phone.sqlite"
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE printings (id INTEGER)")
    con.execute("CREATE TABLE names (id INTEGER)")
    con.execute("CREATE TABLE versions (id INTEGER, price_cents INTEGER)")
    con.execute("CREATE TABLE sets (id INTEGER)")
    con.execute("CREATE TABLE artists (id INTEGER)")
    for table, n in (("printings", printings), ("names", names), ("sets", sets), ("artists", artists)):
        con.executemany(f"INSERT INTO {table} VALUES (?)", [(i,) for i in range(n)])
    con.executemany("INSERT INTO versions VALUES (?, ?)",
                    [(i, 100 if i < priced else None) for i in range(versions)])
    con.commit()
    con.close()
    return path


GOOD = {"phone_format": 1, "db_bytes": 1000}


def problems(db, manifest=GOOD, published=None):
    return nightly.sanity_problems(db, manifest, published, floors=LOW)


def test_good_database_has_no_problems(tmp_path):
    assert problems(make_phone_db(tmp_path)) == []


@pytest.mark.parametrize("field, kwargs", [
    ("printings", {"printings": 2}),
    ("names", {"names": 1}),
    ("versions", {"versions": 3, "priced": 3}),
    ("sets", {"sets": 1}),
    ("artists", {"artists": 1}),
])
def test_each_row_floor_is_checked(tmp_path, field, kwargs):
    found = problems(make_phone_db(tmp_path, **kwargs))
    assert len(found) == 1
    assert field in found[0]
    assert str(list(kwargs.values())[0]) in found[0]


def test_priced_share_is_checked(tmp_path):
    found = problems(make_phone_db(tmp_path, versions=10, priced=8))
    assert len(found) == 1
    assert "priced" in found[0]
    assert "80.0%" in found[0]
    other = tmp_path / "other"
    other.mkdir()
    assert problems(make_phone_db(other, versions=20, priced=17)) == []


def test_phone_format_is_checked(tmp_path):
    found = problems(make_phone_db(tmp_path), {"phone_format": 2, "db_bytes": 1000})
    assert len(found) == 1
    assert "phone_format" in found[0] and "2" in found[0]


def test_size_check_runs_only_when_something_is_published(tmp_path):
    db = make_phone_db(tmp_path)
    assert problems(db, {"phone_format": 1, "db_bytes": 100}, None) == []
    assert problems(db, GOOD, {"db_bytes": 1000}) == []
    assert problems(db, {"phone_format": 1, "db_bytes": 1250}, {"db_bytes": 1000}) == []
    assert problems(db, {"phone_format": 1, "db_bytes": 750}, {"db_bytes": 1000}) == []
    found = problems(db, {"phone_format": 1, "db_bytes": 700}, {"db_bytes": 1000})
    assert len(found) == 1 and "700" in found[0] and "1,000" in found[0]
    assert len(problems(db, {"phone_format": 1, "db_bytes": 1300}, {"db_bytes": 1000})) == 1


def test_real_floors_reject_a_tiny_database(tmp_path):
    found = nightly.sanity_problems(make_phone_db(tmp_path), GOOD, None)
    assert len(found) == 5


def run_phone_check(tmp_path, monkeypatch, capsys, db_kwargs, published):
    import bindiver.__main__ as cli
    make_phone_db(tmp_path, **db_kwargs)
    (tmp_path / "manifest.json").write_text('{"phone_format": 1, "db_bytes": 1000}')
    monkeypatch.setattr(cli, "DATA_DIR", tmp_path)
    monkeypatch.setattr(nightly, "fetch_json", lambda url: published)
    monkeypatch.setattr(nightly, "FLOORS", LOW)
    try:
        cli.main(["phone-check"])
        code = 0
    except SystemExit as exit_info:
        code = exit_info.code
    return code, capsys.readouterr().out


def test_cli_phone_check_passes(tmp_path, monkeypatch, capsys):
    code, out = run_phone_check(tmp_path, monkeypatch, capsys, {}, None)
    assert code == 0
    assert out.strip() == "Phone database looks right."


def test_cli_phone_check_fails_and_prints_each_problem(tmp_path, monkeypatch, capsys):
    code, out = run_phone_check(tmp_path, monkeypatch, capsys, {"sets": 1, "artists": 1}, {"db_bytes": 1000})
    assert code == 1
    assert "sets" in out and "artists" in out
    assert "looks right" not in out
