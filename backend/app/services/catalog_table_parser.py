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
    r"(?P<pack_size>\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|l)\s+"
    r"(?:fibre drum|fiber drum|drum|bag|carton|strip|box|bottle|packing|packaging|pack))",
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
QUOTE_ROW_PATTERN = re.compile(
    r"^\s*(?P<product>.+?)\s+"
    r"(?P<qty>\d[\d,]*(?:\.\d+)?)"
    r"(?P<qty_extra>(?:\s+(?:(?:MOQ|M\.?O\.?Q\.?)\s*:?\s*"
    r"\d[\d,]*(?:\.\d+)?\s*(?:kg|g|mg|ml|l|units?|packs?)\b|"
    r"\d[\d,]*(?:\.\d+)?\s*(?:kg|g|mg|ml|l|units?|packs?)\s*"
    r"(?:packing|packaging|pack)\b))*)"
    r"\s+"
    r"(?P<price_terms>(?:(?:CIF|FOB|EXW|CNF|C&F)\s+[A-Za-z ./-]+?\s+)*)"
    r"(?:(?P<currency>US\$|\$|USD|INR|Rs\.?|₹|EUR|€)\s*)?"
    r"(?P<price>\d[\d,]*(?:\.\d+)?)"
    r"\s*/\s*(?P<price_unit>[A-Za-z]+)"
    r"(?:\s+(?P<lead>\d+\s*(?:-|to)\s*\d+\s*days?|\d+\s*days?))?"
    r"\s*$",
    re.IGNORECASE,
)
HEADER_CURRENCY_PATTERN = re.compile(r"price\s*\(\s*(?P<currency>[A-Z$₹€]+)\s*\)", re.IGNORECASE)
HEADER_UNIT_PATTERN = re.compile(r"quantity\s*\(\s*(?P<unit>[A-Za-z]+)\s*\)", re.IGNORECASE)
MOQ_PATTERN = re.compile(
    r"\b(?:MOQ|M\.?O\.?Q\.?)\s*:?\s*(?P<moq>\d[\d,]*(?:\.\d+)?)\s*(?P<unit>kg|g|mg|ml|l|units?|packs?)\b",
    re.IGNORECASE,
)


def parse_catalog_table_text(
    text: str,
    reference_date: datetime | None = None,
) -> list[ExtractedCatalogItem]:
    items: list[ExtractedCatalogItem] = []
    context = _table_context(text)
    seen: set[tuple[str, float, float, str]] = set()
    reference_date = reference_date or datetime.now(UTC)
    for line in _candidate_lines(text):
        cleaned = _clean_line(line)
        if not cleaned:
            continue
        match = ROW_PATTERN.match(cleaned)
        if match:
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
                    valid_until=_infer_valid_until(int(match.group("day")), month, reference_date),
                    notes=(match.group("status") or "").strip() or None,
                )
            )
            continue

        quote_item = _parse_quotation_row(cleaned, context)
        if quote_item and _item_key(quote_item) not in seen:
            seen.add(_item_key(quote_item))
            items.append(quote_item)
    return items


def extract_pack_size(line: str) -> str | None:
    match = PACK_PATTERN.search(line)
    return match.group("pack_size") if match else None


def _clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


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


def _infer_valid_until(day: int, month: int, reference_date: datetime) -> datetime:
    year = reference_date.year
    candidate = datetime(year, month, day, tzinfo=UTC)
    if candidate.date() < reference_date.date():
        candidate = datetime(year + 1, month, day, tzinfo=UTC)
    return candidate


def _table_context(text: str) -> dict[str, str | None]:
    context: dict[str, str | None] = {"currency": None, "quantity_unit": None}
    for line in text.splitlines():
        cleaned = _clean_line(line)
        if not cleaned:
            continue
        currency_match = HEADER_CURRENCY_PATTERN.search(cleaned)
        if currency_match:
            context["currency"] = _currency_code(currency_match.group("currency"))
        unit_match = HEADER_UNIT_PATTERN.search(cleaned)
        if unit_match:
            context["quantity_unit"] = _normalize_unit(unit_match.group("unit"))
        if context["currency"] and context["quantity_unit"]:
            break
    return context


