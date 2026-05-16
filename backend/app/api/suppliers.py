from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.config import get_settings
from backend.app.db import get_db
from backend.app.models import CatalogEmail, Supplier
from backend.app.seed_mock_catalogs import build_catalogs

router = APIRouter()


def mock_suppliers() -> list[dict]:
    suppliers, _, _ = build_catalogs()
    return [
        {
            "id": str(row.id),
            "name": row.name,
            "email_domain": row.email_domain,
            "reliability_score": float(row.reliability_score),
            "last_email_date": row.last_email_date,
        }
        for row in sorted(suppliers, key=lambda supplier: supplier.last_email_date, reverse=True)
    ]


@router.get("")
def list_suppliers(db: Session = Depends(get_db)) -> list[dict]:
    settings = get_settings()
    try:
        stmt = select(Supplier).join(CatalogEmail, CatalogEmail.supplier_id == Supplier.id).distinct()
        if not settings.mock_data_enabled:
            stmt = stmt.where(Supplier.email_domain.not_like("%.example"))
        rows = db.execute(stmt.order_by(Supplier.last_email_date.desc().nullslast())).scalars()
        return [
            {
                "id": str(row.id),
                "name": row.name,
                "email_domain": row.email_domain,
                "reliability_score": float(row.reliability_score),
                "last_email_date": row.last_email_date,
            }
            for row in rows
        ]
    except SQLAlchemyError:
        if not settings.mock_data_enabled:
            raise
        return mock_suppliers()