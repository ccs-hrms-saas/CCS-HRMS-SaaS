import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Default modules seeded for every new tenant
// Tier property starts at "basic" for all modules.
// Developer upgrades tier per tenant from the Tenant Detail → Modules tab.
const DEFAULT_TENANT_MODULES = [
  {
    module_key: 'kpi_dashboard',
    is_enabled: true,
    properties: { visible_stats: ['staff_count', 'attendance_rate', 'pending_leaves'] },
  },
  {
    module_key: 'staff_management',
    is_enabled: true,
    properties: { max_seats: 50, allow_self_registration: false },
  },
  {
    module_key: 'attendance',
    is_enabled: true,
    properties: { clock_in_method: 'web', grace_period_minutes: 15 },
  },
  {
    module_key: 'kiosk_attendance',
    is_enabled: false,
    properties: { max_devices: 3, require_device_pin: true, pin_rotation_days: 30, show_employee_photo: true },
  },
  {
    module_key: 'leave_management',
    is_enabled: true,
    properties: { max_leave_types: 10, allow_carryforward: false, partial_day_support: true },
  },
  {
    module_key: 'leave_settings',
    is_enabled: true,
    properties: {
      // ── Tier (Basic = 2 leave types, superadmin only, 1-level approval)
      tier: 'basic',
      max_leave_types: 2,
      who_can_configure: 'superadmin_only',
      approval_chain_depth: 1,
      // ── Standard+ features (locked in Basic)
      allow_carryforward: false,
      partial_day_support: false,
      cl_consecutive_limit_enabled: false,
      cl_default_max_consecutive_days: 2,
      // ── Advanced only (locked in Basic + Standard)
      ml_leave_enabled: false,
      ml_lapse_award_type: 'Comp-Off',
      ml_lapse_award_threshold: 4,
      short_leave_enabled: false,
      short_leave_default_hours: 2,
      compoff_enabled: false,
      week_off_customization: false,
      lwp_payroll_link: false,
      deficit_adjustment_enabled: false,
      // ── Custom extensions bucket
      custom_leave_labels: [],
      _custom: {},
    },
  },
  {
    module_key: 'overrides',
    is_enabled: false,
    properties: { who_can_override: 'superadmin_only' },
  },
  {
    module_key: 'payroll',
    is_enabled: false,
    properties: {
      // ── Tier (Basic = fixed-day calc, 30-day denom, no hour tracking)
      tier: 'basic',
      currency: 'INR',
      salary_denominator: 30,
      daily_working_hours: 8.5,
      pay_day: 1,
      // ── Standard+ features (locked in Basic)
      lwp_auto_compute: false,
      payroll_lock_enabled: false,
      deficit_tracking: false,
      deficit_half_day_hours: 4.25,
      early_warning_days: 8,
      mandatory_adjust_days: 4,
      max_overtime_per_day: 1.0,
      payroll_preview_from_day: 20,
      // ── Advanced only (locked in Basic + Standard)
      shift_based_calc: false,
      shift_patterns: [],
      differential_rules_enabled: false,
      ml_lapse_tracking: false,
      ml_lapse_award_threshold: 4,
      ml_lapse_award_type: 'Comp-Off',
      overtime_weekly_cap: null,
      // ── Custom extensions bucket
      _custom: {},
    },
  },
  {
    module_key: 'reports',
    is_enabled: true,
    properties: { enabled_reports: ['attendance_summary', 'leave_summary'] },
  },
  {
    module_key: 'announcements',
    is_enabled: true,
    properties: { who_can_post: 'all_admins', require_approval: false },
  },
  {
    module_key: 'hr_policies',
    is_enabled: true,
    properties: { who_can_publish: 'any_admin' },
  },
  {
    module_key: 'holidays',
    is_enabled: true,
    properties: { who_can_manage: 'superadmin_only' },
  },
  {
    module_key: 'appraisals',
    is_enabled: false,
    properties: { frequency: 'annual' },
  },
  {
    module_key: 'organogram',
    is_enabled: true,
    properties: { mode: 'view_only' },
  },
  {
    module_key: 'permissions',
    is_enabled: true,
    properties: { depth: 'simple' },
  },
  {
    module_key: 'approvals',
    is_enabled: false,
    properties: { multi_level_enabled: false },
  },
  {
    module_key: 'notifications',
    is_enabled: true,
    properties: { channels: ['in_app'] },
  },
  {
    module_key: 'employee_mobile_app',
    is_enabled: false,
    properties: {
      allow_leave_requests: true,
      allow_payslip_view: true,
      allow_attendance_view: true,
      require_biometric: false,
    },
  },
  // ── NEW: Reimbursements (Basic = 1 claim/month, SA only, 3-month receipts, 3 categories)
  {
    module_key: 'reimbursements',
    is_enabled: false,
    properties: {
      tier: 'basic',
      max_categories: 3,
      max_claims_per_month: 1,
      receipt_retention_days: 90,
      admin_can_approve: false,
      max_approval_chain_depth: 1,
      partial_approval_enabled: false,
      bulk_submission_enabled: false,
      show_in_payslip: false,
      job_role_approver_enabled: false,
      department_approver_enabled: false,
      person_approver_enabled: false,
      allow_optional_receipt: false,
      custom_category_presets: [],
      _custom: {},
    },
  },
  // ── NEW: Profiles & Roles (Basic = superadmin only manages)
  {
    module_key: 'profiles',
    is_enabled: true,
    properties: {
      tier: 'basic',
      who_can_create_profiles: 'superadmin',
      who_can_edit_profiles: 'superadmin',
      manager_can_view_team: true,
      manager_can_edit_team: false,
      admin_can_create: false,
      admin_can_edit: false,
      salary_change_requires_approval: false,
      custom_job_roles_enabled: false,
      job_roles_list: [],
      designation_change_approval: false,
      granular_field_permissions: false,
      team_scoped_manager_edit: false,
      _custom: {},
    },
  },
  // ── NEW: Incentive Structure (Basic = 1 plan, flat payout only, fixed values)
  {
    module_key: 'incentives',
    is_enabled: false,
    properties: {
      tier: 'basic',
      max_active_plans: 1,
      multi_goal_enabled: false,
      open_ended_value_enabled: false,
      target_cap_enabled: false,
      percentage_payout_enabled: false,
      payout_upper_cap_enabled: false,
      custom_tenure_enabled: false,
      role_scoping_enabled: false,
      department_scoping_enabled: false,
      show_in_payslip: false,
      self_reporting_enabled: false,
      _custom: {},
    },
  },
];

