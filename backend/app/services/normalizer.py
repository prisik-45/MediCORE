import re
from backend.app.schemas import ExtractedCatalogItem, clean_optional_text


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

SPEC_REPLACEMENTS = {
    r"\b(?:apeo\s*esn|apepdsn|epeDasn|apDdsn|apeD\s*dsn|apdsn|apuoN|usp\s*crade)\b": "USP Grade",
    r"\baji\s*crade\b": "AJI Grade",
    r"\bfood\s*cradh?\b": "Food Grade",
    r"\bnfi1\s*grade\b": "NF II Grade",
}

COLUMN_PREFIX_PATTERNS = [
    r"^(?:Ai\s+Cade|AJI\s+Grade|USP\s+Grade|USP\s+Crade|AJI\s+Crade|Food\s+Grade|NF\s+II\s+Grade)\s+",
    r"^(?:Vegan\s*:\s*[0-9:a-z;]+|FCC\s*&\s*AJI\s+Grade,\s*USP\s+Grade|apDdsn|apeD\s*dsn|apdsn|apeo\s*esn)\s+",
    r"^(?:ate\s+)?(?:\d+%\s*)+",
]

INGREDIENT_TYPO_REPLACEMENTS = {
    r"\bBlack\s+Cinger\b": "Black Ginger",
    r"\bCreen\s+Tea\b": "Green Tea",
    r"\bLyiozyme\b": "Lysozyme",
    r"\bMicroblal\b": "Microbial",
    r"\bMagneslum\b": "Magnesium",
    r"\bClycinate\b": "Glycinate",
    r"\bMlcrocrystalline\b": "Microcrystalline",
    r"\bManaradeotide\b": "Mononucleotide",
    r"\bg-Nicotinamide\b": "β-Nicotinamide",
}


def clean_ingredient_name(name: str) -> str:
    name = clean_optional_text(name) or ""
    for pattern in COLUMN_PREFIX_PATTERNS:
        name = re.sub(pattern, "", name, flags=re.IGNORECASE).strip()
    for pattern, repl in INGREDIENT_TYPO_REPLACEMENTS.items():
        name = re.sub(pattern, repl, name, flags=re.IGNORECASE)
    return name.strip()


def clean_specification(spec: str | None) -> str | None:
    cleaned = clean_optional_text(spec)
    if not cleaned:
        return None
    cleaned = re.sub(r"^\s*%\s*66\s*$", "99%", cleaned)
    cleaned = re.sub(r"^\s*66\s*%\s*$", "99%", cleaned)
    cleaned = re.sub(r"^\s*%\s*(\d+(?:\.\d+)?)\s*$", r"\1%", cleaned)
    for pattern, repl in SPEC_REPLACEMENTS.items():
        cleaned = re.sub(pattern, repl, cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def normalize_item(item: ExtractedCatalogItem) -> ExtractedCatalogItem:
    unit = None
    cleaned_unit = clean_optional_text(item.unit)
    if cleaned_unit:
        raw_unit = cleaned_unit.strip().lower()
        unit = UNIT_ALIASES.get(raw_unit, raw_unit)

    ingredient_name = clean_ingredient_name(item.ingredient_name) or item.ingredient_name
    specification = clean_specification(item.specification)

    return item.model_copy(
        update={
            "ingredient_name": ingredient_name,
            "unit": unit,
            "currency": (clean_optional_text(item.currency) or "INR").upper(),
            "specification": specification,
            "lead_time_text": clean_optional_text(item.lead_time_text),
            "notes": clean_optional_text(item.notes),
        }
    )
