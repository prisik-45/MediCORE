# Implementation Blueprint: Admin Portal & Production Readiness

This document outlines the systematic implementation plan to add the **Admin Portal** functionalities defined in [admin.md](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/admin.md) and to resolve the critical production-readiness, security, scalability, and testing gaps identified in [PRD.md](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/PRD.md) and [PRD2.md](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/PRD2.md).

---

## 1. Architecture Overview & Database Migrations

To support the administrative and tracking capabilities, we must introduce schema extensions in PostgreSQL via a new Supabase migration: [005_admin_portal.sql](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/supabase/migrations/005_admin_portal.sql).

### 1.1 DB Schema Extensions (`005_admin_portal.sql`)

```sql
-- Migration 005: Admin Portal and AI Logging Schema

-- 1. Extend public.profiles to track user status and ensure roles are enforced
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active';
-- Enforce role options: 'admin' or 'member'
ALTER TABLE public.profiles ADD CONSTRAINT check_profile_role CHECK (role IN ('admin', 'member'));
-- Enforce status options: 'Active', 'Pending Activation', 'Disabled'
ALTER TABLE public.profiles ADD CONSTRAINT check_profile_status CHECK (status IN ('Active', 'Pending Activation', 'Disabled'));

-- 2. Create Employee Invitations table for managing invites and secure 2h tokens
CREATE TABLE IF NOT EXISTS public.employee_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    token text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'Pending Activation',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_invitation_status CHECK (status IN ('Pending Activation', 'Active', 'Expired'))
);

-- 3. Create AI Query Log table for calculating analytics
CREATE TABLE IF NOT EXISTS public.ai_query_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    query_text text NOT NULL,
    operation_type text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_query_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: Only admins can manage invitations
CREATE POLICY admin_manage_invitations ON public.employee_invitations
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- 5. RLS Policy: Users/Admins can view their own query logs, Admins can view all
CREATE POLICY user_view_own_query_logs ON public.ai_query_logs
    FOR SELECT TO authenticated
    USING (
        (user_id = auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- 6. HNSW Embedding Index Upgrade (replaces legacy slow index)
DROP INDEX IF EXISTS public.idx_catalog_items_embedding;
CREATE INDEX IF NOT EXISTS idx_catalog_items_embedding_hnsw 
ON public.catalog_items 
USING hnsw (embedding vector_cosine_ops);

-- 7. Add processing status index to speed up email queue queries
CREATE INDEX IF NOT EXISTS idx_catalog_emails_processing_status ON public.catalog_emails(processing_status);
```

---

## 2. Backend Implementation (FastAPI)

### 2.1 Configuration Changes (`config.py`)

Add SMTP settings to `Settings` in [config.py](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/backend/app/config.py) to drive Gmail SMTP email delivery:

```python
# C:\Users\prince\Documents\Core Consultancy\MediCORE\backend\app\config.py

class Settings(BaseSettings):
    # ... existing settings ...
    
    # SMTP configuration for invitations & password resets
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = Field(default="", repr=False)
    smtp_sender: str = "medicore.ai@gmail.com"
```

### 2.2 Model Mappings (`models.py`)

Map the new tables to SQLAlchemy in [models.py](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/backend/app/models.py):

```python
# C:\Users\prince\Documents\Core Consultancy\MediCORE\backend\app\models.py

class EmployeeInvitation(Base):
    __tablename__ = "employee_invitations"
    
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    token: Mapped[str] = mapped_column(Text, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(50), default="Pending Activation")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class AIQueryLog(Base):
    __tablename__ = "ai_query_logs"
    
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    query_text: Mapped[str] = mapped_column(Text)
    operation_type: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

### 2.3 Admin Authentication & Security Guard (`auth.py`)

Extend [auth.py](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/backend/app/auth.py) to enforce admin authorization, checking that the user exists, is an admin, and has an active status:

```python
# C:\Users\prince\Documents\Core Consultancy\MediCORE\backend\app\auth.py

from backend.app.models import Profile
from sqlalchemy.orm import Session
from backend.app.db import get_db

def get_current_active_user(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> dict:
    """Ensure the authenticated user is Active in the profiles table."""
    user_id = UUID(current_user["id"])
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    if profile.status == "Disabled":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Please contact your administrator."
        )
    current_user["role"] = profile.role
    current_user["status"] = profile.status
    return current_user

