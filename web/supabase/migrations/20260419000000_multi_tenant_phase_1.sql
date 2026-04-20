-- Phase 1 Multi-Tenant SaaS Migration (With Developer Layer)

-- 1. Create System Roles
CREATE TYPE "public"."system_role" AS ENUM (
    'platform_owner',
    'platform_admin'
);

-- 2. Create companies table
CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "domain" "text" UNIQUE,
    "subdomain" "text" UNIQUE,
    "branding" "jsonb" DEFAULT '{}'::jsonb,
    "features" "jsonb" DEFAULT '{}'::jsonb, -- NEW: Global feature flags for this client
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    PRIMARY KEY ("id")
);

-- 3. Add system_role and company_id to profiles
ALTER TABLE "public"."profiles" ADD COLUMN IF NOT EXISTS "system_role" "public"."system_role";
ALTER TABLE "public"."profiles" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;

-- 4. Create Developer-to-Client assignment table
CREATE TABLE IF NOT EXISTS "public"."platform_admin_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" REFERENCES "public"."profiles"("id") ON DELETE CASCADE NOT NULL,
    "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    PRIMARY KEY ("id"),
    UNIQUE("admin_id", "company_id")
);

-- Protect Developer tables with basic RLS
ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."platform_admin_clients" ENABLE ROW LEVEL SECURITY;

-- 5. Create the default company for data migration
INSERT INTO "public"."companies" ("id", "name", "subdomain", "features")
VALUES ('00000000-0000-0000-0000-000000000000', 'Default Company', 'default', '{"payroll": true, "attendance": true}')
ON CONFLICT DO NOTHING;

-- 6. Add company_id and foreign key constraints to all core structural tables
ALTER TABLE "public"."attendance_records" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."leave_requests" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."leave_balances" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."leave_types" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."company_holidays" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."hr_policies" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."announcements" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."notifications" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."payroll_records" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."deficit_adjustments" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."deficit_waivers" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."comp_off_grants" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."employee_appraisals" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."admin_permissions" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."absence_deduction_runs" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."pending_approvals" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;
ALTER TABLE "public"."app_settings" ADD COLUMN IF NOT EXISTS "company_id" "uuid" REFERENCES "public"."companies"("id") ON DELETE CASCADE;

-- 7. Backfill existing records with Default Company ID
UPDATE "public"."profiles" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL AND "system_role" IS NULL;
UPDATE "public"."attendance_records" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."leave_requests" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."leave_balances" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."leave_types" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."company_holidays" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."hr_policies" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."announcements" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."notifications" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."payroll_records" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."deficit_adjustments" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."deficit_waivers" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."comp_off_grants" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."employee_appraisals" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."admin_permissions" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."absence_deduction_runs" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."pending_approvals" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;
UPDATE "public"."app_settings" SET "company_id" = '00000000-0000-0000-0000-000000000000' WHERE "company_id" IS NULL;

-- 8. Applying NOT NULL where guaranteed
-- Profiles cannot have NOT NULL on company_id anymore, because Developers will have NULL company_id.
-- Instead, we add a check constraint: you MUST have either a company_id OR a system_role.
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_tenant_or_system_check" CHECK (
    ("company_id" IS NOT NULL AND "system_role" IS NULL) OR 
    ("company_id" IS NULL AND "system_role" IS NOT NULL)
);

ALTER TABLE "public"."leave_types" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "public"."company_holidays" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "public"."hr_policies" ALTER COLUMN "company_id" SET NOT NULL;

-- 9. RLS Restructuring (Developer Bypass)

-- Helper to check if a user can access a specific company_id
CREATE OR REPLACE FUNCTION public.can_access_company(target_company_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT 
    -- 1. True if they are the platform owner
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_owner')
    OR
    -- 2. True if they are a platform admin assigned to this company
    EXISTS (SELECT 1 FROM public.platform_admin_clients WHERE admin_id = auth.uid() AND company_id = target_company_id)
    OR
    -- 3. True if they are a regular user belonging to this company
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = target_company_id);
$$;

-- Drop all old specific policies
DROP POLICY IF EXISTS "Admins can delete profiles" ON "public"."profiles";
DROP POLICY IF EXISTS "Admins can update any profile" ON "public"."profiles";
DROP POLICY IF EXISTS "Profiles are viewable by all" ON "public"."profiles";
DROP POLICY IF EXISTS "Service role can insert profiles" ON "public"."profiles";
DROP POLICY IF EXISTS "Admins can manage leave types" ON "public"."leave_types";
DROP POLICY IF EXISTS "Anyone can read leave types" ON "public"."leave_types";
DROP POLICY IF EXISTS "Admins can manage policies" ON "public"."hr_policies";
DROP POLICY IF EXISTS "Anyone can read policies" ON "public"."hr_policies";
DROP POLICY IF EXISTS "Admins manage holidays" ON "public"."company_holidays";
DROP POLICY IF EXISTS "Everyone can read holidays" ON "public"."company_holidays";

-- Re-enable RLS on all tables
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leave_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leave_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leave_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."company_holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."hr_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payroll_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."deficit_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."deficit_waivers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."comp_off_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."employee_appraisals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."admin_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."absence_deduction_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pending_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;

-- NEW RLS Policies Template (Read Company Data)
CREATE POLICY "Users read companies" ON "public"."companies" FOR SELECT USING (public.can_access_company(id));

CREATE POLICY "Platform owners manage companies" ON "public"."companies" FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_owner'));

CREATE POLICY "Platform owners manage assignments" ON "public"."platform_admin_clients" FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_owner'));


-- RESTRICTIVE Tenant isolation policy across all tables allowing Developer bypass
CREATE POLICY "Tenant isolation for profiles" ON "public"."profiles" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id) OR company_id IS NULL);
CREATE POLICY "Tenant isolation for attendance_records" ON "public"."attendance_records" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for leave_requests" ON "public"."leave_requests" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for leave_balances" ON "public"."leave_balances" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for leave_types" ON "public"."leave_types" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for company_holidays" ON "public"."company_holidays" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for hr_policies" ON "public"."hr_policies" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for announcements" ON "public"."announcements" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for notifications" ON "public"."notifications" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for payroll_records" ON "public"."payroll_records" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for deficit_adjustments" ON "public"."deficit_adjustments" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for deficit_waivers" ON "public"."deficit_waivers" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for comp_off_grants" ON "public"."comp_off_grants" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for employee_appraisals" ON "public"."employee_appraisals" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for admin_permissions" ON "public"."admin_permissions" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for absence_deduction_runs" ON "public"."absence_deduction_runs" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for pending_approvals" ON "public"."pending_approvals" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
CREATE POLICY "Tenant isolation for app_settings" ON "public"."app_settings" AS RESTRICTIVE FOR ALL USING (public.can_access_company(company_id));
