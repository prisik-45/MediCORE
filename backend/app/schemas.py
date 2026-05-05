from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ExtractedCatalogItem(BaseModel):
    ingredient_name: str
    normalized_name: str | None = None
    price_per_unit: float
    currency: str = "INR"
    available_qty: float
    unit: str
    valid_until: datetime | None = None
    supplier_sku: str | None = None
    lead_time_days: int | None = None
    notes: str | None = None


class CatalogIngestionResult(BaseModel):
    supplier_name: str
    supplier_email: str
    subject: str | None = None
    received_at: datetime
    items: list[ExtractedCatalogItem]


class QueryPlan(BaseModel):
    operation: str = Field(pattern="^(supplier_compare|best_price|catalog_search|history_compare|supplier_activity)$")
    normalized_name: str | None = None
    min_quantity: float | None = None
    unit: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    limit: int = Field(default=10, ge=1, le=50)
    semantic_query: str | None = None


class ChatRequest(BaseModel):
    session_id: UUID | None = None
    message: str


class ChatResponse(BaseModel):
    answer: str
    rows: list[dict[str, Any]] = []


class SupplierSummary(BaseModel):
    id: UUID
    name: str
    email_domain: str
    reliability_score: float
    last_email_date: datetime | None = None
