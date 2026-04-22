import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * DELETE /api/tenants/[id]
 *
 * Permanently deletes a tenant and ALL associated data including every
 * auth.users record belonging to that company.
 * After this call the email addresses are fully freed and can be
 * re-registered with no restrictions.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const companyId = params.id;

  if (!companyId) {
    return NextResponse.json({ error: 'Missing company id' }, { status: 400 });
  }

  try {
    // 1. Collect every auth user ID that belongs to this company.
    //    profiles.id is the auth.users UUID — fetch ALL roles (employees + admins).
    const { data: profiles, error: profilesErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('company_id', companyId);

    if (profilesErr) {
      console.error('Failed to fetch profiles for company', companyId, profilesErr);
      return NextResponse.json({ error: profilesErr.message }, { status: 500 });
    }

    // 2. Delete every auth user — this frees their email addresses immediately.
    //    Run sequentially to stay within Supabase rate limits.
    const failedDeletions: string[] = [];
    for (const profile of profiles ?? []) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(profile.id);
      if (error) {
        // Log but don't abort — we still want to remove the company row.
        console.warn(`Could not delete auth user ${profile.id}:`, error.message);
        failedDeletions.push(profile.id);
      }
    }

    // 3. Delete the company row.
    //    Foreign-key cascades handle: profiles, attendance_records, leave_types,
    //    leave_requests, leave_balances, company_modules, app_settings,
    //    departments, holidays, payroll_records, etc.
    const { error: companyErr } = await supabaseAdmin
      .from('companies')
      .delete()
      .eq('id', companyId);

    if (companyErr) {
      return NextResponse.json({ error: companyErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deleted_auth_users: (profiles?.length ?? 0) - failedDeletions.length,
      failed_auth_users:  failedDeletions,
    });

  } catch (err: any) {
    console.error('Tenant delete error:', err);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
