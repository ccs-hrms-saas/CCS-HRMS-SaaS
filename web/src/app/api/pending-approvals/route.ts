import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/pending-approvals
 * Submit a new action for Super Admin review.
 * Body: {
 *   action_type: 'role_change' | 'organogram_change',
 *   requested_by: string,       // admin's user_id
 *   target_user_id?: string,    // for role_change
 *   payload: object             // action-specific data
 * }
 */
export async function POST(req: Request) {
  try {
    const { action_type, requested_by, target_user_id, payload } = await req.json();

    if (!action_type || !requested_by || !payload) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch requester profile for the notification message
    const { data: requester } = await admin.from('profiles').select('full_name').eq('id', requested_by).single();

    // Build human-readable description for notification
    let description = '';
    if (action_type === 'role_change') {
      const { data: target } = await admin.from('profiles').select('full_name').eq('id', target_user_id).single();
      description = `${requester?.full_name} wants to change ${target?.full_name}'s role from ${payload.old_role} → ${payload.new_role}`;
    } else if (action_type === 'organogram_change') {
      const count = payload.changes?.length ?? 0;
      description = `${requester?.full_name} wants to reassign ${count} reporting line(s) in the Organogram`;
    }

    // Insert pending approval
    const { data: approval, error: insertErr } = await admin.from('pending_approvals').insert({
      action_type,
      requested_by,
      target_user_id: target_user_id ?? null,
      payload,
      status: 'pending',
    }).select().single();

    if (insertErr) throw new Error(insertErr.message);

    // Notify all super admins
    const { data: superAdmins } = await admin.from('profiles').select('id').eq('role', 'superadmin').eq('is_active', true);
    if (superAdmins && superAdmins.length > 0) {
      await admin.from('notifications').insert(
        superAdmins.map(sa => ({
          user_id: sa.id,
          title: '⏳ Approval Required',
          message: description,
          link: '/dashboard/admin/approvals',
        }))
      );
    }

    return NextResponse.json({ ok: true, approval_id: approval.id, description });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/pending-approvals
 * Fetch all pending (or all) approvals — super admin only.
 * Query: ?status=pending|all
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ?? 'pending';

    let query = admin.from('pending_approvals')
      .select(`*, 
        requester:requested_by(full_name, designation),
        target:target_user_id(full_name, role, designation)
      `)
      .order('created_at', { ascending: false });

    if (status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
