-- ============================================================
-- Phase A Migration: Foundation Tables for SaaS Platform
-- Run this in: Supabase SQL Editor → mhmuztwhttjcrmixvstt
-- ============================================================

-- ── 1. company_modules ──────────────────────────────────────
-- Replaces the simple companies.features JSON column.
-- One row per tenant per module. Stores the on/off switch
-- and all configurable properties for that module.
CREATE TABLE IF NOT EXISTS "public"."company_modules" (
    "id"         uuid DEFAULT gen_random_uuid() NOT NULL,
    "company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
    "module_key" text NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "updated_at" timestamptz DEFAULT now(),
    "updated_by" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL,
    PRIMARY KEY ("id"),
    UNIQUE ("company_id", "module_key")
);

-- Seed default modules for the existing Default Company
INSERT INTO "public"."company_modules" ("company_id", "module_key", "is_enabled", "properties") VALUES
  ('00000000-0000-0000-0000-000000000000', 'kpi_dashboard',        true,  '{"visible_stats": ["staff_count","attendance_rate","pending_leaves","announcements"]}'),
  ('00000000-0000-0000-0000-000000000000', 'staff_management',     true,  '{"max_seats": 100, "allow_self_registration": false, "require_profile_photo": false}'),
  ('00000000-0000-0000-0000-000000000000', 'attendance',           true,  '{"clock_in_method": "web", "grace_period_minutes": 15, "overtime_rule": "none"}'),
  ('00000000-0000-0000-0000-000000000000', 'kiosk_attendance',     true,  '{"max_devices": 5, "require_device_pin": true, "pin_rotation_days": 30, "show_employee_photo": true}'),
  ('00000000-0000-0000-0000-000000000000', 'leave_management',     true,  '{"max_leave_types": 10, "allow_carryforward": false, "partial_day_support": true, "approval_chain_depth": 1}'),
  ('00000000-0000-0000-0000-000000000000', 'leave_settings',       true,  '{"who_can_configure": "superadmin_only", "max_types_count": 10}'),
  ('00000000-0000-0000-0000-000000000000', 'overrides',            true,  '{"who_can_override": "superadmin_only"}'),
  ('00000000-0000-0000-0000-000000000000', 'payroll',              true,  '{"salary_fields": ["basic","hra","da"], "tax_mode": "optional", "payslip_format": "detailed", "currency": "INR", "auto_run_day": null}'),
  ('00000000-0000-0000-0000-000000000000', 'reports',              true,  '{"enabled_reports": ["attendance_summary","leave_summary","payroll_ledger"]}'),
  ('00000000-0000-0000-0000-000000000000', 'announcements',        true,  '{"who_can_post": "all_admins", "group_targeting": true, "require_approval": false, "approver_role": "superadmin"}'),
  ('00000000-0000-0000-0000-000000000000', 'hr_policies',          true,  '{"who_can_publish": "any_admin", "require_approval": false}'),
  ('00000000-0000-0000-0000-000000000000', 'holidays',             true,  '{"who_can_manage": "superadmin_only", "allow_regional_packs": false}'),
  ('00000000-0000-0000-0000-000000000000', 'appraisals',           false, '{"frequency": "annual", "allow_360_feedback": false, "reviewer_assignment": "admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'organogram',           true,  '{"mode": "view_only"}'),
  ('00000000-0000-0000-0000-000000000000', 'permissions',          true,  '{"depth": "simple"}'),
  ('00000000-0000-0000-0000-000000000000', 'approvals',            true,  '{"multi_level_enabled": false, "max_chain_depth": 1}'),
  ('00000000-0000-0000-0000-000000000000', 'notifications',        true,  '{"channels": ["in_app"]}'),
  ('00000000-0000-0000-0000-000000000000', 'employee_mobile_app',  false, '{"allow_leave_requests": true, "allow_payslip_view": true, "allow_attendance_view": true, "require_biometric": false}')
ON CONFLICT ("company_id", "module_key") DO NOTHING;

-- RLS for company_modules
ALTER TABLE "public"."company_modules" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners manage all modules" ON "public"."company_modules"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_owner')
  );

CREATE POLICY "Platform admins manage assigned tenant modules" ON "public"."company_modules"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.platform_admin_clients WHERE admin_id = auth.uid() AND company_id = company_modules.company_id)
  );

CREATE POLICY "Tenant users read own modules" ON "public"."company_modules"
  FOR SELECT USING (public.can_access_company(company_id));


-- ── 2. subscription_plans ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id"              uuid DEFAULT gen_random_uuid() NOT NULL,
    "name"            text NOT NULL,
    "price_monthly"   decimal(10,2) DEFAULT 0,
    "max_employees"   int DEFAULT 50,
    "default_modules" jsonb DEFAULT '{}'::jsonb,
    "is_active"       boolean DEFAULT true,
    "created_at"      timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Seed starter plans
