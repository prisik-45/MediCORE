import email
import imaplib
import tempfile
from datetime import UTC, datetime
from email.message import Message
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from backend.app.config import get_settings
from backend.app.db import get_supabase
from backend.app.models import CatalogEmail, CatalogItem, Supplier
from backend.app.services.embeddings import embed_catalog_item_text
from backend.app.services.gmail_api import GmailApiClient
from backend.app.services.llm import GroqClient
from backend.app.services.normalizer import normalize_item
from backend.app.services.pdf_extract import extract_pdf_text


class EmailIngestionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()
        self.llm = GroqClient()

    def poll_imap_inbox(self) -> int:
        if self.settings.email_mode != "imap":
            return 0

        processed = 0
        with imaplib.IMAP4_SSL(self.settings.imap_host, self.settings.imap_port) as client:
            client.login(self.settings.imap_username, self.settings.imap_password)
            client.select(self.settings.imap_mailbox)
            _, message_ids = client.search(None, "UNSEEN")
            for msg_id in message_ids[0].split():
                _, data = client.fetch(msg_id, "(RFC822)")
                if not data or not isinstance(data[0], tuple):
                    continue
                message = email.message_from_bytes(data[0][1])
                processed += self._process_message(message, raw_email_id=msg_id.decode())
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

    def _process_message(self, message: Message, raw_email_id: str) -> int:
        if self._email_exists(raw_email_id):
            return 0

        sender = email.utils.parseaddr(message.get("From", ""))[1]
        subject = message.get("Subject")
        supplier = self._upsert_supplier(sender)
        count = 0

        for attachment_name, pdf_bytes in self._pdf_attachments(message):
            with tempfile.TemporaryDirectory() as tmp_dir:
                pdf_path = Path(tmp_dir) / attachment_name
                pdf_path.write_bytes(pdf_bytes)
                pdf_url = self._upload_pdf(pdf_path, raw_email_id)
                catalog_email = CatalogEmail(
                    id=uuid4(),
                    tenant_id=supplier.tenant_id,
                    supplier_id=supplier.id,
                    raw_email_id=f"{raw_email_id}:{attachment_name}",
                    subject=subject,
                    pdf_url=pdf_url,
                    received_at=datetime.now(UTC),
                    processing_status="processing",
                )
                self.db.add(catalog_email)
                self.db.flush()

                text = extract_pdf_text(pdf_path)
                extracted = [normalize_item(item) for item in self.llm.extract_catalog_items(text)]
                for item in extracted:
                    item_text = (
                        f"{item.normalized_name} {item.ingredient_name} "
                        f"{item.available_qty} {item.unit} {item.price_per_unit} {item.currency}"
                    )
                    self.db.add(
                        CatalogItem(
                            id=uuid4(),
                            tenant_id=supplier.tenant_id,
                            catalog_email_id=catalog_email.id,
                            supplier_id=supplier.id,
                            ingredient_name=item.ingredient_name,
                            normalized_name=item.normalized_name or item.ingredient_name.lower(),
                            price_per_unit=item.price_per_unit,
                            currency=item.currency,
                            available_qty=item.available_qty,
                            unit=item.unit,
                            valid_until=item.valid_until,
                            embedding=embed_catalog_item_text(item_text),
                            raw_payload=item.model_dump(mode="json"),
                        )
                    )
                    count += 1
                catalog_email.processing_status = "completed"
                supplier.last_email_date = catalog_email.received_at
        self.db.commit()
        return count

    def _email_exists(self, raw_email_id: str) -> bool:
        return (
            self.db.query(CatalogEmail)
            .filter(CatalogEmail.raw_email_id.like(f"{raw_email_id}%"))
            .first()
            is not None
        )

    def _upsert_supplier(self, sender: str) -> Supplier:
        domain = sender.split("@")[-1].lower() if "@" in sender else sender.lower()
        supplier = self.db.query(Supplier).filter(Supplier.email_domain == domain).first()
        if supplier:
            return supplier

        supplier = Supplier(
            id=uuid4(),
            tenant_id=uuid4(),
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
