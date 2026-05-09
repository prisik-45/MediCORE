# MediCORE

Ingest supplier emails, extract attached PDF catalogs, normalize item data, rank suppliers, and let employees ask natural-language purchase questions.

## Architecture

- Backend: Python 3.12, FastAPI, uv
- Workers: Celery with Redis broker
- LLM: Groq chat completions
- PDF extraction: PyMuPDF with pdfplumber fallback
- Database: Supabase Postgres with pgvector
- Storage: Supabase Storage for source PDFs
- Cache/session: Redis
- Frontend: Next.js chat and dashboard UI
- Dev email mode: IMAP polling
- Production email mode: Gmail Pub/Sub push webhook

## Quick Start

1. Copy environment defaults:

   ```powershell
   Copy-Item .env.example .env
   ```

   For Supabase, the least error-prone database setup is to use separate fields:

   ```env
   SUPABASE_DB_HOST=db.your-project-ref.supabase.co
   SUPABASE_DB_PORT=5432
   SUPABASE_DB_NAME=postgres
   SUPABASE_DB_USER=postgres
   SUPABASE_DB_PASSWORD=your_database_password
   ```

   If you use `DATABASE_URL` instead, URL-encode special password characters like `@`, `#`, `%`, `/`, `?`, and `&`.

2. Install backend dependencies:

   ```powershell
   uv sync
   ```

3. Apply `supabase/migrations/001_init.sql` in the Supabase SQL editor.

   The migration is safe to rerun; it drops existing tenant policies before recreating them.

4. Seed mock catalogue data while email reading is paused:

   ```powershell
   uv run python -m backend.app.seed_mock_catalogs
   ```

   This creates 10 mock extracted catalogues, 10 suppliers, and 80 catalogue items in Supabase/Postgres.

5. Run the API:

   ```powershell
   uv run -- python -m uvicorn backend.app.main:app --host 0.0.0.0 --reload --port 8000
   ```

6. Run the worker only when you want email ingestion/background processing:

   ```powershell
   uv run -- python -m celery -A backend.app.tasks worker --loglevel=info --pool=solo
   ```

   **Note on Windows:** The `--pool=solo` flag disables multiprocessing and runs a single-process worker. This avoids permission errors from billiard's semaphore locks on Windows. For production on Windows, consider using WSL2 or Docker instead.

7. Run the frontend:

   ```powershell
   cd frontend
   npm install
   npm.cmd run dev -- --hostname 0.0.0.0
   ```
8. Open url : http://192.168.29.44:3000

## Development vs Production Email

Development uses IMAP polling through `POST /api/ingestion/poll-now` or Celery beat.

Production uses Gmail Pub/Sub push notifications at:

```text
POST /webhooks/gmail
```

Set the Gmail push subscription endpoint to the deployed FastAPI URL. The webhook queues the catalog processing job and returns immediately.

## Safety Model

The LLM never talks to the database directly. Natural-language questions are converted into a whitelisted query plan, validated by Python, executed through parameterized Supabase/Postgres calls, and then summarized conversationally.

## Deployment

Railway/Vercel test deployment:

- Deploy FastAPI using `backend/Dockerfile`
- Deploy Redis or use Upstash
- Use Supabase free tier with pgvector enabled
- Deploy `frontend` to Vercel
- Inject environment variables from `.env.example`

AWS production deployment:

- Run API and Celery worker as separate ECS/Fargate services
- Use ElastiCache or Upstash Redis
- Use Supabase Pro, enable RLS policies in `supabase/migrations/001_init.sql`
- Configure Gmail Pub/Sub webhook to `/webhooks/gmail`
