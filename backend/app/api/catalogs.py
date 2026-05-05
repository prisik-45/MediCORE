from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.models import CatalogEmail, CatalogItem, Supplier

router = APIRouter()


@router.get("/emails")
def list_catalog_emails(db: Session = Depends(get_db), limit: int = Query(25, ge=1, le=100)) -> list[dict]:
    stmt = (
        select(CatalogEmail, Supplier.name)
        .join(Supplier, Supplier.id == CatalogEmail.supplier_id)
        .order_by(CatalogEmail.received_at.desc())
        .limit(limit)
    )
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
        }
        for item, supplier_name in db.execute(stmt)
    ]
