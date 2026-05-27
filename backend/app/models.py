import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func, Integer, Boolean
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


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    full_name: Mapped[str | None] = mapped_column(Text)
    organisation: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str | None] = mapped_column(Text, default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EmailAccount(Base):
    __tablename__ = "email_accounts"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    provider: Mapped[str] = mapped_column(Text)
    email_address: Mapped[str] = mapped_column(Text)
    imap_host: Mapped[str] = mapped_column(Text)
    imap_port: Mapped[int] = mapped_column(Integer)
    encrypted_password: Mapped[str] = mapped_column(Text)
    sync_status: Mapped[str] = mapped_column(Text, default="pending")
    sync_error_msg: Mapped[str | None] = mapped_column(Text)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    filters: Mapped[list["EmailFilter"]] = relationship(back_populates="email_account", cascade="all, delete-orphan")


class EmailFilter(Base):
    __tablename__ = "email_filters"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email_account_id: Mapped[UUID] = mapped_column(ForeignKey("email_accounts.id", ondelete="CASCADE"), nullable=False)
    require_attachment: Mapped[bool] = mapped_column(Boolean, default=False)
    sender_keywords: Mapped[str | None] = mapped_column(Text)
    subject_keywords: Mapped[str | None] = mapped_column(Text)
    skip_promotions_tab: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    email_account: Mapped[EmailAccount] = relationship(back_populates="filters")


class EmailSyncSetting(Base):
    __tablename__ = "email_sync_settings"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), unique=True, nullable=False)
    poll_interval_minutes: Mapped[int] = mapped_column(Integer, default=3)
    auto_extract_catalog: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_on_new_catalog: Mapped[bool] = mapped_column(Boolean, default=True)
    ingestion_approach: Mapped[str] = mapped_column(Text, default="approach_2")
    trusted_suppliers: Mapped[str] = mapped_column(Text, default="")
    keyword_filters: Mapped[str] = mapped_column(Text, default="catalog, catalogue, price, offer, quote")
    pending_approvals: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

