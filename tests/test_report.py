from bindiver.mtg.report import bulk_report, coverage_report, format_result


def test_format_result_shows_summary_and_look_for_lines(cs_catalog):
    assert format_result(cs_catalog.lookup("Counterspell", 25), 25) == (
        "Counterspell: 6 of 11 versions worth finding at $25.00+\n"
        "Value sits in old-border 1993-frame nonfoils (4 of 6) and old-border 1997-frame foils (2 of 2).\n"
        "\n"
        "  $919.92  Limited Edition Beta  LEB #55  nonfoil\n"
        "           Look for: art by Mark Poole, black border, nonfoil, English, regular card back\n"
        "           Beta's corners are less rounded than Alpha's.\n"
        "   $60.00  Unlimited Edition  2ED #55  nonfoil\n"
        "           Look for: art by Mark Poole, white border\n"
        "           Looks the same as Revised Edition 3ED #54 ($5.97): check a reference image.\n"
        "   $60.00  Collectors' Edition  CED #55  nonfoil\n"
        "           Look for: art by Mark Poole, black border, nonfoil, English, Collectors' Edition back\n"
        "   $27.99  Foreign Black Border  FBB #54  nonfoil\n"
        "           Look for: art by Mark Poole, black border, nonfoil, French\n"
        "  $152.06  Mercadian Masques  MMQ #69  foil\n"
        "           Look for: art by Gao Yan, foil\n"
        "  $155.00  Seventh Edition  7ED #67★  foil\n"
        "           Look for: art by Mark Romanoski, black border\n"
        "  Unpriced (1):\n"
        "           Limited Edition Alpha  LEA #54  nonfoil\n"
        "           Look for: art by Mark Poole, black border, nonfoil, English, regular card back\n"
        "           Alpha's corners are more rounded than Beta's.\n"
        "Prices: Scryfall market reference as of 2026-11-03, not adjusted for condition."
    )


def test_only_version_says_any_copy(catalog):
    result = catalog.lookup("Lim-Dûl's Vault", 1)
    assert result.groups[0].total_versions == 1
    assert "\n         Look for: any copy (only version)\n" in format_result(result, 1)


def test_coverage_counts_versions_told_apart(cs_catalog):
    cov = coverage_report(cs_catalog, ["Counterspell", "Counterspell", "Xyzzy Plugh"], 25)
    assert (cov.qualifying, cov.told_apart) == (6, 5)
    assert [(name, v.key, [o.key for o in others]) for name, v, others in cov.unresolved] == [
        ("Counterspell", "cs-2ed:nonfoil", ["cs-3ed:nonfoil"])]


def test_format_result_says_when_the_name_was_corrected(catalog):
    text = format_result(catalog.lookup("Firebal", 10), 10)
    assert text.startswith('Closest match for "Firebal": Fireball\n')


def test_format_result_reports_no_match(catalog):
    assert format_result(catalog.lookup("Xyzzy Plugh", 10), 10) == (
        'No card found for "Xyzzy Plugh". Try another spelling.'
    )


def test_format_result_says_tokens_are_not_tracked(catalog):
    assert format_result(catalog.lookup("Warrior", 10), 10) == (
        '"Warrior" is a token or emblem. BinDiver only tracks cards.'
    )


def test_bulk_report_counts_names_with_any_version_worth_finding(catalog):
    report = bulk_report(
        catalog,
        ["Fireball", "Fire // Ice", "Xyzzy Plugh", "Very Cryptic Command", "Fireball", "Warrior", "Firebal"],
        min_price=10,
    )
    assert report.checked == 3
    assert report.alert_names == ["Fire // Ice", "Fireball"]
    assert report.tokens == ["Warrior"]
    assert report.corrected == [("Firebal", "Fireball")]
    assert report.unmatched == ["Xyzzy Plugh"]
