# Product Requirements Document (PRD)
## Focus: Testing, Validation, and Production Readiness
**Project**: MediCORE

---

## 1. Introduction
This document outlines the testing, validation, and production readiness requirements for the MediCORE platform. A review of the current codebase reveals a functional implementation of catalog email ingestion, natural language search, and frontend presentation, but a noticeable absence of automated testing and formalized production deployment protocols. This PRD provides a roadmap to stabilize, test, and prepare the system for reliable production use.

## 2. Current State Analysis
- **Codebase Structure**: FastAPI/Celery backend, Next.js frontend, Supabase for DB/Auth/Storage.
- **Testing**: No formalized automated test suites (`pytest` or `jest`) are currently present. Reliance is solely on manual verification.
- **Production Readiness**: Basic Dockerization (`docker-compose.yml`, `Dockerfile` for backend/frontend) is present, which is a good start, but there is no CI/CD pipeline, monitoring, or robust error-handling infrastructure in place.

---

## 3. Email Polling and Ingestion Workflow
The core of MediCORE's data pipeline is its automated supplier catalog ingestion from email. Here is the detailed workflow as currently implemented:

1. **Scheduling**: A Celery task (`backend.app.tasks.poll_inbox`) runs periodically to check all configured `EmailAccount` records in the database. It compares the current time against `last_synced_at` and the user's defined `poll_interval_minutes`.
2. **IMAP Connection**: For accounts due for a sync, `poll_account_inbox` connects to the provider's IMAP server using decrypted app passwords.
3. **Filtering & Retrieval (Two Approaches)**:
   - **Approach 1 (Label-based)**: The system specifically looks for a folder/label named `suppliers`. It assumes all emails within this folder contain supplier catalogs.
   - **Approach 2 (Inbox Filtering)**: The system monitors the main `INBOX`. It filters senders against a `trusted_suppliers` list. If the sender is not trusted, it falls back to checking the email subject and body against user-defined `keyword_filters`. Unknown senders matching keywords are flagged for "Pending Approval" rather than immediately ingested.
   - The system also skips promotional emails (by checking `X-Gmail-Labels` and `List-Unsubscribe` headers) if configured.
4. **Content Extraction**:
   - For valid emails, the system extracts attachments (PDF, DOCX, XLSX, images, CSV, TXT) and the email body itself.
   - It leverages `markitdown` for Word/Excel files, `pytesseract` for image OCR, and custom PDF extraction tools.
5. **Catalog Parsing**:
   - The raw text is first passed through a regex-based table parser (`parse_catalog_table_text`).
   - If regex parsing fails to yield results, the system falls back to an LLM (Groq) to intelligently extract structured `CatalogItem` records from the unstructured text.
   - Pack sizes and units are extracted and normalized.
6. **Storage & Vectorization**:
   - Structured items are saved to the Supabase PostgreSQL database.
   - An embedding representation of the item text is generated and stored for natural language semantic search.
   - Original attachments are uploaded to Supabase Storage, and the public URL is saved.

---

## 4. Testing Strategy

To ensure system stability, a multi-tiered automated testing approach must be implemented.

### 4.1 Unit Testing
- **Backend (`pytest`)**:
  - Test individual text extractors (`_extract_docx_text`, `_extract_image_text`).
  - Test regex and LLM parsers using mocked responses to ensure correct item normalization.
  - Test embedding generation wrappers.
- **Frontend (`Jest` + `React Testing Library`)**:
  - Component rendering tests for the catalog table, email sync settings modal, and search bar.
  - Test state management for filters and pagination.

### 4.2 Integration Testing
- **Database Integration**: Spin up a test Supabase instance (or local PostgreSQL via Testcontainers) to test CRUD operations for `CatalogItem`, `Supplier`, and `EmailAccount`.
- **IMAP Mocking**: Mock the `imaplib` responses to simulate various inbox states (empty inbox, emails with malformed attachments, emails from untrusted sources) without requiring real email accounts.
- **LLM/API Mocking**: Use `responses` or `httpx-mock` to intercept and mock calls to Groq and Supabase Storage.

### 4.3 End-to-End (E2E) Testing
- **Framework**: Use Playwright or Cypress.
- **Critical Paths**:
  - User login flow.
  - Connecting an email account via the UI.
  - Triggering a manual sync and validating that items appear in the Catalog UI.
  - Performing a natural language search query and verifying accurate rendering of results.

---

## 5. Validation Plan

### 5.1 Extraction Accuracy Golden Dataset
- Create a static dataset of 50-100 real-world, anonymized supplier emails and attachments.
- Define the expected structured JSON output for each.
- Implement an automated validation script that runs the extraction pipeline against this dataset and calculates precision/recall scores for parsed items, prices, and quantities.
- **Target Metric**: >95% accuracy on regex-parsed items, >90% on LLM-fallback items.

### 5.2 Edge Case Handling
- **Malformed Attachments**: Ensure the system gracefully skips or logs errors for corrupted PDFs or password-protected files without crashing the Celery worker.
- **Massive Files**: Implement and test hard limits on attachment size to prevent OOM (Out of Memory) errors during OCR or LLM extraction.

---

## 6. Production Readiness Requirements

### 6.1 CI/CD Pipeline
- Implement GitHub Actions or GitLab CI.
- **Pipeline Steps**: Linting (`flake8`/`ruff` + `eslint`), Type Checking (`mypy` + `tsc`), Unit Tests, Integration Tests, and Docker Build checks on every Pull Request.
- Disallow merges to `main` if tests fail.

### 6.2 Observability & Monitoring
- **Error Tracking**: Integrate Sentry in both the FastAPI backend and Next.js frontend to catch unhandled exceptions in production.
- **Logging**: Ensure structured JSON logging for Celery tasks. Key metrics to log: IMAP connection time, extraction processing time, and LLM token usage.
- **Metrics**: Monitor Celery queue length. If the queue of emails to process grows faster than workers can process them, alert the infrastructure team to scale workers.

### 6.3 Security & Secrets
- Implement periodic rotation policies for internal API keys.
- Ensure rate limiting is applied to the FastAPI endpoints to prevent abuse.
- Verify that Supabase Row Level Security (RLS) policies are strictly enforcing tenant isolation (users can only see their own `tenant_id` records). Currently, backend applies tenant filters, but defense-in-depth requires RLS.

### 6.4 Infrastructure Scalability
- **Celery Workers**: Configure Celery to autoscale based on CPU utilization or queue length. OCR and LLM interactions are I/O and CPU heavy.
- **Database Pooling**: Ensure PgBouncer or Supabase's native connection pooling is utilized by the FastAPI backend (`SessionLocal`) to prevent connection exhaustion under load.