export async function POST(req: Request) {
  try {
    const { name, subdomain, adminEmail, adminPassword } = await req.json();

    if (!name || !subdomain || !adminEmail || !adminPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Create the Company Entity
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name,
        subdomain,
        features: { payroll: true, leaves: true, attendance: true },
        branding: { theme: 'dark_indigo', font_family: 'Outfit', font_size: 'md' },
      })
      .select('id')
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: companyError?.message || 'Failed to create company' }, { status: 500 });
    }

    const companyId = company.id;

    // 2. Create the Admin User for this Company
    const { data: user, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });

    if (userError) {
      await supabaseAdmin.from('companies').delete().eq('id', companyId);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    // 3. Create the Admin Profile
    await supabaseAdmin.from('profiles').insert({
      id: user.user.id,
      full_name: 'Company Admin',
      role: 'superadmin',
      company_id: companyId,
    });

    // 4. Seed Default Leave Types
    await supabaseAdmin.from('leave_types').insert([
      {
        company_id: companyId,
        name: 'Sick Leave',
        max_days_per_year: 12,
        is_paid: true,
        deduction_hours: 8.5,
        eligible_for_deficit_adj: false,
        counts_as_lwp_for_payroll: false,
        is_ml_type: false,
        allow_half_day: false,
      },
      {
        company_id: companyId,
        name: 'Casual Leave',
        max_days_per_year: 10,
        is_paid: true,
        deduction_hours: 8.5,
        eligible_for_deficit_adj: true,    // Can surrender CL to cover hour deficit
        counts_as_lwp_for_payroll: false,
        is_ml_type: false,
        allow_half_day: false,
        max_consecutive_days: 2,           // Default CL rule: max 2 consecutive days
      },
    ]);

    // 5. Seed Default App Settings
    await supabaseAdmin.from('app_settings').insert({
      company_id:       companyId,
      theme:            'dark_indigo',
      font_family:      'Outfit',
      font_size:        'md',
      // Work schedule defaults — superadmin configures via Setup Wizard
      week_off_type:    'fixed',     // 'fixed' | 'rotating'
      week_off_days:    [0],         // [0] = Sunday
      overtime_tracking: false,      // true = compute & store, hidden from employees
    });

    // 6. Seed company_modules (all 18 modules with sensible defaults)
    await supabaseAdmin.from('company_modules').insert(
      DEFAULT_TENANT_MODULES.map(m => ({ ...m, company_id: companyId }))
    );

    // 7. Write audit log
    await supabaseAdmin.from('platform_audit_log').insert({
      actor_role:  'platform_owner',
      action:      'TENANT_CREATED',
      target_type: 'company',
      target_id:   companyId,
      new_value:   { name, subdomain, admin_email: adminEmail },
    });

    return NextResponse.json({ ok: true, companyId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
