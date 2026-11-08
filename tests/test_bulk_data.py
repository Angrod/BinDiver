from datetime import datetime, timezone

import pytest

from bindiver.mtg.bulk_data import sets_are_fresh, should_download

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)


def local(downloaded_at, updated_at="2026-11-03T22:06:49+00:00"):
    return {"downloaded_at": downloaded_at, "updated_at": updated_at}


@pytest.mark.parametrize(
    "local_meta, remote_updated_at, want",
    [
        (None, "2026-11-03T22:06:49+00:00", True),
        # Scryfall asks clients to cache for at least 24 hours, even if a newer file exists.
        (local("2026-11-04T10:00:00+00:00"), "2026-11-04T22:06:49+00:00", False),
        (local("2026-11-03T11:00:00+00:00"), "2026-11-04T22:06:49+00:00", True),
        (local("2026-11-03T11:00:00+00:00"), "2026-11-03T22:06:49+00:00", False),
    ],
)
def test_should_download(local_meta, remote_updated_at, want):
    assert should_download(local_meta, remote_updated_at, NOW) is want


def test_https_context_has_trusted_certificates_loaded():
    # python.org builds on macOS ship without a CA bundle, so the default context can't verify Scryfall.
    from bindiver.mtg.bulk_data import ssl_context

    assert ssl_context().cert_store_stats()["x509_ca"] > 0


def test_set_list_is_refetched_after_a_day():
    now = datetime(2026, 11, 4, 12, tzinfo=timezone.utc)
    assert sets_are_fresh(None, now) is False
    assert sets_are_fresh({"downloaded_at": "2026-11-04T00:00:00+00:00", "data": []}, now) is True
    assert sets_are_fresh({"downloaded_at": "2026-11-03T11:59:59+00:00", "data": []}, now) is False
