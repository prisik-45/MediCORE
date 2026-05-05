import base64
import email
from email.message import Message

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from backend.app.config import get_settings


class GmailApiClient:
    def __init__(self) -> None:
        settings = get_settings()
        credentials = Credentials(token=settings.gmail_oauth_token)
        self.user_id = settings.gmail_user_id
        self.service = build("gmail", "v1", credentials=credentials, cache_discovery=False)

    def fetch_unread_pdf_messages(self, max_results: int = 10) -> list[tuple[str, Message]]:
        response = (
            self.service.users()
            .messages()
            .list(
                userId=self.user_id,
                q="is:unread has:attachment filename:pdf",
                maxResults=max_results,
            )
            .execute()
        )
        messages = []
        for item in response.get("messages", []):
            message_id = item["id"]
            raw = (
                self.service.users()
                .messages()
                .get(userId=self.user_id, id=message_id, format="raw")
                .execute()
            )
            raw_bytes = base64.urlsafe_b64decode(raw["raw"].encode("utf-8"))
            messages.append((message_id, email.message_from_bytes(raw_bytes)))
        return messages

    def mark_read(self, message_id: str) -> None:
        (
            self.service.users()
            .messages()
            .modify(userId=self.user_id, id=message_id, body={"removeLabelIds": ["UNREAD"]})
            .execute()
        )
