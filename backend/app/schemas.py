from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ExtractedCatalogItem(BaseModel):
    ingredient_name: str
    normalized_name: str | None = None
    price_per_unit: float
    currency: str = "INR"
    available_qty: float | None = 0.0
    unit: str | None = "units"
    valid_until: datetime | None = None
    supplier_sku: str | None = None
    lead_time_days: int | None = None
    moq: float | None = None
    notes: str | None = None

    @field_validator("available_qty", mode="before")
    @classmethod
    def validate_available_qty(cls, v):
        if v is None:
            return 0.0
        try:
            return float(v)
        except (ValueError, TypeError):
            return 0.0

    @field_validator("moq", mode="before")
    @classmethod
    def validate_moq(cls, v):
        if v is None:
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None

    @field_validator("unit", mode="before")
    @classmethod
    def validate_unit(cls, v):
        if v is None or not str(v).strip():
            return "units"
        return str(v)



class CatalogIngestionResult(BaseModel):
    supplier_name: str
    supplier_email: str
    subject: str | None = None
    received_at: datetime
    items: list[ExtractedCatalogItem]


class QueryPlan(BaseModel):
    operation: str = Field(pattern="^(supplier_compare|best_price|catalog_search|history_compare|supplier_activity|unrelated)$")
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
    last_email_date: datetime | None = None
    certifications: str | None = None
