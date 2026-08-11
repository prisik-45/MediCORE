from types import SimpleNamespace

import httpx

from backend.app.services import email_sender


def make_settings(**overrides):
    values = {
        "resend_api_key": "",
        "resend_from": "",
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_username": "",
        "smtp_password": "",
        "smtp_sender": "noreply@example.com",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_send_email_uses_resend_when_api_key_is_configured(monkeypatch):
    calls = []

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(200, json={"id": "email_123"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(email_sender, "settings", make_settings(resend_api_key="re_test"))
    monkeypatch.setattr(email_sender.httpx, "post", fake_post)

    result = email_sender.send_smtp_email("employee@example.com", "Invite", "<p>Hello</p>")

    assert result is True
    assert calls[0][0] == "https://api.resend.com/emails"
    assert calls[0][1]["json"]["to"] == ["employee@example.com"]
    assert calls[0][1]["json"]["from"] == "noreply@example.com"


def test_send_email_reports_resend_http_failure(monkeypatch):
    def fake_post(url, **kwargs):
        return httpx.Response(403, text="domain not verified", request=httpx.Request("POST", url))

    monkeypatch.setattr(email_sender, "settings", make_settings(resend_api_key="re_test"))
    monkeypatch.setattr(email_sender.httpx, "post", fake_post)

    result = email_sender.send_smtp_email("employee@example.com", "Invite", "<p>Hello</p>")

    assert result is False