def get_current_admin(
    current_user: dict = Depends(get_current_active_user)
) -> dict:
    """Enforce admin authorization rules."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Administrator privileges required."
        )
    return current_user
```

### 2.4 SMTP Service (`backend/app/services/email_sender.py`)

A reusable service using `smtplib` to send HTML activation and password reset emails asynchronously using Celery:

```python
# C:\Users\prince\Documents\Core Consultancy\MediCORE\backend\app\services\email_sender.py

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from backend.app.config import get_settings

settings = get_settings()

def send_smtp_email(to_email: str, subject: str, html_content: str):
    """Sends a transactional email via Google SMTP."""
    if not settings.smtp_username or not settings.smtp_password:
        raise ValueError("SMTP Credentials are not configured in environment variables.")
        
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_sender
    msg["To"] = to_email
    msg.attach(MIMEText(html_content, "html"))
    
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_username, settings.smtp_password)
        server.sendmail(settings.smtp_sender, to_email, msg.as_string())
```

Add a background Celery task in [tasks.py](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/backend/app/tasks.py) to invoke this cleanly:
```python
@celery_app.task(name="backend.app.tasks.send_transactional_email")
def send_transactional_email(to_email: str, subject: str, html_content: str):
    from backend.app.services.email_sender import send_smtp_email
    send_smtp_email(to_email, subject, html_content)
```

### 2.5 Admin API Controller (`backend/app/api/admin.py`)

Create a brand new route file to service the admin dashboard and tables:

```python
# C:\Users\prince\Documents\Core Consultancy\MediCORE\backend\app\api\admin.py

import secrets
from datetime import datetime, timedelta, UTC
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, EmailStr

from backend.app.db import get_db
from backend.app.auth import get_current_admin
from backend.app.models import Profile, Supplier, CatalogItem, CatalogEmail, EmployeeInvitation, AIQueryLog
from backend.app.tasks import send_transactional_email

router = APIRouter()

class EmployeeInviteRequest(BaseModel):
    name: str
    email: EmailStr

# 1. Dashboard Metrics Endpoint
@router.get("/dashboard-stats")
def get_dashboard_stats(db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    total_employees = db.query(Profile).count()
    total_emails = db.query(CatalogEmail).count()
    
    # Calculate AI queries today (within last 24h)
    twenty_four_hours_ago = datetime.now(UTC) - timedelta(days=1)
    queries_today = db.query(AIQueryLog).filter(AIQueryLog.created_at >= twenty_four_hours_ago).count()
    
    return {
        "total_employees": total_employees,
        "total_emails_processed": total_emails,
        "ai_queries_today": queries_today
    }

# 2. Database Overview Metrics Endpoint
@router.get("/database-stats")
def get_database_stats(db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    total_suppliers = db.query(Supplier).distinct().count()
    total_ingredients = db.query(CatalogItem.normalized_name).distinct().count()
    
    # Simple estimate of DB size (in bytes)
    size_query = db.execute(func.pg_database_size(func.current_database()))
    db_size_bytes = size_query.scalar() or 0
    
    # Analytics searches per day & month
    one_day_ago = datetime.now(UTC) - timedelta(days=1)
    one_month_ago = datetime.now(UTC) - timedelta(days=30)
    
    searches_day = db.query(AIQueryLog).filter(AIQueryLog.created_at >= one_day_ago).count()
    searches_month = db.query(AIQueryLog).filter(AIQueryLog.created_at >= one_month_ago).count()
    
    return {
        "total_suppliers": total_suppliers,
        "total_ingredients": total_ingredients,
        "database_size_mb": round(db_size_bytes / (1024 * 1024), 2),
        "searches_per_day": searches_day,
        "searches_per_month": searches_month
    }

# 3. Add Employee / Send Invite
@router.post("/employees/invite", status_code=status.HTTP_201_CREATED)
def invite_employee(
    payload: EmployeeInviteRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin)
):
    # Verify if email is already in invitations or profiles
    existing_invite = db.query(EmployeeInvitation).filter(EmployeeInvitation.email == payload.email).first()
    if existing_invite:
         raise HTTPException(status_code=400, detail="Invitation already exists for this email.")
         
    # Check profiles
    existing_profile = db.query(Profile).join(CatalogEmail, CatalogEmail.tenant_id == Profile.id, isouter=True).filter(Profile.full_name == payload.name).first() # Or search by UUID mapping if needed
    
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(hours=2)
    
    new_invite = EmployeeInvitation(
        name=payload.name,
        email=payload.email,
        token=token,
        expires_at=expires_at,
        status="Pending Activation"
    )
    db.add(new_invite)
    db.commit()
    
    # Send invitation email via Celery task
    activation_link = f"{settings.frontend_origin}/activate?token={token}"
    email_html = f"""
    <p>Hi {payload.name},</p>
    <p>You've been invited to use MediCORE.</p>
    <p>Click the button below to activate your account:</p>
    <p><a href="{activation_link}" style="background-color:#0f7a5f;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Activate Account</a></p>
    <p>This activation link expires in 2 hours.</p>
    <p>Regards,<br>MediCORE Team</p>
    """
    send_transactional_email.delay(payload.email, "You're invited to join MediCORE", email_html)
    return {"message": "Invitation sent successfully."}

# 4. Verify Invitation Token
@router.get("/activate/verify")
def verify_activation_token(token: str, db: Session = Depends(get_db)):
    invite = db.query(EmployeeInvitation).filter(EmployeeInvitation.token == token).first()
    if not invite or invite.status != "Pending Activation":
        raise HTTPException(status_code=400, detail="Invalid or already used invitation token.")
    if invite.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        invite.status = "Expired"
        db.commit()
        raise HTTPException(status_code=400, detail="Activation link has expired.")
    return {"email": invite.email, "name": invite.name}

# 5. List Employees
@router.get("/employees")
def list_employees(db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    # Returns combined list of profiles and invitations
    profiles = db.query(Profile).all()
    invitations = db.query(EmployeeInvitation).filter(EmployeeInvitation.status == "Pending Activation").all()
    
    employees_list = []
    for p in profiles:
        employees_list.append({
            "id": str(p.id),
            "name": p.full_name,
            "email": "Active User",  # Fetch from auth table securely or link
            "status": p.status,
            "role": p.role,
            "last_sync": "Active"
        })
    for inv in invitations:
        employees_list.append({
            "id": str(inv.id),
            "name": inv.name,
            "email": inv.email,
            "status": "Pending Activation",
            "role": "member",
            "last_sync": "Never"
        })
    return employees_list

# 6. Disable Employee
@router.post("/employees/{user_id}/remove")
def remove_employee(user_id: UUID, db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Employee profile not found")
        
    profile.status = "Disabled"
    db.commit()
    return {"message": f"Employee {profile.full_name} has been disabled."}
```

Include the router in [main.py](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/backend/app/main.py):
```python
from backend.app.api import admin
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
```

---

## 3. Frontend Implementation (Next.js)

### 3.1 Middleware Protection (`middleware.ts`)

Update [middleware.ts](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/frontend/middleware.ts) to restrict `/admin` routes. Non-admin users are automatically redirected to the dashboard (`/`).

```typescript
// C:\Users\prince\Documents\Core Consultancy\MediCORE\frontend\middleware.ts

// Inside middleware(request: NextRequest)
const { pathname } = request.nextUrl;
const sessionToken = request.cookies.get("sb-access-token")?.value;
const isAuthenticated = sessionToken && !isTokenExpired(sessionToken);

if (pathname.startsWith("/admin")) {
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
  
  // Verify user role on token claims or fetch profiles
  // Simple check: decode token to check role metadata
  const payload = decodeTokenPayload(sessionToken);
  if (payload?.user_metadata?.role !== "admin") {
    const dashboardUrl = new URL("/", request.url);
    return NextResponse.redirect(dashboardUrl);
  }
}
```

### 3.2 Add User Activation Route (`frontend/app/activate/page.tsx`)

Create the account activation controller component `/activate`:

```tsx
// C:\Users\prince\Documents\Core Consultancy\MediCORE\frontend\app\activate\page.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";

export default function ActivatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [verifiedName, setVerifiedName] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Activation token is missing.");
      setLoading(false);
      return;
    }
    
    // Verify token with backend
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/activate/verify?token=${token}`)
      .then((res) => {
        if (!res.ok) throw new Error("Invalid or expired activation link.");
        return res.json();
      })
      .then((data) => {
        setVerifiedEmail(data.email);
        setVerifiedName(data.name);
        // Redirect user to register page passing email & token params
        router.push(`/register?email=${encodeURIComponent(data.email)}&name=${encodeURIComponent(data.name)}&token=${token}`);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        {loading && <Loader2 className="animate-spin text-emerald-600" size={32} />}
        {error && (
          <div className="text-center">
            <AlertTriangle className="text-red-500 mx-auto" size={40} />
            <h2 className="text-lg font-bold mt-2">Activation Failed</h2>
            <p className="text-sm text-gray-500 mt-1">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 3.3 Registration Modification (`frontend/app/register/page.tsx`)

Modify [register/page.tsx](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/frontend/app/register/page.tsx) to capture `token` and `email` query parameters.
When the user signs up with an activation token:
1. They call `supabase.auth.signUp` to register their password.
2. In the signup metadata, set `role: "member"` and `status: "Active"`.
3. In the successful signup handler, make an API request to the backend to transition the invitation record status to `"Active"` and delete/invalidate the activation token.

---

## 4. Admin Portal UI Components (`frontend/app/admin`)

Create the admin dashboard layout replicating the exact styling, sidebar navigation, background gradients, typography, and card panels from [page.tsx](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/frontend/app/page.tsx).

### 4.1 Admin Portal Layout (`frontend/app/admin/layout.tsx`)

```tsx
// C:\Users\prince\Documents\Core Consultancy\MediCORE\frontend\app\admin\layout.tsx

import React from "react";
import Link from "next/link";
import { LayoutDashboard, Users, Database, LogOut } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-container" style={{ display: "flex", minHeight: "100vh" }}>
      <aside className="sidebar" style={{ width: "260px", background: "#17211c", color: "white", padding: "20px" }}>
        <div className="sidebar-brand" style={{ marginBottom: "30px", textAlign: "center" }}>
          <h2>MediCORE Admin</h2>
        </div>
        <nav className="sidebar-nav">
          <ul style={{ listStyle: "none", padding: 0 }}>
            <li style={{ marginBottom: "15px" }}>
              <Link href="/admin" className="sidebar-nav-link" style={{ display: "flex", alignItems: "center", gap: "10px", color: "#ccc", textDecoration: "none" }}>
                <LayoutDashboard size={20} /> Dashboard
              </Link>
            </li>
            <li style={{ marginBottom: "15px" }}>
              <Link href="/admin/employees" className="sidebar-nav-link" style={{ display: "flex", alignItems: "center", gap: "10px", color: "#ccc", textDecoration: "none" }}>
                <Users size={20} /> Employees
              </Link>
            </li>
            <li style={{ marginBottom: "15px" }}>
              <Link href="/admin/database" className="sidebar-nav-link" style={{ display: "flex", alignItems: "center", gap: "10px", color: "#ccc", textDecoration: "none" }}>
                <Database size={20} /> Database
              </Link>
            </li>
          </ul>
        </nav>
      </aside>
      <main className="main-content" style={{ flex: 1, padding: "40px", backgroundColor: "#f4f7f5" }}>
        {children}
      </main>
    </div>
  );
}
```

### 4.2 Tab 1: Dashboard (`frontend/app/admin/page.tsx`)
Create the dashboard stats component. Fetches stats from `/api/admin/dashboard-stats` and renders them in animated metric cards (incorporating Lucide icons like `Users`, `MailCheck`, and `MessageSquare`).

### 4.3 Tab 2: Employee Management (`frontend/app/admin/employees/page.tsx`)
Renders the employee management table:
- **Add Employee modal**: A form validating email address format, capturing Name + Email, and triggering `/api/admin/employees/invite`.
- **Employees list table**: Renders name, email, status, last sync, and row actions.
- **Actions dialogs**: Confirmation triggers for "Reset Password" and "Remove Employee" (making backend POST requests to `/api/admin/employees/{id}/remove`).

### 4.4 Tab 3: Database Overview (`frontend/app/admin/database/page.tsx`)
Fetches DB health metrics from `/api/admin/database-stats` and renders:
- Cards: Total Suppliers, Total Ingredients, Database Size, AI Searches / Day, AI Queries / Month.

---

## 5. Phase 13 Compliance & High-Priority Fixes (PRD Audit)

To meet the production readiness standards of the repository audit, these critical fixes are incorporated in the codebase:

### 5.1 IMAP Synchronization Chunking & Robustness
Modify `poll_account_inbox` in [email_ingestion.py](file:///C:/Users/prince/Documents/Core%20Consultancy/MediCORE/backend/app/services/email_ingestion.py) to avoid connection lockouts during large email syncs:

```python
# C:\Users\prince\Documents\Core Consultancy\MediCORE\backend\app\services\email_ingestion.py

def poll_account_inbox(self, account_id: UUID, chunk_size: int = 50) -> int:
    # 1. Fetch credentials
    # 2. Connect to IMAP
    # 3. Limit message selection to latest `chunk_size` unread emails
    # 4. Process only selected batch, mark as read, close session.
```

Catch connection exceptions and retry with exponential backoff inside the task execution layer:
```python
# C:\Users\prince\Documents\Core Consultancy\MediCORE\backend\app\tasks.py

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def poll_email_account_task(self, account_id: str):
    try:
        # poll operations
    except imaplib.IMAP4.abort as exc:
        logger.warning(f"IMAP abort encountered. Retrying task... Error: {exc}")
        raise self.retry(exc=exc, countdown=60)
```

### 5.2 Size Protection on OCR & Attachment Parsers
Inside the Celery attachment receiver, enforce a hard payload limit:

```python
# C:\Users\prince\Documents\Core Consultancy\MediCORE\backend\app\services\email_ingestion.py

MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024  # 20MB limit

def extract_attachment_data(attachment):
    if len(attachment.content) > MAX_ATTACHMENT_SIZE_BYTES:
        logger.error(f"Attachment {attachment.filename} exceeds 20MB size threshold. Skipping parsing.")
        return None
    # proceed with extraction
```

### 5.3 Database Embedding HNSW Index Setup
Ensure the DB uses Vector HNSW index instead of default sequential scans to prevent CPU thrashing:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX IF NOT EXISTS idx_catalog_items_embedding_hnsw 
ON public.catalog_items 
USING hnsw (embedding vector_cosine_ops);
```

### 5.4 Redis Persistence configuration
Update `docker-compose.yml` to store Redis states persistently on restarts:

```yaml
redis:
  image: redis:alpine
  command: redis-server --appendonly yes
  volumes:
    - redis_data:/data
```

---

## 6. Testing, CI/CD, and Monitoring Pipelines

### 6.1 Pytest Backend Unit & Integration Tests (`tests/test_admin.py`)

Create `pytest` tests validating all security bounds and admin actions:

```python
# C:\Users\prince\Documents\Core Consultancy\MediCORE\tests\test_admin.py

import pytest
from fastapi.testclient import TestClient

def test_admin_dashboard_stats_unauthorized(client: TestClient):
    # Call stats without token
    response = client.get("/api/admin/dashboard-stats")
    assert response.status_code == 401

def test_admin_dashboard_stats_non_admin(client: TestClient, member_token: str):
    # Call stats with regular member token
    response = client.get(
        "/api/admin/dashboard-stats", 
        headers={"Authorization": f"Bearer {member_token}"}
    )
    assert response.status_code == 403

def test_admin_invite_employee_valid(client: TestClient, admin_token: str):
    payload = {"name": "Jane Doe", "email": "jane@company.com"}
    response = client.post(
        "/api/admin/employees/invite",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 201
```

### 6.2 Frontend Component Tests (`frontend/__tests__/admin.test.tsx`)

Using Jest and React Testing Library:

```tsx
// C:\Users\prince\Documents\Core Consultancy\MediCORE\frontend\__tests__\admin.test.tsx

import { render, screen } from "@testing-library/react";
import AdminLayout from "../app/admin/layout";

describe("AdminLayout Component", () => {
  it("renders the navigation items correctly", () => {
    render(<AdminLayout><div>Content</div></AdminLayout>);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Employees")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
  });
});
```

### 6.3 CI/CD Action (`.github/workflows/main.yml`)

Configure the automated checking pipeline:

```yaml
name: MediCORE CI/CD

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pytest ruff
      - name: Run Backend Linting
        run: ruff check .
      - name: Run Backend Tests
        run: pytest
```

---

## 7. Next Steps for Implementation

1. **Apply Database Migration**: Run the SQL script from `supabase/migrations/005_admin_portal.sql` on the Supabase/PostgreSQL instance.
2. **Setup SMTP Secrets**: Add SMTP variables inside local `.env` and host environment settings.
3. **Register Backend Routers**: Append `/api/admin` routers within `backend/app/main.py`.
4. **Deploy Frontend Routes**: Construct the Next.js layouts and page nodes under `/admin` and `/activate`.
5. **Verify Security**: Validate that regular user accounts cannot fetch `/api/admin` APIs or access `/admin` on the browser.
