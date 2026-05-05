from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from backend.app.db import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    name: Mapped[str] = mapped_column(String(255))
    email_domain: Mapped[str] = mapped_column(String(255), index=True)
    reliability_score: Mapped[float] = mapped_column(Numeric(5, 2), default=50)
    last_email_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    emails: Mapped[list["CatalogEmail"]] = relationship(back_populates="supplier")


class CatalogEmail(Base):
    __tablename__ = "catalog_emails"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    supplier_id: Mapped[UUID] = mapped_column(ForeignKey("suppliers.id"))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    raw_email_id: Mapped[str] = mapped_column(String(255), unique=True)
    subject: Mapped[str | None] = mapped_column(Text)
    pdf_url: Mapped[str | None] = mapped_column(Text)
    processing_status: Mapped[str] = mapped_column(String(50), default="queued")

    supplier: Mapped[Supplier] = relationship(back_populates="emails")


class CatalogItem(Base):
    __tablename__ = "catalog_items"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    catalog_email_id: Mapped[UUID] = mapped_column(ForeignKey("catalog_emails.id"))
    supplier_id: Mapped[UUID] = mapped_column(ForeignKey("suppliers.id"), index=True)
    ingredient_name: Mapped[str] = mapped_column(String(255))
    normalized_name: Mapped[str] = mapped_column(String(255), index=True)
    price_per_unit: Mapped[float] = mapped_column(Numeric(14, 4))
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    available_qty: Mapped[float] = mapped_column(Numeric(14, 2))
    unit: Mapped[str] = mapped_column(String(50))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    embedding: Mapped[list[float] | None] = mapped_column(Vector(384))
    raw_payload: Mapped[dict] = mapped_column(JSONB, default=dict)
