-- Migration 005: Admin Portal and Employee Management

-- 1. Alter profiles table to add tenant_id and status columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active';

-- 2. Create Employee Invitations table
CREATE TABLE IF NOT EXISTS public.employee_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    token text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'Pending Activation',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_invitation_status CHECK (status IN ('Pending Activation', 'Active', 'Expired'))
);

-- Enable RLS on new table
ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policy: Only admins can manage invitations
DROP POLICY IF EXISTS admin_manage_invitations ON public.employee_invitations;
CREATE POLICY admin_manage_invitations ON public.employee_invitations
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- 4. Create Password Resets table
CREATE TABLE IF NOT EXISTS public.password_resets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'Pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_reset_status CHECK (status IN ('Pending', 'Used', 'Expired'))
);

-- Enable RLS on password resets
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admin or the user themselves can manage resets
DROP POLICY IF EXISTS manage_password_resets ON public.password_resets;
CREATE POLICY manage_password_resets ON public.password_resets
    FOR ALL TO authenticated
    USING (
        (user_id = auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- 5. Create AI Query Log table for calculating analytics
CREATE TABLE IF NOT EXISTS public.ai_query_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    query_text text NOT NULL,
    operation_type text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on AI logs
ALTER TABLE public.ai_query_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can insert logs; users/admins can view their own query logs, Admins can view all of their tenant
DROP POLICY IF EXISTS user_view_own_query_logs ON public.ai_query_logs;
CREATE POLICY user_view_own_query_logs ON public.ai_query_logs
    FOR SELECT TO authenticated
    USING (
        (user_id = auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.tenant_id = ai_query_logs.tenant_id
        )
    );

DROP POLICY IF EXISTS user_insert_query_logs ON public.ai_query_logs;
CREATE POLICY user_insert_query_logs ON public.ai_query_logs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- 6. Update the handle_new_user trigger to handle invitations and roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_tenant_id uuid;
    v_role text;
    v_org text;
    v_status text;
BEGIN
    -- Check if role metadata is specified
    v_role := coalesce(new.raw_user_meta_data->>'role', 'employee');
    v_org := coalesce(new.raw_user_meta_data->>'organisation', '');
    v_status := 'Active';
    
    -- If it's an employee registering, look up their invitation details
    IF v_role = 'employee' THEN
        SELECT tenant_id INTO v_tenant_id FROM public.employee_invitations 
        WHERE email = new.email AND status = 'Pending Activation' LIMIT 1;
        
        -- Get organization from the inviting admin's profile
        IF v_tenant_id IS NOT NULL THEN
            SELECT organisation INTO v_org FROM public.profiles WHERE id = v_tenant_id;
        END IF;
    END IF;
    
    -- If not found, they are the admin/owner of their own new tenant
    IF v_tenant_id IS NULL THEN
        v_tenant_id := new.id;
        v_role := 'admin'; -- Normal registration without invitation defaults to admin
    END IF;

    INSERT INTO public.profiles (id, full_name, organisation, role, tenant_id, status)
    VALUES (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', ''),
        v_org,
        v_role,
        v_tenant_id,
        v_status
    );

    INSERT INTO public.email_sync_settings (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Update invitation status to Active if this was an invite registration
    IF v_role = 'employee' THEN
        UPDATE public.employee_invitations 
        SET status = 'Active' 
        WHERE email = new.email;
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
