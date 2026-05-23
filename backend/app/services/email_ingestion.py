import email
import imaplib
import logging
import tempfile

import httpx
from datetime import UTC, datetime
from email.message import Message
from pathlib import Path
from typing import Any
from uuid import uuid4, UUID

from sqlalchemy.orm import Session

from backend.app.config import get_settings
from backend.app.db import get_supabase
from backend.app.models import CatalogEmail, CatalogItem, Supplier
from backend.app.services.catalog_table_parser import extract_pack_size, parse_catalog_table_text
from backend.app.services.embeddings import embed_catalog_item_text
from backend.app.services.gmail_api import GmailApiClient
from backend.app.services.llm import GroqClient
from backend.app.services.normalizer import normalize_item
from backend.app.services.pdf_extract import extract_pdf_text

logger = logging.getLogger(__name__)


class EmailIngestionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()
        self.llm = GroqClient()

    def preview_imap_inbox(
        self,
        imap_username: str | None = None,
        imap_password: str | None = None,
        imap_mailbox: str | None = None,
    ) -> dict:
        using_supplied_credentials = bool(imap_username and imap_password)
        if self.settings.email_mode != "imap" and not using_supplied_credentials:
            return {"email_mode": self.settings.email_mode, "unread_count": 0, "pdf_messages": []}

        username = imap_username or self.settings.imap_username
        password = imap_password or self.settings.imap_password
        mailbox = imap_mailbox or self.settings.imap_mailbox

        with imaplib.IMAP4_SSL(self.settings.imap_host, self.settings.imap_port, timeout=30) as client:
            client.login(username, password)
            client.select(mailbox)
            _, message_ids = client.search(None, "UNSEEN")
            ids = message_ids[0].split() if message_ids and message_ids[0] else []
            pdf_messages = []
            for msg_id in ids:
                _, data = client.fetch(msg_id, "(BODY.PEEK[])")
                if not data or not isinstance(data[0], tuple):
                    continue
                message = email.message_from_bytes(data[0][1])
                attachments = [name for name, _ in self._pdf_attachments(message)]
                if attachments:
                    pdf_messages.append(
                        {
                            "raw_email_id": msg_id.decode(),
                            "from": email.utils.parseaddr(message.get("From", ""))[1],
                            "subject": message.get("Subject"),
                            "pdf_attachments": attachments,
                        }
                    )
            return {
                "email_mode": "imap" if using_supplied_credentials else self.settings.email_mode,
                "mailbox": mailbox,
                "unread_count": len(ids),
                "pdf_message_count": len(pdf_messages),
                "pdf_messages": pdf_messages,
            }

    def poll_imap_inbox(
        self,
        imap_username: str | None = None,
        imap_password: str | None = None,
        imap_mailbox: str | None = None,
    ) -> int:
        using_supplied_credentials = bool(imap_username and imap_password)
        if self.settings.email_mode != "imap" and not using_supplied_credentials:
            logger.info("Skipping IMAP poll because EMAIL_MODE=%s", self.settings.email_mode)
            return 0

        username = imap_username or self.settings.imap_username
        password = imap_password or self.settings.imap_password
        mailbox = imap_mailbox or self.settings.imap_mailbox

        processed = 0
        logger.info("Connecting to IMAP mailbox %s:%s/%s", self.settings.imap_host, self.settings.imap_port, mailbox)
        with imaplib.IMAP4_SSL(self.settings.imap_host, self.settings.imap_port, timeout=30) as client:
            client.login(username, password)
            client.select(mailbox)
            _, message_ids = client.search(None, "UNSEEN")
            ids = message_ids[0].split() if message_ids and message_ids[0] else []
            logger.info("Found %s unread IMAP message(s)", len(ids))
            for msg_id in ids:
                logger.info("Fetching IMAP message id=%s", msg_id.decode())
                _, data = client.fetch(msg_id, "(RFC822)")
                if not data or not isinstance(data[0], tuple):
                    logger.info("Skipping IMAP message id=%s because it had no RFC822 payload", msg_id.decode())
                    continue
                message = email.message_from_bytes(data[0][1])
                processed += self._process_message(message, raw_email_id=msg_id.decode())
        logger.info("IMAP poll completed; extracted %s catalogue item(s)", processed)
        return processed

    def process_gmail_push_payload(self, payload: dict) -> int:
        if not self.settings.gmail_oauth_token:
            return 0

        processed = 0
        gmail = GmailApiClient()
        for message_id, message in gmail.fetch_unread_pdf_messages():
            processed += self._process_message(message, raw_email_id=message_id)
            gmail.mark_read(message_id)
        return processed

    def _process_message(self, message: Message, raw_email_id: str, tenant_id: Any | None = None) -> int:
        if self._email_has_items(raw_email_id):
            logger.info("Skipping already-extracted email id=%s", raw_email_id)
            return 0

        sender = email.utils.parseaddr(message.get("From", ""))[1]
        subject = message.get("Subject")
        attachments = self._pdf_attachments(message)
        logger.info("Processing email id=%s from=%s subject=%r pdf_attachments=%s", raw_email_id, sender, subject, len(attachments))
        if not attachments:
            return 0

        supplier = self._upsert_supplier(sender, tenant_id=tenant_id)
        count = 0

        for attachment_name, pdf_bytes in attachments:
            logger.info("Processing PDF attachment %s (%s bytes)", attachment_name, len(pdf_bytes))
            with tempfile.TemporaryDirectory() as tmp_dir:
                pdf_path = Path(tmp_dir) / attachment_name
                pdf_path.write_bytes(pdf_bytes)
                attachment_email_id = f"{raw_email_id}:{attachment_name}"
                catalog_email = (
                    self.db.query(CatalogEmail)
                    .filter(CatalogEmail.raw_email_id == attachment_email_id)
                    .first()
                )
                if catalog_email:
                    logger.info("Reprocessing existing email record id=%s with no extracted items", attachment_email_id)
                    catalog_email.processing_status = "processing"
                    catalog_email.subject = subject
                    if not catalog_email.pdf_url:
                        catalog_email.pdf_url = self._upload_pdf(pdf_path, raw_email_id)
                else:
                    pdf_url = self._upload_pdf(pdf_path, raw_email_id)
                    catalog_email = CatalogEmail(
                        id=uuid4(),
                        tenant_id=tenant_id or supplier.tenant_id,
                        supplier_id=supplier.id,
                        raw_email_id=attachment_email_id,
                        subject=subject,
                        pdf_url=pdf_url,
                        received_at=datetime.now(UTC),
                        processing_status="processing",
                    )
                    self.db.add(catalog_email)
                self.db.flush()

                text = extract_pdf_text(pdf_path)
                logger.info("Extracted %s characters of PDF text from %s", len(text), attachment_name)
                extracted = self._extract_items_from_text(text, attachment_name)
                count += self._store_catalog_items(catalog_email, supplier, extracted, text, tenant_id=tenant_id)
                catalog_email.processing_status = "completed"
                self._touch_supplier_last_email(supplier, catalog_email.received_at)
        self.db.commit()
        logger.info("Committed %s catalogue item(s) for email id=%s", count, raw_email_id)
        return count

    def reprocess_empty_catalog_emails(self, limit: int = 25, force: bool = False) -> int:
        if force:
            empty_emails = (
                self.db.query(CatalogEmail)
                .filter(CatalogEmail.pdf_url.isnot(None))
                .order_by(CatalogEmail.received_at.desc())
                .limit(limit)
                .all()
            )
        else:
            empty_emails = (
                self.db.query(CatalogEmail)
                .outerjoin(CatalogItem, CatalogItem.catalog_email_id == CatalogEmail.id)
                .filter(CatalogItem.id.is_(None), CatalogEmail.pdf_url.isnot(None))
                .order_by(CatalogEmail.received_at.desc())
                .limit(limit)
                .all()
            )

        processed = 0
        for catalog_email in empty_emails:
            if not catalog_email.pdf_url or not catalog_email.pdf_url.startswith(("http://", "https://")):
                continue
            supplier = self.db.query(Supplier).filter(Supplier.id == catalog_email.supplier_id).first()
            if not supplier:
                continue
            logger.info("Reprocessing stored PDF for email id=%s", catalog_email.raw_email_id)
            with tempfile.TemporaryDirectory() as tmp_dir:
                pdf_path = Path(tmp_dir) / f"{catalog_email.id}.pdf"
                response = httpx.get(catalog_email.pdf_url, timeout=60)
                response.raise_for_status()
                pdf_path.write_bytes(response.content)
                catalog_email.processing_status = "processing"
                if force:
                    self.db.query(CatalogItem).filter(
                        CatalogItem.catalog_email_id == catalog_email.id
                    ).delete(synchronize_session=False)
                text = extract_pdf_text(pdf_path)
                logger.info("Extracted %s characters while reprocessing email id=%s", len(text), catalog_email.raw_email_id)
                extracted = self._extract_items_from_text(text, str(catalog_email.id))
                processed += self._store_catalog_items(catalog_email, supplier, extracted, text, tenant_id=catalog_email.tenant_id)
                catalog_email.processing_status = "completed"
                self._touch_supplier_last_email(supplier, catalog_email.received_at)
        self.db.commit()
        logger.info("Reprocessed %s catalogue item(s) from stored PDFs", processed)
        return processed

    def _extract_items_from_text(self, text: str, source_name: str):
        if not text.strip():
            logger.info("No text available for %s", source_name)
            return []

        parsed = [normalize_item(item) for item in parse_catalog_table_text(text)]
        logger.info("OCR table parser extracted %s catalogue row(s) from %s", len(parsed), source_name)
        if parsed:
            return parsed

        try:
            extracted = [normalize_item(item) for item in self.llm.extract_catalog_items(text)]
            logger.info("LLM extracted %s catalogue row(s) from %s", len(extracted), source_name)
            return extracted
        except Exception:
            logger.exception("LLM extraction failed for %s", source_name)
            return []

    def _store_catalog_items(self, catalog_email: CatalogEmail, supplier: Supplier, items, text: str, tenant_id: Any | None = None) -> int:
        count = 0
        for item in items:
            item_text = (
                f"{item.normalized_name} {item.ingredient_name} "
                f"{item.available_qty} {item.unit} {item.price_per_unit} {item.currency}"
            )
            raw_payload = item.model_dump(mode="json")
            raw_payload["source"] = "email_extracted_catalogue"
            raw_payload["pack_size"] = self._pack_size_for_item(text, item.ingredient_name)
            self.db.add(
                CatalogItem(
                    id=uuid4(),
                    tenant_id=tenant_id or supplier.tenant_id,
                    catalog_email_id=catalog_email.id,
                    supplier_id=supplier.id,
                    ingredient_name=item.ingredient_name,
                    normalized_name=item.normalized_name or item.ingredient_name.lower(),
                    price_per_unit=item.price_per_unit,
                    currency=item.currency,
                    available_qty=item.available_qty,
                    unit=item.unit,
                    valid_until=item.valid_until,
                    embedding=self._safe_embedding(item_text),
                    raw_payload=raw_payload,
                )
            )
            count += 1
        return count

    def _touch_supplier_last_email(self, supplier: Supplier, received_at: datetime) -> None:
        if supplier.last_email_date is None or received_at > supplier.last_email_date:
            supplier.last_email_date = received_at

    def _safe_embedding(self, item_text: str) -> list[float] | None:
        try:
            return embed_catalog_item_text(item_text)
        except Exception:
            logger.exception("Embedding failed; storing catalogue item without vector")
            return None

    def _pack_size_for_item(self, text: str, ingredient_name: str) -> str | None:
        ingredient = ingredient_name.lower()
        for line in text.splitlines():
            if ingredient in line.lower():
                return extract_pack_size(line)
        return None
    def _email_has_items(self, raw_email_id: str) -> bool:
        return (
            self.db.query(CatalogItem)
            .join(CatalogEmail, CatalogItem.catalog_email_id == CatalogEmail.id)
            .filter(CatalogEmail.raw_email_id.like(f"{raw_email_id}%"))
            .first()
            is not None
        )

    def _upsert_supplier(self, sender: str, tenant_id: Any | None = None) -> Supplier:
        domain = sender.split("@")[-1].lower() if "@" in sender else sender.lower()
        if tenant_id:
            supplier = self.db.query(Supplier).filter(
                Supplier.email_domain == domain,
                Supplier.tenant_id == tenant_id
            ).first()
        else:
            supplier = self.db.query(Supplier).filter(Supplier.email_domain == domain).first()

        if supplier:
            return supplier

        supplier = Supplier(
            id=uuid4(),
            tenant_id=tenant_id or uuid4(),
            name=domain.split(".")[0].replace("-", " ").title(),
            email_domain=domain,
            reliability_score=50,
        )
        self.db.add(supplier)
        self.db.flush()
        return supplier

    def _pdf_attachments(self, message: Message) -> list[tuple[str, bytes]]:
        attachments = []
        for part in message.walk():
            filename = part.get_filename()
            if not filename or not filename.lower().endswith(".pdf"):
                continue
            payload = part.get_payload(decode=True)
            if payload:
                attachments.append((filename, payload))
        return attachments

    def _upload_pdf(self, pdf_path: Path, raw_email_id: str) -> str:
        object_path = f"{raw_email_id}/{pdf_path.name}"
        supabase = get_supabase()
        supabase.storage.from_(self.settings.supabase_storage_bucket).upload(
            object_path,
            pdf_path.read_bytes(),
            {"content-type": "application/pdf", "upsert": "true"},
        )
        return supabase.storage.from_(self.settings.supabase_storage_bucket).get_public_url(object_path)

    def poll_account_inbox(self, account_id: UUID) -> int:
        from backend.app.models import EmailAccount, EmailFilter
        from backend.app.auth import decrypt_password

        account = self.db.query(EmailAccount).filter(EmailAccount.id == account_id).first()
        if not account:
            logger.error("EmailAccount %s not found for polling", account_id)
            return 0

        # Decrypt password securely
        try:
            password = decrypt_password(account.encrypted_password)
        except Exception as e:
            logger.error("Failed to decrypt password for email account %s: %s", account_id, e)
            account.sync_status = "error"
            account.sync_error_msg = f"Failed to decrypt app password: {str(e)}"
            self.db.commit()
            return 0

        # Run IMAP connection
        processed = 0
        try:
            logger.info("Connecting to IMAP for %s at %s:%s", account.email_address, account.imap_host, account.imap_port)
            if account.imap_port == 993:
                client = imaplib.IMAP4_SSL(account.imap_host, account.imap_port, timeout=30)
            else:
                client = imaplib.IMAP4(account.imap_host, account.imap_port, timeout=30)
            
            with client:
                client.login(account.email_address, password)
                client.select("INBOX")
                
                # Fetch filters
                active_filter = self.db.query(EmailFilter).filter(EmailFilter.email_account_id == account.id).first()
                
                # Search unseen emails
                _, message_ids = client.search(None, "UNSEEN")
                ids = message_ids[0].split() if message_ids and message_ids[0] else []
                logger.info("Account %s has %s unread messages", account.email_address, len(ids))
                
                for msg_id in ids:
                    logger.info("Fetching message id=%s for account %s", msg_id.decode(), account.email_address)
                    _, data = client.fetch(msg_id, "(RFC822)")
                    if not data or not isinstance(data[0], tuple):
                        continue
                    
                    message = email.message_from_bytes(data[0][1])
                    
                    # Apply keyword / attachment filters
                    sender = email.utils.parseaddr(message.get("From", ""))[1]
                    subject = message.get("Subject") or ""
                    
                    # Check Promotions/Newsletters first
                    if active_filter and active_filter.skip_promotions_tab:
                        labels = message.get("X-Gmail-Labels", "")
                        list_unsubscribe = message.get("List-Unsubscribe", "")
                        precedence = message.get("Precedence", "")
                        if "promotions" in labels.lower() or "category-promo" in labels.lower() or list_unsubscribe or precedence.lower() in ("bulk", "list"):
                            logger.info("Skipping email id=%s because it matches promotions/bulk tab signature", msg_id.decode())
                            continue

                    # Require PDF attachments
                    attachments = self._pdf_attachments(message)
                    if active_filter and active_filter.require_attachment and not attachments:
                        logger.info("Skipping email id=%s because PDF attachment is required but none found", msg_id.decode())
                        continue
                    
                    # Sender keywords filter (comma-separated, case-insensitive)
                    if active_filter and active_filter.sender_keywords:
                        keywords = [kw.strip().lower() for kw in active_filter.sender_keywords.split(",") if kw.strip()]
                        if keywords:
                            matched = any(kw in sender.lower() for kw in keywords)
                            if not matched:
                                logger.info("Skipping email id=%s because sender %s doesn't match sender_keywords", msg_id.decode(), sender)
                                continue
                    
                    # Subject keywords filter (comma-separated, case-insensitive)
                    if active_filter and active_filter.subject_keywords:
                        keywords = [kw.strip().lower() for kw in active_filter.subject_keywords.split(",") if kw.strip()]
                        if keywords:
                            matched = any(kw in subject.lower() for kw in keywords)
                            if not matched:
                                logger.info("Skipping email id=%s because subject %r doesn't match subject_keywords", msg_id.decode(), subject)
                                continue
                    
                    # Process message if we have attachments and matched everything
                    if attachments:
                        processed += self._process_message(message, raw_email_id=msg_id.decode(), tenant_id=account.user_id)
                
                # Update status
                account.sync_status = "ok"
                account.sync_error_msg = None
                account.last_synced_at = datetime.now(UTC)
                self.db.commit()
                logger.info("Successfully finished polling for %s; processed %s", account.email_address, processed)
                
        except Exception as e:
            logger.exception("Error polling account %s", account.email_address)
            account.sync_status = "error"
            account.sync_error_msg = f"IMAP connection failed: {str(e)}"
            self.db.commit()

        return processed