INSERT INTO "public"."subscription_plans" ("name", "price_monthly", "max_employees", "default_modules") VALUES
  ('Starter',      999,   25,  '{"kpi_dashboard":true,"staff_management":true,"attendance":true,"leave_management":true,"leave_settings":true}'),
  ('Professional', 2499,  100, '{"kpi_dashboard":true,"staff_management":true,"attendance":true,"kiosk_attendance":true,"leave_management":true,"leave_settings":true,"payroll":true,"reports":true,"announcements":true,"hr_policies":true,"holidays":true,"organogram":true,"approvals":true,"notifications":true}'),
  ('Enterprise',   4999,  500, '{"kpi_dashboard":true,"staff_management":true,"attendance":true,"kiosk_attendance":true,"leave_management":true,"leave_settings":true,"overrides":true,"payroll":true,"reports":true,"announcements":true,"hr_policies":true,"holidays":true,"appraisals":true,"organogram":true,"permissions":true,"approvals":true,"notifications":true,"employee_mobile_app":true}')
ON CONFLICT DO NOTHING;

-- Add plan_id to companies
ALTER TABLE "public"."companies"
  ADD COLUMN IF NOT EXISTS "plan_id" uuid REFERENCES "public"."subscription_plans"("id") ON DELETE SET NULL;

-- RLS for subscription_plans (platform owner manages, everyone can read)
ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners manage plans" ON "public"."subscription_plans"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_owner')
  );

CREATE POLICY "Anyone authenticated can read plans" ON "public"."subscription_plans"
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- ── 3. domain_requests ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."domain_requests" (
    "id"               uuid DEFAULT gen_random_uuid() NOT NULL,
    "company_id"       uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
    "requested_domain" text NOT NULL,
    "status"           text DEFAULT 'pending' NOT NULL,
    -- status lifecycle: pending → awaiting_dns → dns_verified → active → failed
    "requested_by"     uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL,
    "reviewed_by"      uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL,
    "dns_verified_at"  timestamptz,
    "activated_at"     timestamptz,
    "notes"            text,
    "created_at"       timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

ALTER TABLE "public"."domain_requests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners manage domain requests" ON "public"."domain_requests"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_owner')
  );

CREATE POLICY "Platform admins manage assigned domain requests" ON "public"."domain_requests"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.platform_admin_clients WHERE admin_id = auth.uid() AND company_id = domain_requests.company_id)
  );

CREATE POLICY "Company superadmin can create domain requests" ON "public"."domain_requests"
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = domain_requests.company_id AND role = 'superadmin')
  );

CREATE POLICY "Company superadmin can view own domain requests" ON "public"."domain_requests"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = domain_requests.company_id)
  );


-- ── 4. platform_audit_log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."platform_audit_log" (
    "id"          uuid DEFAULT gen_random_uuid() NOT NULL,
    "actor_id"    uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL,
    "actor_role"  text,
    "action"      text NOT NULL,
    -- e.g. TENANT_CREATED, TENANT_SUSPENDED, MODULE_TOGGLED, DOMAIN_ACTIVATED, USER_RESET_PASSWORD
    "target_type" text,   -- company | user | module | domain | plan
    "target_id"   uuid,
    "old_value"   jsonb,
    "new_value"   jsonb,
    "ip_address"  text,
    "created_at"  timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Audit log is append-only — no UPDATE or DELETE
ALTER TABLE "public"."platform_audit_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners read audit log" ON "public"."platform_audit_log"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role IN ('platform_owner','platform_admin'))
  );

CREATE POLICY "System can insert audit entries" ON "public"."platform_audit_log"
  FOR INSERT WITH CHECK (true);  -- Insert is done via service role only


-- ── 5. kiosk_devices ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."kiosk_devices" (
    "id"            uuid DEFAULT gen_random_uuid() NOT NULL,
    "company_id"    uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
    "device_name"   text NOT NULL DEFAULT 'Kiosk Device',
    "device_token"  text NOT NULL UNIQUE,
    "is_active"     boolean DEFAULT true NOT NULL,
    "last_ping"     timestamptz,
    "registered_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

ALTER TABLE "public"."kiosk_devices" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners manage all kiosk devices" ON "public"."kiosk_devices"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND system_role = 'platform_owner')
  );

CREATE POLICY "Tenant superadmins manage own kiosk devices" ON "public"."kiosk_devices"
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = kiosk_devices.company_id AND role IN ('superadmin','admin'))
  );

-- Kiosk devices access their own company's employee list (public punch endpoint uses service role)


-- ── 6. Fix: platform_owner can read own profile ──────────────
-- The previous migration dropped all permissive policies on profiles.
-- RESTRICTIVE policies alone mean "deny unless explicitly permitted".
-- platform_owner has NULL company_id so the tenant isolation RESTRICTIVE
-- policy passes (company_id IS NULL), but there's no PERMISSIVE policy
-- to actually ALLOW the read. This fixes that.

CREATE POLICY "Authenticated users can read own profile" ON "public"."profiles"
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can read profiles in their company" ON "public"."profiles"
  FOR SELECT USING (public.can_access_company(company_id) OR company_id IS NULL);

CREATE POLICY "Service role can insert profiles" ON "public"."profiles"
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own profile" ON "public"."profiles"
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can update profiles in their company" ON "public"."profiles"
  FOR UPDATE USING (public.can_access_company(company_id));

CREATE POLICY "Admins can delete profiles in their company" ON "public"."profiles"
  FOR DELETE USING (public.can_access_company(company_id));
