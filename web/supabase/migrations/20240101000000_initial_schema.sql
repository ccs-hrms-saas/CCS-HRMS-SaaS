


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."leave_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."leave_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'superadmin',
    'admin',
    'employee'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."absence_deduction_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "month_year" "text" NOT NULL,
    "ran_at" timestamp with time zone DEFAULT "now"(),
    "employees_processed" integer DEFAULT 0,
    "total_days_deducted" numeric DEFAULT 0
);


ALTER TABLE "public"."absence_deduction_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "permission" "text" NOT NULL,
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "logo_url" "text",
    "theme" "text" DEFAULT 'dark_indigo'::"text" NOT NULL,
    "font_family" "text" DEFAULT 'Outfit'::"text" NOT NULL,
    "font_size" "text" DEFAULT 'md'::"text" NOT NULL,
    "nav_icons" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "check_in" timestamp with time zone,
    "check_out" timestamp with time zone,
    "photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "checkout_photo_url" "text"
);


ALTER TABLE "public"."attendance_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comp_off_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "granted_by" "uuid",
    "granted_on" "date" DEFAULT ("now"())::"date" NOT NULL,
    "expires_on" "date" NOT NULL,
    "days_granted" numeric DEFAULT 1.0 NOT NULL,
    "days_used" numeric DEFAULT 0.0 NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."comp_off_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_holidays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."company_holidays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deficit_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "adjustment_date" "date" DEFAULT ("now"())::"date" NOT NULL,
    "hours_cleared" numeric DEFAULT 8.5 NOT NULL,
    "adjusted_against" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."deficit_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deficit_waivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "waived_by" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "hours_waived" numeric(5,2) NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."deficit_waivers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_appraisals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "appraisal_date" "date" NOT NULL,
    "letter_url" "text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."employee_appraisals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "content" "text" NOT NULL,
    "published_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hr_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leave_balances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "leave_type_id" "uuid",
    "financial_year" integer NOT NULL,
    "accrued" numeric DEFAULT 0.0,
    "used" numeric DEFAULT 0.0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."leave_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leave_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "reason" "text",
    "status" "public"."leave_status" DEFAULT 'pending'::"public"."leave_status" NOT NULL,
    "approved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachment_url" "text",
    "is_violation" boolean DEFAULT false,
    "violation_reason" "text"
);


ALTER TABLE "public"."leave_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leave_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "max_days_per_year" integer DEFAULT 12,
    "is_paid" boolean DEFAULT true,
    "allow_carry_forward" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "accrual_rate" numeric,
    "count_holidays" boolean DEFAULT false,
    "max_carry_forward" integer DEFAULT 0,
    "carry_forward_percent" integer DEFAULT 0,
    "frequency" "text" DEFAULT 'yearly'::"text",
    "deduction_hours" numeric DEFAULT 8.5,
    "requires_attachment" boolean DEFAULT false,
    "requires_attachment_after_days" integer DEFAULT 0,
    "expires_in_days" integer
);


ALTER TABLE "public"."leave_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "link" "text",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "base_remuneration" numeric NOT NULL,
    "daily_rate" numeric NOT NULL,
    "total_lwp_days" numeric DEFAULT 0.0,
    "deductions_amount" numeric DEFAULT 0.0,
    "final_payout" numeric NOT NULL,
    "status" "text" DEFAULT 'Processed'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payroll_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action_type" "text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "target_user_id" "uuid",
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone
);