def _parse_quotation_row(line: str, context: dict[str, str | None]) -> ExtractedCatalogItem | None:
    if _price_occurrences(line) > 1:
        return None
    if " NA" in f" {line.upper()} " and "/" not in line:
        return None
    match = QUOTE_ROW_PATTERN.match(line)
    if not match:
        return None

    product = _strip_leading_date_customer(match.group("product"))
    if not product or _looks_like_header(product):
        return None

    qty = _number(match.group("qty"))
    price = _number(match.group("price"))
    if qty is None or price is None:
        return None

    price_unit = _normalize_unit(match.group("price_unit"))
    qty_unit = context.get("quantity_unit") or price_unit
    qty_extra = (match.group("qty_extra") or "").strip()
    price_terms = (match.group("price_terms") or "").strip()
    lead_text = (match.group("lead") or "").strip()
    currency = _currency_code(match.group("currency") or context.get("currency") or "INR")
    moq, moq_unit = _extract_moq(qty_extra)
    notes = _notes(
        original_quantity=f"{match.group('qty')} {qty_unit}".strip(),
        quantity_extra=qty_extra,
        original_price=_original_price(match, currency),
        price_terms=price_terms,
        lead_time=lead_text,
        moq_unit=moq_unit,
    )

    return ExtractedCatalogItem(
        ingredient_name=product,
        normalized_name=_normalize_name(product),
        price_per_unit=price,
        currency=currency,
        available_qty=qty,
        unit=qty_unit or price_unit,
        lead_time_days=_lead_time_days(lead_text),
        moq=moq,
        notes=notes,
    )


def _currency_code(raw: str | None) -> str:
    value = (raw or "").strip().upper()
    if value in {"$", "US$", "USD"}:
        return "USD"
    if value in {"₹", "RS", "RS.", "INR"}:
        return "INR"
    if value in {"€", "EUR"}:
        return "EUR"
    return value or "INR"


def _number(raw: str | None) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return None


def _extract_moq(text: str) -> tuple[float | None, str | None]:
    match = MOQ_PATTERN.search(text or "")
    if not match:
        return None, None
    return _number(match.group("moq")), _normalize_unit(match.group("unit"))


def _lead_time_days(text: str) -> int | None:
    if not text:
        return None
    match = re.search(r"(\d+)", text)
    return int(match.group(1)) if match else None


def _original_price(match: re.Match[str], currency: str) -> str:
    raw_currency = match.group("currency") or currency
    return f"{raw_currency}{match.group('price')}/{match.group('price_unit')}"


def _notes(**parts: str | None) -> str | None:
    values = [f"{key}={value}" for key, value in parts.items() if value]
    return "; ".join(values) if values else None


def _strip_leading_date_customer(product: str) -> str:
    cleaned = re.sub(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+", "", product).strip()
    return re.sub(
        r"^[A-Za-z0-9&.,' -]{2,}?\b(?:Inc\.?|Ltd\.?|LLC|Corp\.?|Corporation|Pvt\.?\s+Ltd\.?)\s+",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()


def _looks_like_header(product: str) -> bool:
    lowered = product.lower()
    if re.match(r"^\d+\s*(?:-|to)\s*\d+\s*days?\b", lowered):
        return True
    return any(header in lowered for header in ("product", "customer", "quantity", "price"))


def _candidate_lines(text: str) -> list[str]:
    lines = [_clean_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    candidates: list[str] = []
    for index in range(len(lines)):
        max_end = min(index + 5, len(lines))
        for end in range(max_end, index, -1):
            candidates.append(" ".join(lines[index:end]))
    return candidates


def _item_key(item: ExtractedCatalogItem) -> tuple[str, float, float, str]:
    return (
        item.normalized_name or item.ingredient_name.lower(),
        float(item.available_qty or 0),
        float(item.price_per_unit),
        item.currency,
    )


def _price_occurrences(line: str) -> int:
    return len(
        re.findall(
            r"(?:(?:US\$|\$|USD|INR|Rs\.?|₹|EUR|€)\s*)?\d[\d,]*(?:\.\d+)?\s*/\s*[A-Za-z]+",
            line,
            flags=re.IGNORECASE,
        )
    )
