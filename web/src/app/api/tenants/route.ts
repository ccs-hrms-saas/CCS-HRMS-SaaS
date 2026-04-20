import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Default modules seeded for every new tenant (all off except essentials)
const DEFAULT_TENANT_MODULES = [
  { module_key: 'kpi_dashboard',       is_enabled: true,  properties: { visible_stats: ['staff_count','attendance_rate','pending_leaves'] } },
  { module_key: 'staff_management',    is_enabled: true,  properties: { max_seats: 50, allow_self_registration: false } },
  { module_key: 'attendance',          is_enabled: true,  properties: { clock_in_method: 'web', grace_period_minutes: 15 } },
  { module_key: 'kiosk_attendance',    is_enabled: false, properties: { max_devices: 3, require_device_pin: true, pin_rotation_days: 30, show_employee_photo: true } },
  { module_key: 'leave_management',    is_enabled: true,  properties: { max_leave_types: 10, allow_carryforward: false, partial_day_support: true } },
  { module_key: 'leave_settings',      is_enabled: true,  properties: { who_can_configure: 'superadmin_only' } },
  { module_key: 'overrides',           is_enabled: false, properties: { who_can_override: 'superadmin_only' } },
  { module_key: 'payroll',             is_enabled: false, properties: { currency: 'INR', payslip_format: 'detailed' } },
  { module_key: 'reports',             is_enabled: true,  properties: { enabled_reports: ['attendance_summary','leave_summary'] } },
  { module_key: 'announcements',       is_enabled: true,  properties: { who_can_post: 'all_admins', require_approval: false } },
  { module_key: 'hr_policies',         is_enabled: true,  properties: { who_can_publish: 'any_admin' } },
  { module_key: 'holidays',            is_enabled: true,  properties: { who_can_manage: 'superadmin_only' } },
  { module_key: 'appraisals',          is_enabled: false, properties: { frequency: 'annual' } },
  { module_key: 'organogram',          is_enabled: true,  properties: { mode: 'view_only' } },
  { module_key: 'permissions',         is_enabled: true,  properties: { depth: 'simple' } },
  { module_key: 'approvals',           is_enabled: false, properties: { multi_level_enabled: false } },
  { module_key: 'notifications',       is_enabled: true,  properties: { channels: ['in_app'] } },
  { module_key: 'employee_mobile_app', is_enabled: false, properties: { allow_leave_requests: true, allow_payslip_view: true, allow_attendance_view: true, require_biometric: false } },
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
      { company_id: companyId, name: 'Sick Leave',   max_days_per_year: 12, is_paid: true, deduction_hours: 8.5 },
      { company_id: companyId, name: 'Casual Leave', max_days_per_year: 10, is_paid: true, deduction_hours: 8.5 },
    ]);

    // 5. Seed Default App Settings
    await supabaseAdmin.from('app_settings').insert({
      company_id: companyId, theme: 'dark_indigo', font_family: 'Outfit', font_size: 'md',
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