ALTER TABLE "public"."pending_approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'employee'::"public"."user_role" NOT NULL,
    "manager_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true,
    "left_on" "date",
    "phone_number" "text",
    "gender" "text",
    "designation" "text",
    "joining_date" "date",
    "joining_letter_url" "text",
    "remuneration" numeric,
    "emergency_contact" "text",
    "father_name" "text",
    "mother_name" "text",
    "address" "text",
    "aadhar_number" "text",
    "aadhar_front_url" "text",
    "aadhar_back_url" "text",
    "pan_number" "text",
    "pan_url" "text",
    "avatar_url" "text",
    "bank_name" "text",
    "bank_account_number" "text",
    "bank_ifsc" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."totp_secrets" (
    "user_id" "uuid" NOT NULL,
    "secret" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."totp_secrets" OWNER TO "postgres";


ALTER TABLE ONLY "public"."absence_deduction_runs"
    ADD CONSTRAINT "absence_deduction_runs_month_year_key" UNIQUE ("month_year");



ALTER TABLE ONLY "public"."absence_deduction_runs"
    ADD CONSTRAINT "absence_deduction_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_user_id_permission_key" UNIQUE ("user_id", "permission");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comp_off_grants"
    ADD CONSTRAINT "comp_off_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_holidays"
    ADD CONSTRAINT "company_holidays_date_key" UNIQUE ("date");



ALTER TABLE ONLY "public"."company_holidays"
    ADD CONSTRAINT "company_holidays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deficit_adjustments"
    ADD CONSTRAINT "deficit_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deficit_waivers"
    ADD CONSTRAINT "deficit_waivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_appraisals"
    ADD CONSTRAINT "employee_appraisals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_policies"
    ADD CONSTRAINT "hr_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leave_balances"
    ADD CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leave_balances"
    ADD CONSTRAINT "leave_balances_user_id_leave_type_id_financial_year_key" UNIQUE ("user_id", "leave_type_id", "financial_year");



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leave_types"
    ADD CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_records"
    ADD CONSTRAINT "payroll_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_records"
    ADD CONSTRAINT "payroll_records_user_id_year_month_key" UNIQUE ("user_id", "year", "month");



ALTER TABLE ONLY "public"."pending_approvals"
    ADD CONSTRAINT "pending_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."totp_secrets"
    ADD CONSTRAINT "totp_secrets_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "pending_approvals_requested_by_idx" ON "public"."pending_approvals" USING "btree" ("requested_by");



CREATE INDEX "pending_approvals_status_idx" ON "public"."pending_approvals" USING "btree" ("status");



ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."comp_off_grants"
    ADD CONSTRAINT "comp_off_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comp_off_grants"
    ADD CONSTRAINT "comp_off_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deficit_adjustments"
    ADD CONSTRAINT "deficit_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deficit_waivers"
    ADD CONSTRAINT "deficit_waivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."deficit_waivers"
    ADD CONSTRAINT "deficit_waivers_waived_by_fkey" FOREIGN KEY ("waived_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."employee_appraisals"
    ADD CONSTRAINT "employee_appraisals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."employee_appraisals"
    ADD CONSTRAINT "employee_appraisals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_policies"
    ADD CONSTRAINT "hr_policies_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."leave_balances"
    ADD CONSTRAINT "leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leave_balances"
    ADD CONSTRAINT "leave_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_records"
    ADD CONSTRAINT "payroll_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_approvals"
    ADD CONSTRAINT "pending_approvals_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_approvals"
    ADD CONSTRAINT "pending_approvals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."pending_approvals"
    ADD CONSTRAINT "pending_approvals_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."totp_secrets"
    ADD CONSTRAINT "totp_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



CREATE POLICY "Admins can delete profiles" ON "public"."profiles" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "Admins can manage leave types" ON "public"."leave_types" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "Admins can manage policies" ON "public"."hr_policies" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "Admins can update any profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "Admins manage all adjustments" ON "public"."deficit_adjustments" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "Admins manage announcements" ON "public"."announcements" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "Admins manage appraisals" ON "public"."employee_appraisals" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "Admins manage balances" ON "public"."leave_balances" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "Admins manage comp offs" ON "public"."comp_off_grants" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "Admins manage holidays" ON "public"."company_holidays" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "Admins manage payroll" ON "public"."payroll_records" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "Admins view all appraisals" ON "public"."employee_appraisals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "All view announcements" ON "public"."announcements" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Anyone can read leave types" ON "public"."leave_types" FOR SELECT USING (true);



CREATE POLICY "Anyone can read policies" ON "public"."hr_policies" FOR SELECT USING (true);



CREATE POLICY "Employee views own appraisals" ON "public"."employee_appraisals" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Employees can insert adjustments" ON "public"."deficit_adjustments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Employees can see own comp off grants" ON "public"."comp_off_grants" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Employees read own balances" ON "public"."leave_balances" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Employees see own adjustments" ON "public"."deficit_adjustments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Employees see own payroll" ON "public"."payroll_records" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Everyone can read holidays" ON "public"."company_holidays" FOR SELECT USING (true);



CREATE POLICY "Profiles are viewable by all" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Service role can insert profiles" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users update own notifications" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users view own notifications" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."absence_deduction_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_full" ON "public"."absence_deduction_runs" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"public"."user_role", 'superadmin'::"public"."user_role"]))))));



CREATE POLICY "admin_insert" ON "public"."pending_approvals" FOR INSERT WITH CHECK (("auth"."uid"() = "requested_by"));



ALTER TABLE "public"."admin_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_read_own" ON "public"."pending_approvals" FOR SELECT USING ((("auth"."uid"() = "requested_by") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'superadmin'::"public"."user_role"))))));



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_read" ON "public"."app_settings" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "app_settings_write" ON "public"."app_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'superadmin'::"public"."user_role")))));



