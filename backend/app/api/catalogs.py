from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.models import CatalogEmail, CatalogItem, Supplier
from backend.app.seed_mock_catalogs import build_catalogs

router = APIRouter()


def mock_catalog_emails(limit: int) -> list[dict]:
    suppliers, emails, _ = build_catalogs()
    supplier_names = {supplier.id: supplier.name for supplier in suppliers}
    return [
        {
            "id": str(email.id),
            "supplier_name": supplier_names.get(email.supplier_id, "Mock supplier"),
            "received_at": email.received_at,
            "subject": email.subject,
            "pdf_url": email.pdf_url,
            "processing_status": email.processing_status,
        }
        for email in sorted(emails, key=lambda row: row.received_at, reverse=True)[:limit]
    ]


def mock_catalog_items(q: str | None, limit: int) -> list[dict]:
    suppliers, _, items = build_catalogs()
    supplier_names = {supplier.id: supplier.name for supplier in suppliers}
    filtered_items = [item for item in items if not q or q.lower() in item.normalized_name.lower()]
    return [
        {
            "id": str(item.id),
            "supplier_name": supplier_names.get(item.supplier_id, "Mock supplier"),
            "ingredient_name": item.ingredient_name,
            "normalized_name": item.normalized_name,
            "price_per_unit": float(item.price_per_unit),
            "currency": item.currency,
            "available_qty": float(item.available_qty),
            "unit": item.unit,
            "valid_until": item.valid_until,
                "lead_time_days": (item.raw_payload or {}).get("lead_time_days"),
                "pack_size": (item.raw_payload or {}).get("pack_size"),
        }
        for item in sorted(filtered_items, key=lambda row: row.price_per_unit)[:limit]
    ]


@router.get("/emails")
def list_catalog_emails(db: Session = Depends(get_db), limit: int = Query(25, ge=1, le=100)) -> list[dict]:
    stmt = (
        select(CatalogEmail, Supplier.name)
        .join(Supplier, Supplier.id == CatalogEmail.supplier_id)
        .order_by(CatalogEmail.received_at.desc())
        .limit(limit)
    )
    try:
        return [
            {
                "id": str(email.id),
                "supplier_name": supplier_name,
                "received_at": email.received_at,
                "subject": email.subject,
                "pdf_url": email.pdf_url,
                "processing_status": email.processing_status,
            }
            for email, supplier_name in db.execute(stmt)
        ]
    except SQLAlchemyError:
        return mock_catalog_emails(limit)


@router.get("/items")
def list_catalog_items(
    db: Session = Depends(get_db),
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
) -> list[dict]:
    stmt = select(CatalogItem, Supplier.name).join(Supplier, Supplier.id == CatalogItem.supplier_id)
    if q:
        stmt = stmt.where(CatalogItem.normalized_name.ilike(f"%{q}%"))
    stmt = stmt.order_by(CatalogItem.price_per_unit.asc()).limit(limit)
    try:
        return [
            {
                "id": str(item.id),
                "supplier_name": supplier_name,
                "ingredient_name": item.ingredient_name,
                "normalized_name": item.normalized_name,
                "price_per_unit": float(item.price_per_unit),
                "currency": item.currency,
                "available_qty": float(item.available_qty),
                "unit": item.unit,
                "valid_until": item.valid_until,
                "lead_time_days": (item.raw_payload or {}).get("lead_time_days"),
                "pack_size": (item.raw_payload or {}).get("pack_size"),
            }
            for item, supplier_name in db.execute(stmt)
        ]
    except SQLAlchemyError:
        return mock_catalog_items(q, limit)

