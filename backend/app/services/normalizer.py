from backend.app.schemas import ExtractedCatalogItem


UNIT_ALIASES = {
    "pcs": "unit",
    "piece": "unit",
    "pieces": "unit",
    "units": "unit",
    "tabs": "tablet",
    "tablet": "tablet",
    "tablets": "tablet",
    "kg": "kg",
    "kilogram": "kg",
    "g": "g",
    "gram": "g",
}


def normalize_item(item: ExtractedCatalogItem) -> ExtractedCatalogItem:
    normalized_name = (item.normalized_name or item.ingredient_name).strip().lower()
    unit = None
    if item.unit:
        raw_unit = item.unit.strip().lower()
        unit = UNIT_ALIASES.get(raw_unit, raw_unit)
    return item.model_copy(update={"normalized_name": normalized_name, "unit": unit, "currency": item.currency.upper()})
