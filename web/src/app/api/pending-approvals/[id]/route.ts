import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * PATCH /api/pending-approvals/[id]
 * Super Admin approves or rejects a pending action.
 * Body: { action: 'approve' | 'reject', reviewer_id: string, reason?: string }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { action, reviewer_id, reason } = await req.json();
    const { id } = await params;


    if (!action || !reviewer_id) {
      return NextResponse.json({ error: 'action and reviewer_id required' }, { status: 400 });
    }

    // Verify reviewer is superadmin
    const { data: reviewer } = await admin.from('profiles').select('role, full_name').eq('id', reviewer_id).single();
    if (reviewer?.role !== 'superadmin') {
      return NextResponse.json({ error: 'Only Super Admin can approve/reject' }, { status: 403 });
    }

    // Fetch the approval record
    const { data: approval } = await admin.from('pending_approvals')
      .select('*, requester:requested_by(full_name)')
      .eq('id', id)
      .single();

    if (!approval) return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    if (approval.status !== 'pending') {
      return NextResponse.json({ error: `Already ${approval.status}` }, { status: 409 });
    }

    if (action === 'approve') {
      // ── Execute the deferred action ──
      if (approval.action_type === 'role_change') {
        const { new_role } = approval.payload;
        await admin.from('profiles').update({ role: new_role }).eq('id', approval.target_user_id);
      } else if (approval.action_type === 'organogram_change') {
        const { changes } = approval.payload as { changes: { userId: string; new_manager_id: string | null }[] };
        for (const c of changes) {
          await admin.from('profiles').update({ manager_id: c.new_manager_id ?? null }).eq('id', c.userId);
        }
      }

      // Mark approved
      await admin.from('pending_approvals').update({
        status: 'approved',
        reviewed_by: reviewer_id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', id);

      // Notify requesting admin
      await admin.from('notifications').insert({
        user_id: approval.requested_by,
        title: '✅ Action Approved',
        message: `${reviewer?.full_name} approved your ${approval.action_type === 'role_change' ? 'role change' : 'organogram update'} request.`,
        link: approval.action_type === 'role_change' ? '/dashboard/admin/users' : '/dashboard/admin/organogram',
      });

      return NextResponse.json({ ok: true, status: 'approved' });

    } else if (action === 'reject') {
      await admin.from('pending_approvals').update({
        status: 'rejected',
        reviewed_by: reviewer_id,
        rejection_reason: reason ?? 'No reason given',
        reviewed_at: new Date().toISOString(),
      }).eq('id', id);

      // Notify requesting admin with reason
      await admin.from('notifications').insert({
        user_id: approval.requested_by,
        title: '❌ Action Rejected',
        message: `${reviewer?.full_name} rejected your ${approval.action_type === 'role_change' ? 'role change' : 'organogram update'} request.${reason ? ' Reason: ' + reason : ''}`,
        link: '/dashboard/admin/approvals',
      });

      return NextResponse.json({ ok: true, status: 'rejected' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
