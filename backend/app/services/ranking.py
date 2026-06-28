from typing import Any
from sqlalchemy import Select, asc, desc, select
from sqlalchemy.orm import Session

from backend.app.models import CatalogItem, Supplier
from backend.app.schemas import QueryPlan


class SupplierRanker:
    def __init__(self, db: Session) -> None:
        self.db = db

    def ranked_items(self, plan: QueryPlan, tenant_id: Any | None = None) -> list[dict]:
        from uuid import UUID
        stmt: Select = (
            select(CatalogItem, Supplier)
            .join(Supplier, Supplier.id == CatalogItem.supplier_id)
            .order_by(asc(CatalogItem.price_per_unit))
            .limit(plan.limit)
        )
        if tenant_id:
            stmt = stmt.where(CatalogItem.tenant_id == (UUID(str(tenant_id)) if isinstance(tenant_id, str) else tenant_id))
        if plan.normalized_name:
            stmt = stmt.where(CatalogItem.normalized_name.ilike(f"%{plan.normalized_name.lower()}%"))
        if plan.min_quantity:
            stmt = stmt.where(CatalogItem.available_qty >= plan.min_quantity)
        if plan.unit:
            stmt = stmt.where(CatalogItem.unit == plan.unit)

        rows = []
        for item, supplier in self.db.execute(stmt):
            score = 100.0 - (float(item.price_per_unit) / 100.0)
            rows.append(
                {
                    "supplier_name": supplier.name,
                    "email_domain": supplier.email_domain,
                    "certifications": supplier.certifications,
                    "ingredient_name": item.ingredient_name,
                    "normalized_name": item.normalized_name,
                    "price_per_unit": float(item.price_per_unit),
                    "currency": item.currency,
                    "available_qty": float(item.available_qty),
                    "unit": item.unit,
                    "valid_until": item.valid_until.isoformat() if item.valid_until else None,
                    "recommendation_score": round(score, 4),
                }
            )
        return rows
