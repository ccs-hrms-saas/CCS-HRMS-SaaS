import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/tenants/[id]/reset-admin-password
 *
 * Finds the superadmin of a company, generates a new temp password,
 * updates it via the Supabase admin API, and returns it in plain text
 * so the developer can send it to the client.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const companyId = id;

    // 1. Find the superadmin profile for this company
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('company_id', companyId)
      .eq('role', 'superadmin')
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Superadmin not found for this company' }, { status: 404 });
    }

    // 2. Get their email from auth.users
    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(profile.id);
    if (authErr || !authUser?.user) {
      return NextResponse.json({ error: 'Auth user not found' }, { status: 404 });
    }

    const email = authUser.user.email;

    // 3. Generate a memorable temp password
    const adjectives = ['Active', 'Bright', 'Clear', 'Daring', 'Elite'];
    const nouns      = ['Phoenix', 'Falcon', 'Summit', 'Harbor', 'Nexus'];
    const adj  = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num  = Math.floor(100 + Math.random() * 900);
    const newPassword = `${adj}${noun}${num}!`;

    // 4. Update the password
    const { error: updateErr } = await admin.auth.admin.updateUserById(profile.id, {
      password: newPassword,
    });

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      email,
      newPassword,
      adminName: profile.full_name ?? 'Company Admin',
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/tenants/[id]/reset-admin-password
 * Returns the superadmin's email and name for display in the Developer Panel.
 * Tries superadmin first, then falls back to any admin role in the company.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const companyId = id;

    // Try superadmin first, then any admin-level role
    let { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, role')
      .eq('company_id', companyId)
      .eq('role', 'superadmin')
      .maybeSingle();

    if (!profile) {
      // Fallback: any admin in this company
      const { data: fallback } = await admin
        .from('profiles')
        .select('id, full_name, role')
        .eq('company_id', companyId)
        .in('role', ['superadmin', 'admin'])
        .limit(1)
        .maybeSingle();
      profile = fallback;
    }

    if (!profile) {
      return NextResponse.json({
        error: `No admin found for company ${companyId}`,
        email: '—',
        adminName: 'No admin assigned yet',
        userId: null,
      });
    }

    const { data: authUser } = await admin.auth.admin.getUserById(profile.id);

    return NextResponse.json({
      email:     authUser?.user?.email ?? '—',
      adminName: profile.full_name ?? 'Company Admin',
      userId:    profile.id,
      role:      profile.role,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, email: '—', adminName: '—' }, { status: 500 });
  }
}
