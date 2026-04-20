-- Phase 2: Automatic Company_ID Triggers
-- This script natively intercepts all INSERT operations and slaps the user's active company_id onto it.
-- This ensures the frontend doesn't need to be rewritten to pass `company_id` directly, 
-- while still guaranteeing absolute data isolation.

-- 1. Create the general trigger function
CREATE OR REPLACE FUNCTION public.set_company_id_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_company_id uuid;
BEGIN
    -- Only auto-inject if the payload didn't already have one
    -- (This allows platform_admins to explicitly pass a company_id from the dashboard)
    IF NEW.company_id IS NULL THEN
        -- Get the current authenticated user's company_id
        SELECT company_id INTO current_company_id 
        FROM public.profiles 
        WHERE id = auth.uid();
        
        -- Override the payload's company_id if we successfully fetched one
        IF current_company_id IS NOT NULL THEN
            NEW.company_id := current_company_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Attach the trigger to all operational standard tables
-- We don't attach to: companies, profiles, platform_admin_clients.

DO $$
DECLARE
    tbl text;
    tables_list text[] := ARRAY[
        'attendance_records', 'leave_requests', 'leave_balances', 
        'leave_types', 'company_holidays', 'hr_policies', 
        'announcements', 'notifications', 'payroll_records', 
        'deficit_adjustments', 'deficit_waivers', 'comp_off_grants', 
        'employee_appraisals', 'admin_permissions', 'absence_deduction_runs', 
        'pending_approvals', 'app_settings'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables_list
    LOOP
        -- Drop if exists to be safe
        EXECUTE format('DROP TRIGGER IF EXISTS trigger_auto_company_id ON public.%I', tbl);
        
        -- Create the trigger
        EXECUTE format(
            'CREATE TRIGGER trigger_auto_company_id
             BEFORE INSERT ON public.%I
             FOR EACH ROW
             EXECUTE FUNCTION public.set_company_id_on_insert();',
            tbl
        );
    END LOOP;
END;
$$;
