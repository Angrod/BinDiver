"""Money formatting shared by the summary and the plain-text report."""


def dollars(cents: int) -> str:
    return f"${cents // 100:,}.{cents % 100:02d}"
