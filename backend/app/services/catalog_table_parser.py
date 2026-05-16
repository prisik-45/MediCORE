import re
from datetime import UTC, datetime

from backend.app.schemas import ExtractedCatalogItem

MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

PACK_PATTERN = re.compile(
    r"(?P<pack_size>\d+(?:\.\d+)?\s+(?:kg|g|mg|ml|l)\s+(?:fibre drum|fiber drum|drum|bag|carton|strip|box|bottle|pack))",
    re.IGNORECASE,
)
ROW_PATTERN = re.compile(
    r"^\s*(?P<ingredient>.+?)\s+"
    r"(?P<pack_size>\d+(?:\.\d+)?\s+(?:kg|g|mg|ml|l)\s+(?:fibre drum|fiber drum|drum|bag|carton|strip|box|bottle|pack))\s+"
    r"(?:INR|Rs\.?)\s*(?P<price>\d+(?:\.\d+)?)\s+"
    r"(?P<qty>[\d,]+(?:\.\d+)?)\s+(?P<unit>kg|g|mg|ml|l|units?|tabs?|tablets?|capsules?)\s+"
    r"(?P<day>\d{1,2})\s+(?P<month>[A-Za-z]{3})"
    r"(?:\s+(?P<status>.*))?\s*$",
    re.IGNORECASE,
)


def parse_catalog_table_text(text: str) -> list[ExtractedCatalogItem]:
    items: list[ExtractedCatalogItem] = []
    for line in text.splitlines():
        cleaned = _clean_line(line)
        if not cleaned or "INR" not in cleaned.upper():
            continue
        match = ROW_PATTERN.match(cleaned)
        if not match:
            continue

        month = MONTHS.get(match.group("month").lower())
        if not month:
            continue

        ingredient_name = match.group("ingredient").strip(" -")
        items.append(
            ExtractedCatalogItem(
                ingredient_name=ingredient_name,
                normalized_name=_normalize_name(ingredient_name),
                price_per_unit=float(match.group("price")),
                currency="INR",
                available_qty=float(match.group("qty").replace(",", "")),
                unit=_normalize_unit(match.group("unit")),
                valid_until=datetime(2026, month, int(match.group("day")), tzinfo=UTC),
                notes=(match.group("status") or "").strip() or None,
            )
        )
    return items


def extract_pack_size(line: str) -> str | None:
    match = PACK_PATTERN.search(line)
    return match.group("pack_size") if match else None


def _clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.encode("ascii", "ignore").decode("ascii")).strip()


def _normalize_name(name: str) -> str:
    normalized = name.lower().strip()
    normalized = re.sub(r"\s+api$", "", normalized)
    return normalized


def _normalize_unit(unit: str) -> str:
    unit = unit.lower().strip()
    if unit in {"units", "unit"}:
        return "unit"
    if unit in {"tabs", "tab", "tablets", "tablet"}:
        return "tablet"
    if unit in {"capsules", "capsule"}:
        return "capsule"
    return unit