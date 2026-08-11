import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException, status

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app.api import admin


class FakeQuery:
    def __init__(self, first_value=None):
        self.first_value = first_value

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.first_value


def make_invite_payload():
    return admin.EmployeeInviteRequest(name="Procurement User", email="procurement@cnspharma.com")


def make_current_admin():
    admin_id = uuid4()
    return {
        "id": str(admin_id),
        "tenant_id": str(admin_id),
        "email": "admin@example.com",
    }


def test_invite_employee_returns_error_and_rolls_back_when_smtp_fails(monkeypatch):
    db = MagicMock()
    db.query.side_effect = [
        FakeQuery(None),
        FakeQuery(SimpleNamespace(organisation="CNS Pharma")),
    ]
    monkeypatch.setattr(admin, "send_smtp_email", lambda *args, **kwargs: False)

    with pytest.raises(HTTPException) as exc:
        admin.invite_employee(make_invite_payload(), db=db, current_user=make_current_admin())

    assert exc.value.status_code == status.HTTP_502_BAD_GATEWAY
    assert "Invitation email could not be sent" in exc.value.detail
    db.flush.assert_called_once()
    db.rollback.assert_called_once()
    db.commit.assert_not_called()


def test_invite_employee_commits_after_smtp_success(monkeypatch):
    db = MagicMock()
    db.query.side_effect = [
        FakeQuery(None),
        FakeQuery(SimpleNamespace(organisation="CNS Pharma")),
    ]
    monkeypatch.setattr(admin, "send_smtp_email", lambda *args, **kwargs: True)

    result = admin.invite_employee(make_invite_payload(), db=db, current_user=make_current_admin())

    assert result == {"message": "Invitation sent successfully."}
    db.flush.assert_called_once()
    db.commit.assert_called_once()
    db.rollback.assert_not_called()
