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


def get_supplier_domain(sender: str) -> str:
    if "@" not in sender:
        return sender.lower()
    local_part, domain = sender.split("@", 1)
    domain = domain.lower()
    generic_domains = {
        "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
        "mail.com", "protonmail.com", "proton.me", "icloud.com", "zoho.com",
        "gmx.com", "yandex.com", "live.com"
    }
    if domain in generic_domains:
        return sender.lower()
    return domain


class EmailIngestionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()
        self.llm = GroqClient()

    def _extract_sender(self, message: Message) -> tuple[str, str]:
        from_header = message.get("From", "")
        from email.header import decode_header
        try:
            decoded_parts = decode_header(from_header)
            decoded_from = []
            for part, encoding in decoded_parts:
                if isinstance(part, bytes):
                    decoded_from.append(part.decode(encoding or "utf-8", errors="ignore"))
                else:
                    decoded_from.append(part)
            from_header_str = "".join(decoded_from)
        except Exception:
            from_header_str = from_header

        sender_pair = email.utils.parseaddr(from_header_str)
        display_name = sender_pair[0]
        sender = sender_pair[1]

        # Clean up display name
        if display_name:
            display_name = display_name.strip().strip('"').strip("'").strip()
            display_name = " ".join(display_name.split())

        # Check body for forwarded sender pattern if display name is empty or matches email
        body_text = self._get_email_body_text(message)
        if (not display_name or display_name.lower() == sender.lower()) and body_text:
            import re
            body_match = re.search(r"(?mi)^\s*(?:from|From):\s*([^\n<]+)<([^>@]+@[^>]+)>", body_text)
            if body_match:
                body_name = body_match.group(1).strip().strip('"').strip("'").strip()
                body_email = body_match.group(2).strip()
                if body_name:
                    display_name = body_name
                    if "@" in body_email:
                        sender = body_email

        return display_name, sender

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
                attachments = [att["filename"] for att in self._collect_attachments(message)]
                if attachments:
                    display_name, sender = self._extract_sender(message)
                    pdf_messages.append(
                        {
                            "raw_email_id": msg_id.decode(),
                            "from": display_name or sender,
                            "email": sender,
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

    def _process_message(self, message: Message, raw_email_id: str, parse_targets: list[dict] | None = None, tenant_id: Any | None = None) -> int:
        if self._email_has_items(raw_email_id):
            logger.info("Skipping already-extracted email id=%s", raw_email_id)
            return 0

        display_name, sender = self._extract_sender(message)
            
        subject = message.get("Subject")
        
        if parse_targets is None:
            attachments = self._collect_attachments(message)
            body_text = self._get_email_body_text(message)
            parse_targets = []
            for att in attachments:
                parse_targets.append({
                    "name": att["filename"],
                    "payload": att["payload"],
                    "ext": att["ext"],
                    "mime_type": att["mime_type"],
                    "is_body": False
                })
            if not parse_targets and body_text.strip():
                parse_targets.append({
                    "name": "email_body.txt",
                    "payload": body_text.encode("utf-8"),
                    "ext": ".txt",
                    "mime_type": "text/plain",
                    "is_body": True
                })

        logger.info("Processing email id=%s from=%s subject=%r parse_targets=%s", raw_email_id, sender, subject, len(parse_targets))
        if not parse_targets:
            return 0

        supplier = self._upsert_supplier(sender, display_name=display_name, tenant_id=tenant_id)
        count = 0

        for target in parse_targets:
            target_name = target["name"]
            payload = target["payload"]
            ext = target["ext"]
            mime_type = target["mime_type"]
            
            logger.info("Processing target %s (%s bytes)", target_name, len(payload))
            with tempfile.TemporaryDirectory() as tmp_dir:
                file_path = Path(tmp_dir) / target_name
                file_path.write_bytes(payload)
                attachment_email_id = f"{raw_email_id}:{target_name}"
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
                        catalog_email.pdf_url = self._upload_file(file_path, raw_email_id, mime_type)
                else:
                    pdf_url = self._upload_file(file_path, raw_email_id, mime_type)
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

                text = self._extract_text_from_file(file_path, ext)
                logger.info("Extracted %s characters of text from %s", len(text), target_name)
                extracted = self._extract_items_from_text(text, target_name)
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
            logger.info("Reprocessing stored attachment for email id=%s", catalog_email.raw_email_id)
            with tempfile.TemporaryDirectory() as tmp_dir:
                attachment_name = catalog_email.raw_email_id.split(":")[-1]
                ext = Path(attachment_name.lower()).suffix if ":" in catalog_email.raw_email_id else ".pdf"
                if not ext:
                    ext = ".pdf"
                file_path = Path(tmp_dir) / f"{catalog_email.id}{ext}"
                response = httpx.get(catalog_email.pdf_url, timeout=60)
                response.raise_for_status()
                file_path.write_bytes(response.content)
                catalog_email.processing_status = "processing"
                if force:
                    self.db.query(CatalogItem).filter(
                        CatalogItem.catalog_email_id == catalog_email.id
                    ).delete(synchronize_session=False)
                
                text = self._extract_text_from_file(file_path, ext)
                logger.info("Extracted %s characters while reprocessing email id=%s", len(text), catalog_email.raw_email_id)
                extracted = self._extract_items_from_text(text, str(catalog_email.id))
                processed += self._store_catalog_items(catalog_email, supplier, extracted, text, tenant_id=catalog_email.tenant_id)
                catalog_email.processing_status = "completed"
                self._touch_supplier_last_email(supplier, catalog_email.received_at)
        self.db.commit()
        logger.info("Reprocessed %s catalogue item(s) from stored attachments", processed)
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
                    lead_time_days=item.lead_time_days,
                    moq=item.moq,
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

    def _upsert_supplier(self, sender: str, display_name: str | None = None, tenant_id: Any | None = None) -> Supplier:
        domain = get_supplier_domain(sender)
        if tenant_id:
            supplier = self.db.query(Supplier).filter(
                Supplier.email_domain == domain,
                Supplier.tenant_id == tenant_id
            ).first()
        else:
            supplier = self.db.query(Supplier).filter(Supplier.email_domain == domain).first()

        cleaned_display_name = display_name.strip() if display_name else None

        if supplier:
            if cleaned_display_name and supplier.name != cleaned_display_name:
                supplier.name = cleaned_display_name
                self.db.add(supplier)
            return supplier

        if cleaned_display_name:
            supplier_name = cleaned_display_name
        else:
            # Check if domain is a generic domain
            generic_domains = {
                "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
                "mail.com", "protonmail.com", "proton.me", "icloud.com", "zoho.com",
                "gmx.com", "yandex.com", "live.com"
            }
            email_domain_part = sender.split("@")[1].lower() if "@" in sender else domain
            
            if email_domain_part in generic_domains:
                # Use the full email address, don't format the name from the email ID
                supplier_name = sender
            else:
                # Custom domain: format the domain name prefix
                domain_prefix = email_domain_part.split(".")[0]
                supplier_name = domain_prefix.replace("-", " ").replace(".", " ").title()

        supplier = Supplier(
            id=uuid4(),
            tenant_id=tenant_id or uuid4(),
            name=supplier_name,
            email_domain=domain,
        )
        self.db.add(supplier)
        self.db.flush()
        return supplier

    def _collect_attachments(self, message: Message) -> list[dict]:
        attachments = []
        for part in message.walk():
            filename = part.get_filename()
            if not filename:
                continue

            # Decode file name if encoded
            from email.header import decode_header
            try:
                decoded = decode_header(filename)
                filename = "".join(
                    [
                        t[0].decode(t[1] or "utf-8", errors="ignore") if isinstance(t[0], bytes) else t[0]
                        for t in decoded
                    ]
                )
            except Exception:
                pass

            filename_lower = filename.lower()
            file_ext = Path(filename_lower).suffix
            supported_exts = (".pdf", ".docx", ".doc", ".xlsx", ".xls", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".txt", ".csv")
            if not file_ext or file_ext not in supported_exts:
                continue

            payload = part.get_payload(decode=True)
            if not payload:
                continue

            mime_type = part.get_content_type()
            attachments.append({
                "filename": filename,
                "payload": payload,
                "ext": file_ext,
                "mime_type": mime_type
            })
        return attachments

    def _get_email_body_text(self, message: Message) -> str:
        body = ""
        if message.is_multipart():
            for part in message.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("Content-Disposition"))
                if content_type == "text/plain" and "attachment" not in content_disposition:
                    payload = part.get_payload(decode=True)
                    if payload:
                        body += payload.decode(errors="ignore")
        else:
            payload = message.get_payload(decode=True)
            if payload:
                body += payload.decode(errors="ignore")
        return body.strip()

    def _extract_docx_text(self, file_path: Path) -> str:
        import zipfile
        import xml.etree.ElementTree as ET
        try:
            with zipfile.ZipFile(file_path) as docx:
                xml_content = docx.read('word/document.xml')
                root = ET.fromstring(xml_content)
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                text_nodes = root.findall('.//w:t', ns)
                return "\n".join(node.text for node in text_nodes if node.text)
        except Exception as e:
            logger.exception("Error extracting text from docx file %s: %s", file_path.name, e)
            return ""

    def _extract_image_text(self, file_path: Path) -> str:
        from PIL import Image
        try:
            import pytesseract
        except ImportError:
            pytesseract = None

        if pytesseract is None:
            logger.warning("pytesseract is not installed; skipping image OCR for %s", file_path.name)
            return ""

        try:
            image = Image.open(file_path)
            text = pytesseract.image_to_string(image)
            logger.info("OCR extracted %s characters from image %s", len(text), file_path.name)
            return text
        except Exception as e:
            logger.exception("Error doing OCR on image %s: %s", file_path.name, e)
            return ""

    def _extract_text_from_file(self, file_path: Path, ext: str) -> str:
        if ext == ".pdf":
            from backend.app.services.pdf_extract import extract_pdf_text
            return extract_pdf_text(file_path)

        elif ext in (".docx", ".doc", ".xlsx", ".xls"):
            try:
                from markitdown import MarkItDown
                md = MarkItDown()
                result = md.convert(str(file_path))
                return result.markdown
            except Exception as e:
                logger.exception("Error extracting text using markitdown from %s: %s", file_path.name, e)
                if ext == ".docx":
                    return self._extract_docx_text(file_path)
                return ""

        elif ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"):
            return self._extract_image_text(file_path)

        elif ext in (".txt", ".csv"):
            try:
                return file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                return ""
        return ""

    def _upload_file(self, file_path: Path, raw_email_id: str, mime_type: str) -> str:
        object_path = f"{raw_email_id}/{file_path.name}"
        supabase = get_supabase()
        supabase.storage.from_(self.settings.supabase_storage_bucket).upload(
            object_path,
            file_path.read_bytes(),
            {"content-type": mime_type, "upsert": "true"},
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

                # Fetch filters and global sync settings
                active_filter = self.db.query(EmailFilter).filter(EmailFilter.email_account_id == account.id).first()
                from backend.app.models import EmailSyncSetting
                sync_setting = self.db.query(EmailSyncSetting).filter(EmailSyncSetting.user_id == account.user_id).first()
                approach = sync_setting.ingestion_approach if sync_setting else "approach_2"

                mailbox = "INBOX"
                search_criteria = "UNSEEN"
                use_uid_commands = False
                if approach == "approach_1":
                    search_criteria = "ALL"
                    use_uid_commands = True
                    matched_mailbox = None
                    try:
                        status, mailboxes = client.list()
                        if status == "OK":
                            for mb in mailboxes:
                                mb_str = mb.decode("utf-8", errors="ignore")
                                import re
                                match = re.search(r'"([^"]+)"\s*$', mb_str)
                                if not match:
                                    mb_name = mb_str.split()[-1]
                                else:
                                    mb_name = match.group(1)
                                
                                mb_name_lower = mb_name.strip().lower()
                                if mb_name_lower in ("supplier", "suppliers") or mb_name_lower.endswith("/supplier") or mb_name_lower.endswith("/suppliers"):
                                    matched_mailbox = mb_name.strip()
                                    break
                    except Exception as e:
                        logger.warning("Error listing mailboxes: %s", e)

                    if matched_mailbox:
                        mailbox = matched_mailbox
                        logger.info("Found matching supplier mailbox: %s", mailbox)
                    else:
                        mailbox = "suppliers"

                try:
                    client.select(mailbox)
                except imaplib.IMAP4.error:
                    if approach == "approach_1":
                        fallbacks = ["suppliers", "supplier"]
                        selected = False
                        for fb in fallbacks:
                            if fb == mailbox:
                                continue
                            try:
                                client.select(fb)
                                logger.warning("Mailbox %s selection failed. Fell back to %s", mailbox, fb)
                                mailbox = fb
                                selected = True
                                break
                            except imaplib.IMAP4.error:
                                pass
                        if not selected:
                            raise RuntimeError(
                                "Supplier label mailbox not found. Create or enable the Gmail IMAP label named 'suppliers'."
                            )
                    elif mailbox != "INBOX":
                        fallbacks = ["INBOX"]
                        selected = False
                        for fb in fallbacks:
                            try:
                                client.select(fb)
                                logger.warning("Mailbox %s selection failed. Fell back to %s", mailbox, fb)
                                mailbox = fb
                                selected = True
                                break
                            except imaplib.IMAP4.error:
                                pass
                        if not selected:
                            raise
                    else:
                        raise

                # Search emails
                if use_uid_commands:
                    _, message_ids = client.uid("search", None, search_criteria)
                else:
                    _, message_ids = client.search(None, search_criteria)
                ids = message_ids[0].split() if message_ids and message_ids[0] else []
                # Process newest first
                ids.reverse()
                logger.info("Account %s has %s messages in %s (criteria: %s)", account.email_address, len(ids), mailbox, search_criteria)

                # Fetch already processed email IDs cache to optimize DB lookup
                processed_email_ids = set()
                from backend.app.models import CatalogEmail
                res = self.db.query(CatalogEmail.raw_email_id).filter(CatalogEmail.tenant_id == account.user_id).all()
                for r in res:
                    raw_stored_id = r[0]
                    account_prefix = f"{account.id}:"
                    if raw_stored_id.startswith(account_prefix):
                        parts = raw_stored_id.split(":")
                        base_id = ":".join(parts[:3]) if len(parts) >= 3 else raw_stored_id
                    else:
                        base_id = raw_stored_id.split(":")[0] if ":" in raw_stored_id else raw_stored_id
                    processed_email_ids.add(base_id)

                for msg_id in ids:
                    msg_id_str = msg_id.decode()
                    raw_id_str = f"{account.id}:{mailbox}:{msg_id_str}" if use_uid_commands else msg_id_str
                    if raw_id_str in processed_email_ids:
                        continue

                    logger.info("Fetching message id=%s for account %s", raw_id_str, account.email_address)
                    if use_uid_commands:
                        _, data = client.uid("fetch", msg_id, "(BODY.PEEK[])")
                    else:
                        _, data = client.fetch(msg_id, "(BODY.PEEK[])")
                    if not data or not isinstance(data[0], tuple):
                        continue

                    message = email.message_from_bytes(data[0][1])

                    # Apply keyword / attachment filters
                    display_name, sender = self._extract_sender(message)
                    subject = message.get("Subject") or ""

                    # Check Promotions/Newsletters first
                    if active_filter and active_filter.skip_promotions_tab:
                        labels = message.get("X-Gmail-Labels", "")
                        list_unsubscribe = message.get("List-Unsubscribe", "")
                        precedence = message.get("Precedence", "")
                        if "promotions" in labels.lower() or "category-promo" in labels.lower() or list_unsubscribe or precedence.lower() in ("bulk", "list"):
                            logger.info("Skipping email id=%s because it matches promotions/bulk tab signature", raw_id_str)
                            if use_uid_commands:
                                client.uid("store", msg_id, "+FLAGS", "\\Seen")
                            else:
                                client.store(msg_id, "+FLAGS", "\\Seen")
                            continue

                    # Collect all attachments and email body text
                    attachments = self._collect_attachments(message)
                    body_text = self._get_email_body_text(message)

                    # Build parse targets
                    parse_targets = []
                    for att in attachments:
                        parse_targets.append({
                            "name": att["filename"],
                            "payload": att["payload"],
                            "ext": att["ext"],
                            "mime_type": att["mime_type"],
                            "is_body": False
                        })

                    if not parse_targets and body_text.strip():
                        parse_targets.append({
                            "name": "email_body.txt",
                            "payload": body_text.encode("utf-8"),
                            "ext": ".txt",
                            "mime_type": "text/plain",
                            "is_body": True
                        })

                    # Filter: Require attachment
                    if active_filter and active_filter.require_attachment and not attachments:
                        logger.info("Skipping email id=%s because attachment is required but none found", raw_id_str)
                        if use_uid_commands:
                            client.uid("store", msg_id, "+FLAGS", "\\Seen")
                        else:
                            client.store(msg_id, "+FLAGS", "\\Seen")
                        continue

                    # Check Ingestion Approach 2
                    if approach == "approach_2" and sync_setting:
                        domain = get_supplier_domain(sender)
                        trusted_list = [t.strip().lower() for t in sync_setting.trusted_suppliers.split(",") if t.strip()]

                        is_trusted = (sender.lower() in trusted_list) or (domain in trusted_list)
                        if not is_trusted:
                            # Check if subject/body matches keywords
                            keywords = [k.strip().lower() for k in sync_setting.keyword_filters.split(",") if k.strip()]
                            subject_lower = subject.lower()
                            body_lower = body_text.lower()

                            matches_keywords = any(k in subject_lower for k in keywords) or any(k in body_lower for k in keywords)

                            if matches_keywords and parse_targets:
                                # New supplier alert! Add to pending_approvals and DO NOT mark read
                                import json
                                try:
                                    pending_list = json.loads(sync_setting.pending_approvals or "[]")
                                except Exception:
                                    pending_list = []

                                if not any(item["email_id"] == raw_id_str for item in pending_list):
                                    pending_list.append({
                                        "email_id": raw_id_str,
                                        "sender": sender,
                                        "supplier_name": display_name or sender,
                                        "subject": subject,
                                        "date": datetime.now(UTC).isoformat()
                                    })
                                    sync_setting.pending_approvals = json.dumps(pending_list)
                                    self.db.commit()
                                    logger.info("Added email id=%s to pending_approvals for %s", raw_id_str, sender)
                                continue
                            else:
                                # Doesn't match keywords or has no supported content, skip and mark as seen
                                logger.info("Skipping non-supplier email id=%s from=%s subject=%r", raw_id_str, sender, subject)
                                if use_uid_commands:
                                    client.uid("store", msg_id, "+FLAGS", "\\Seen")
                                else:
                                    client.store(msg_id, "+FLAGS", "\\Seen")
                                continue

                    # Process message if we have parse targets and matched everything
                    if parse_targets:
                        processed += self._process_message(message, raw_email_id=raw_id_str, parse_targets=parse_targets, tenant_id=account.user_id)
                        if use_uid_commands:
                            client.uid("store", msg_id, "+FLAGS", "\\Seen")
                        else:
                            client.store(msg_id, "+FLAGS", "\\Seen")

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

