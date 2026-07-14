from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from uuid import UUID

from backend.app.config import get_settings
from backend.app.db import get_db
from backend.app.models import CatalogEmail, CatalogItem, Supplier
from backend.app.seed_mock_catalogs import build_catalogs
from backend.app.auth import get_current_user

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
    suppliers, emails, items = build_catalogs()
    supplier_names = {supplier.id: supplier.name for supplier in suppliers}
    email_received_dates = {email.id: email.received_at for email in emails}
    filtered_items = [item for item in items if not q or q.lower() in item.normalized_name.lower()]
    return [
        {
            "id": str(item.id),
            "catalog_email_id": str(item.catalog_email_id) if getattr(item, "catalog_email_id", None) else None,
            "supplier_name": supplier_names.get(item.supplier_id, "Mock supplier"),
            "ingredient_name": item.ingredient_name,
            "normalized_name": item.normalized_name,
            "price_per_unit": float(item.price_per_unit),
            "currency": item.currency,
            "available_qty": float(item.available_qty),
            "unit": item.unit,
            "valid_until": item.valid_until,
            "lead_time_days": getattr(item, "lead_time_days", None) if getattr(item, "lead_time_days", None) is not None else (item.raw_payload or {}).get("lead_time_days"),
            "moq": getattr(item, "moq", None) if getattr(item, "moq", None) is not None else (item.raw_payload or {}).get("moq"),
            "pack_size": (item.raw_payload or {}).get("pack_size"),
            "received_at": email_received_dates.get(item.catalog_email_id) if getattr(item, "catalog_email_id", None) else None,
        }
        for item in sorted(filtered_items, key=lambda row: row.price_per_unit)[:limit]
    ]


@router.get("/emails")
def list_catalog_emails(
    db: Session = Depends(get_db),
    limit: int = Query(25, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
) -> list[dict]:
    settings = get_settings()
    user_uuid = UUID(current_user["tenant_id"])
    stmt = (
        select(CatalogEmail, Supplier.name)
        .join(Supplier, Supplier.id == CatalogEmail.supplier_id)
        .where(
            CatalogEmail.tenant_id == user_uuid,
            CatalogEmail.processing_status == "completed",
            exists().where(CatalogItem.catalog_email_id == CatalogEmail.id),
        )
    )
    if not settings.mock_data_enabled:
        stmt = stmt.where(CatalogEmail.raw_email_id.not_like("core-mock-catalog-%"))
    stmt = stmt.order_by(CatalogEmail.received_at.desc()).limit(limit)
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
        if not settings.mock_data_enabled:
            raise
        return mock_catalog_emails(limit)


@router.get("/items")
def list_catalog_items(
    db: Session = Depends(get_db),
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    latest_only: bool = Query(True),
    current_user: dict = Depends(get_current_user)
) -> list[dict]:
    settings = get_settings()
    user_uuid = UUID(current_user["tenant_id"])
    stmt = (
        select(CatalogItem, Supplier.name, CatalogEmail.received_at)
        .join(Supplier, Supplier.id == CatalogItem.supplier_id)
        .join(CatalogEmail, CatalogEmail.id == CatalogItem.catalog_email_id)
    )
    if latest_only:
        latest_items = (
            select(
                CatalogItem.supplier_id.label("supplier_id"),
                CatalogItem.normalized_name.label("normalized_name"),
                func.max(CatalogEmail.received_at).label("latest_received_at"),
            )
            .join(CatalogEmail, CatalogEmail.id == CatalogItem.catalog_email_id)
            .where(CatalogItem.tenant_id == user_uuid)
            .group_by(CatalogItem.supplier_id, CatalogItem.normalized_name)
            .subquery()
        )
        stmt = stmt.join(
            latest_items,
            and_(
                latest_items.c.supplier_id == CatalogItem.supplier_id,
                latest_items.c.normalized_name == CatalogItem.normalized_name,
                latest_items.c.latest_received_at == CatalogEmail.received_at,
            ),
        )
    stmt = stmt.where(CatalogItem.tenant_id == user_uuid)
    if not settings.mock_data_enabled:
        source = CatalogItem.raw_payload["source"].astext
        stmt = stmt.where(or_(source.is_(None), source != "mock_extracted_catalogue"))
    if q:
        stmt = stmt.where(CatalogItem.normalized_name.ilike(f"%{q}%"))
    stmt = stmt.order_by(CatalogItem.price_per_unit.asc()).limit(limit)
    try:
        return [
            {
                "id": str(item.id),
                "catalog_email_id": str(item.catalog_email_id) if item.catalog_email_id else None,
                "supplier_name": supplier_name,
                "ingredient_name": item.ingredient_name,
                "normalized_name": item.normalized_name,
                "price_per_unit": float(item.price_per_unit),
                "currency": item.currency,
                "available_qty": float(item.available_qty),
                "unit": item.unit,
                "valid_until": item.valid_until,
                "lead_time_days": getattr(item, "lead_time_days", None) if getattr(item, "lead_time_days", None) is not None else (item.raw_payload or {}).get("lead_time_days"),
                "moq": getattr(item, "moq", None) if getattr(item, "moq", None) is not None else (item.raw_payload or {}).get("moq"),
                "pack_size": (item.raw_payload or {}).get("pack_size"),
                "received_at": received_at,
            }
            for item, supplier_name, received_at in db.execute(stmt)
        ]
    except SQLAlchemyError:
        if not settings.mock_data_enabled:
            raise
        return mock_catalog_items(q, limit)


@router.delete("/emails/{email_id}", status_code=204)
def delete_catalog_email(
    email_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete a specific catalog email and all its extracted catalog items securely."""
    user_uuid = UUID(current_user["tenant_id"])
    email_record = db.query(CatalogEmail).filter(CatalogEmail.id == email_id, CatalogEmail.tenant_id == user_uuid).first()
    if not email_record:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=404,
            detail="Catalog email not found or access denied."
        )
    try:
        # Delete catalog items first to satisfy foreign key constraint
        db.query(CatalogItem).filter(CatalogItem.catalog_email_id == email_id).delete(synchronize_session=False)
        # Delete the email record itself
        db.delete(email_record)
        db.commit()
    except Exception as e:
        db.rollback()
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while deleting the email record: {str(e)}"
        )




