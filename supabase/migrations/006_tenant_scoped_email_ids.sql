-- Migration 006: make catalog email idempotency tenant-scoped for multi-tenant production use.

DO $$
DECLARE
    constraint_record record;
BEGIN
    FOR constraint_record IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'catalog_emails'
          AND con.contype = 'u'
          AND (
              SELECT array_agg(att.attname::text ORDER BY keys.ordinality)
              FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
              JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = keys.attnum
          ) = ARRAY['raw_email_id']::text[]
    LOOP
        EXECUTE format('ALTER TABLE public.catalog_emails DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
    END LOOP;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_catalog_emails_tenant_raw_email_id'
          AND conrelid = 'public.catalog_emails'::regclass
    ) THEN
        ALTER TABLE public.catalog_emails
            ADD CONSTRAINT uq_catalog_emails_tenant_raw_email_id UNIQUE (tenant_id, raw_email_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalog_emails_tenant_raw_email_id
    ON public.catalog_emails (tenant_id, raw_email_id);
