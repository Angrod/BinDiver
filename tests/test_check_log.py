import pytest

from bindiver.mtg.build_db import build_db
from bindiver.mtg.check_log import LogCheck, check_log, format_check
from bindiver.mtg.lookup import Catalog
from tests.conftest import make_card


def usd(amount):
    return {"usd": amount, "usd_foil": None, "usd_etched": None}


@pytest.fixture
def db(tmp_path):
    cards = [
        make_card(id="old", oracle_id="o-old", name="Old Thing", set="lea", set_name="Limited Edition Alpha",
                  released_at="1993-08-05", frame="1993", prices=usd("40.00")),
        make_card(id="lair", oracle_id="o-lair", name="Lair Thing", set="sld", set_name="Secret Lair Drop",
                  released_at="2022-01-01", prices=usd("25.00")),
        make_card(id="shiny", oracle_id="o-shiny", name="Shiny Thing", frame_effects=["showcase"],
                  prices=usd("30.00")),
        make_card(id="shiny-lea", oracle_id="o-shiny", name="Shiny Thing", set="lea",
                  set_name="Limited Edition Alpha", released_at="1993-08-05", frame="1993", prices=usd("50.00")),
        make_card(id="plain", oracle_id="o-plain", name="Plain Thing", prices=usd("12.00")),
        make_card(id="cheap", oracle_id="o-cheap", name="Cheap Thing", prices=usd("1.00")),
    ]
    path = tmp_path / "cards.sqlite"
    build_db(cards, path, price_date="2026-11-08")
    return path


HEADER = "at,seconds_since_previous,seconds_to_read,source,raw_text,line_used,name,match,price_date,min_cents,alerted,marked_wrong,alert"


def row(name, alert, wrong="no", date="2026-11-08"):
    alerted = "yes" if alert in ("full", "quiet") else "no"
    return f"t,0,1,camera,{name},1,{name},exact,{date},1000,{alerted},{wrong},{alert}"


def write(tmp_path, *rows, header=HEADER):
    path = tmp_path / "run.csv"
    path.write_text("\n".join([header, *rows]) + "\n", encoding="utf-8")
    return path


def run(db, csv_path):
    return check_log(Catalog(db), db, csv_path)


ALL = [row("Old Thing", "quiet"), row("Lair Thing", "quiet"), row("Shiny Thing", "full"),
       row("Plain Thing", "full"), row("Cheap Thing", "none")]


def test_all_agreeing(db, tmp_path):
    check = run(db, write(tmp_path, *ALL))
    assert check.compared == 5
    assert check.disagreements == []
    assert check.skipped == []
    assert check.showcase_only == ["Shiny Thing"]
    assert check.phone_counts == {"full": 2, "quiet": 2, "known": 0, "none": 1}
    assert check.log_price_dates == ["2026-11-08"]
    assert check.mac_price_date == "2026-11-08"


def test_disagreement(db, tmp_path):
    check = run(db, write(tmp_path, row("Old Thing", "full")))
    assert check.disagreements == [("Old Thing", "full", "quiet")]


def test_known_counted_not_compared(db, tmp_path):
    check = run(db, write(tmp_path, row("Plain Thing", "known")))
    assert check.phone_counts["known"] == 1
    assert check.compared == 0
    assert check.disagreements == []


def test_marked_wrong_skipped(db, tmp_path):
    check = run(db, write(tmp_path, row("Old Thing", "full", wrong="yes")))
    assert check.skipped == [("Old Thing", "marked wrong")]
    assert check.compared == 0
    assert check.phone_counts["full"] == 0


def test_not_found_skipped(db, tmp_path):
    check = run(db, write(tmp_path, row("Nope Thing", "none")))
    assert check.skipped == [("Nope Thing", "not found")]
    assert check.compared == 0


def test_older_price_date(db, tmp_path):
    check = run(db, write(tmp_path, row("Plain Thing", "full", date="2026-11-07")))
    assert check.log_price_dates == ["2026-11-07"]
    assert "Warning: the log's prices are from 2026-11-07; the Mac's are from 2026-11-08." in format_check(check)


def test_csv_without_alert_column_reads_alerted(db, tmp_path):
    header = "at,seconds_since_previous,source,raw_text,line_used,name,match,price_date,min_cents,alerted,marked_wrong"
    rows = ["t,0,camera,Plain Thing,1,Plain Thing,exact,2026-11-08,1000,yes,no",
            "t,0,camera,Cheap Thing,1,Cheap Thing,exact,2026-11-08,1000,no,no"]
    check = run(db, write(tmp_path, *rows, header=header))
    assert check.compared == 2
    assert check.disagreements == []
    assert check.phone_counts == {"full": 1, "quiet": 0, "known": 0, "none": 1}


def test_format_check_exact():
    check = LogCheck(compared=142, disagreements=[("Name D", "full", "quiet")],
                     skipped=[("Name C", "marked wrong")],
                     phone_counts={"full": 11, "quiet": 19, "known": 3, "none": 109},
                     showcase_only=["Name A", "Name B"], log_price_dates=["2026-11-07"],
                     mac_price_date="2026-11-08")
    assert format_check(check).split("\n") == [
        "Checked 142 reads against prices as of 2026-11-08: 1 disagree.",
        "Phone alerts: 11 full, 19 quiet, 3 known, 109 none.",
        "Full alerts only from showcase or borderless versions: 2 (Name A, Name B)",
        "Skipped: Name C (marked wrong)",
        "Disagree: Name D: phone full, Mac quiet",
        "Warning: the log's prices are from 2026-11-07; the Mac's are from 2026-11-08.",
    ]


def test_format_check_quiet_when_nothing_to_say():
    check = LogCheck(compared=3, disagreements=[], skipped=[],
                     phone_counts={"full": 1, "quiet": 0, "known": 0, "none": 2},
                     showcase_only=[], log_price_dates=["2026-11-08"], mac_price_date="2026-11-08")
    assert format_check(check).split("\n") == [
        "Checked 3 reads against prices as of 2026-11-08: 0 disagree.",
        "Phone alerts: 1 full, 0 quiet, 0 known, 2 none.",
    ]
