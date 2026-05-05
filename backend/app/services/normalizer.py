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
    unit = UNIT_ALIASES.get(item.unit.strip().lower(), item.unit.strip().lower())
    return item.model_copy(update={"normalized_name": normalized_name, "unit": unit, "currency": item.currency.upper()})