ALTER TABLE "public"."comp_off_grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_holidays" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deficit_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deficit_waivers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "emp_read_own_waivers" ON "public"."deficit_waivers" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."employee_appraisals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hr_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leave_balances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leave_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sa_all_deficit_waivers" ON "public"."deficit_waivers" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'superadmin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'superadmin'::"public"."user_role")))));



CREATE POLICY "self_read" ON "public"."admin_permissions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "superadmin_full" ON "public"."admin_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'superadmin'::"public"."user_role")))));



CREATE POLICY "superadmin_update" ON "public"."pending_approvals" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'superadmin'::"public"."user_role")))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";








































































































































































GRANT ALL ON TABLE "public"."absence_deduction_runs" TO "anon";
GRANT ALL ON TABLE "public"."absence_deduction_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."absence_deduction_runs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_permissions" TO "anon";
GRANT ALL ON TABLE "public"."admin_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_records" TO "anon";
GRANT ALL ON TABLE "public"."attendance_records" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_records" TO "service_role";



GRANT ALL ON TABLE "public"."comp_off_grants" TO "anon";
GRANT ALL ON TABLE "public"."comp_off_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."comp_off_grants" TO "service_role";



GRANT ALL ON TABLE "public"."company_holidays" TO "anon";
GRANT ALL ON TABLE "public"."company_holidays" TO "authenticated";
GRANT ALL ON TABLE "public"."company_holidays" TO "service_role";



GRANT ALL ON TABLE "public"."deficit_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."deficit_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."deficit_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."deficit_waivers" TO "anon";
GRANT ALL ON TABLE "public"."deficit_waivers" TO "authenticated";
GRANT ALL ON TABLE "public"."deficit_waivers" TO "service_role";



GRANT ALL ON TABLE "public"."employee_appraisals" TO "anon";
GRANT ALL ON TABLE "public"."employee_appraisals" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_appraisals" TO "service_role";



GRANT ALL ON TABLE "public"."hr_policies" TO "anon";
GRANT ALL ON TABLE "public"."hr_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."hr_policies" TO "service_role";



GRANT ALL ON TABLE "public"."leave_balances" TO "anon";
GRANT ALL ON TABLE "public"."leave_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_balances" TO "service_role";



GRANT ALL ON TABLE "public"."leave_requests" TO "anon";
GRANT ALL ON TABLE "public"."leave_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_requests" TO "service_role";



GRANT ALL ON TABLE "public"."leave_types" TO "anon";
GRANT ALL ON TABLE "public"."leave_types" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_types" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_records" TO "anon";
GRANT ALL ON TABLE "public"."payroll_records" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_records" TO "service_role";



GRANT ALL ON TABLE "public"."pending_approvals" TO "anon";
GRANT ALL ON TABLE "public"."pending_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."totp_secrets" TO "anon";
GRANT ALL ON TABLE "public"."totp_secrets" TO "authenticated";
GRANT ALL ON TABLE "public"."totp_secrets" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































