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
