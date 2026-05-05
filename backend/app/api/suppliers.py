from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.models import Supplier

router = APIRouter()


@router.get("")
def list_suppliers(db: Session = Depends(get_db)) -> list[dict]:
    rows = db.execute(select(Supplier).order_by(Supplier.last_email_date.desc().nullslast())).scalars()
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
