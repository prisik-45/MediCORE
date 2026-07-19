from typing import Any
from sqlalchemy import Select, and_, func, nullslast, select
from sqlalchemy.orm import Session

from backend.app.models import CatalogItem, Supplier
from backend.app.schemas import QueryPlan


class SupplierRanker:
    def __init__(self, db: Session) -> None:
        self.db = db

    def ranked_items(self, plan: QueryPlan, tenant_id: Any | None = None) -> list[dict]:
        from uuid import UUID
        from backend.app.models import CatalogEmail
        from backend.app.config import get_settings
        from sqlalchemy import or_
        
        settings = get_settings()
        latest_items = (
            select(
                CatalogItem.supplier_id.label("supplier_id"),
                CatalogItem.normalized_name.label("normalized_name"),
                func.max(CatalogEmail.received_at).label("latest_received_at"),
            )
            .join(CatalogEmail, CatalogEmail.id == CatalogItem.catalog_email_id)
            .group_by(CatalogItem.supplier_id, CatalogItem.normalized_name)
            .subquery()
        )
        stmt: Select = (
            select(CatalogItem, Supplier, CatalogEmail.received_at)
            .join(Supplier, Supplier.id == CatalogItem.supplier_id)
            .join(CatalogEmail, CatalogEmail.id == CatalogItem.catalog_email_id)
            .join(
                latest_items,
                and_(
                    latest_items.c.supplier_id == CatalogItem.supplier_id,
                    latest_items.c.normalized_name == CatalogItem.normalized_name,
                    latest_items.c.latest_received_at == CatalogEmail.received_at,
                ),
            )
            .order_by(nullslast(CatalogItem.price_per_unit.asc()))
            .limit(plan.limit)
        )
        if not settings.mock_data_enabled:
            stmt = stmt.where(
                or_(
                    CatalogEmail.raw_email_id.is_(None),
                    CatalogEmail.raw_email_id.not_like("core-mock-catalog-%")
                )
            )
        if tenant_id:
            stmt = stmt.where(CatalogItem.tenant_id == (UUID(str(tenant_id)) if isinstance(tenant_id, str) else tenant_id))
        if plan.normalized_name:
            search_term = plan.normalized_name.lower()
            stmt = stmt.where(
                or_(
                    CatalogItem.normalized_name.ilike(f"%{search_term}%"),
                    CatalogItem.ingredient_name.ilike(f"%{search_term}%"),
                )
            )
        if plan.min_quantity:
            stmt = stmt.where(CatalogItem.available_qty >= plan.min_quantity)
        if plan.unit:
            stmt = stmt.where(CatalogItem.unit == plan.unit)

        rows = []
        for item, supplier, received_at in self.db.execute(stmt):
            price = float(item.price_per_unit) if item.price_per_unit is not None else None
            qty = float(item.available_qty) if item.available_qty is not None else None
            score = 100.0 - (price / 100.0) if price is not None else 0.0
            raw_payload = item.raw_payload or {}
            rows.append(
                {
                    "supplier_name": supplier.name,
                    "email_domain": supplier.email_domain,
                    "certifications": supplier.certifications,
                    "ingredient_name": item.ingredient_name,
                    "normalized_name": item.normalized_name,
                    "price_per_unit": price,
                    "currency": item.currency,
                    "available_qty": qty,
                    "unit": item.unit,
                    "price_display": raw_payload.get("price_display"),
                    "quantity_display": raw_payload.get("quantity_display"),
                    "lead_time_text": raw_payload.get("lead_time_text"),
                    "moq_display": raw_payload.get("moq_display"),
                    "valid_until": item.valid_until.isoformat() if item.valid_until else None,
                    "received_at": received_at.isoformat() if received_at else None,
                    "recommendation_score": round(score, 4),
                }
            )
        return rows
