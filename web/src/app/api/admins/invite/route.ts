import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/admins/invite
 *
 * Creates a new platform-level user (platform_admin).
 * Only callable by the platform_owner session (verified via cookie).
 *
 * Body: { email, password, fullName, role: 'platform_admin' }
 */
export async function POST(req: Request) {
  try {
    const { email, password, fullName, role } = await req.json();

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'email, password, and fullName are required' }, { status: 400 });
    }

    // Only platform_admin is allowed via this endpoint
    const allowedRoles = ['platform_admin'];
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Only platform_admin is permitted.' }, { status: 400 });
    }

    // 1. Create auth user
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email verification
    });

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    // 2. Update their profile with the system_role
    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        full_name:   fullName,
        system_role: role,
        company_id:  null, // platform admins have no tenant
      })
      .eq('id', authUser.user.id);

    if (profileErr) {
      // Rollback: delete the auth user if profile update failed
      await admin.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    return NextResponse.json({ id: authUser.user.id, email, fullName, role });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
