ALLOWED_OPERATIONS = {
    "supplier_compare",
    "best_price",
    "catalog_search",
    "history_compare",
    "supplier_activity",
}


def validate_operation(operation: str) -> str:
    if operation not in ALLOWED_OPERATIONS:
        raise ValueError(f"Unsupported query operation: {operation}")
    return operation
