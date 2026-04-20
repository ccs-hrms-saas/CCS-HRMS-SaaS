import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/reimbursements/requests/[id]/approve
 *
 * Body:
 *   { approver_id, note?, reject?: true, rejection_reason?, approved_amount? }
 *
 * Logic:
 *   1. Fetch the request + its type's approval_chain
 *   2. Validate the caller is the correct approver for current_stage
 *      (matches role / job_role / department / specific person)
 *   3. If reject=true → status='rejected', rejection_reason set
 *   4. If last stage → status='approved' (or partial if approved_amount set)
 *   5. Otherwise → advance current_stage + notify next approver
 *   6. Write audit entry to approvals JSONB
 *
 * Tier enforcement:
 *   - partial_approval_enabled must be true (Advanced) to pass approved_amount
 *   - approver_type gating is already enforced at type creation time
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Resolve whether approver_id is valid for a given chain stage ───────────
async function isValidApprover(
  approverId: string,
  companyId: string,
  stage: Record<string, any>,
): Promise<boolean> {
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, job_role, department')
    .eq('id', approverId)
    .eq('company_id', companyId)
    .single();

  if (!callerProfile) return false;

  switch (stage.approver_type) {
    case 'role':
      return callerProfile.role === stage.value;
    case 'job_role':
      return callerProfile.job_role === stage.value;
    case 'department':
      return callerProfile.department === stage.value;
    case 'person':
      return approverId === stage.value;
    default:
      return false;
  }
}

// ── Helper: notify next stage approver ────────────────────────────────────
async function notifyNextApprover(
  companyId: string,
  stage: Record<string, any>,
  requestId: string,
  typeName: string,
  amount: number,
): Promise<void> {
  let approverIds: string[] = [];

  if (stage.approver_type === 'role') {
    const { data } = await admin.from('profiles').select('id').eq('company_id', companyId).eq('role', stage.value);
    approverIds = (data ?? []).map((p: any) => p.id);
  } else if (stage.approver_type === 'job_role') {
    const { data } = await admin.from('profiles').select('id').eq('company_id', companyId).eq('job_role', stage.value);
    approverIds = (data ?? []).map((p: any) => p.id);
  } else if (stage.approver_type === 'department') {
    const { data } = await admin.from('profiles').select('id').eq('company_id', companyId).eq('department', stage.value);
    approverIds = (data ?? []).map((p: any) => p.id);
  } else if (stage.approver_type === 'person') {
    approverIds = [stage.value];
  }

  await Promise.all(
    approverIds.map(aid =>
      admin.from('notifications').insert({
        user_id: aid,
        title:   '💰 Reimbursement Claim Awaiting Your Approval',
        message: `A ₹${amount} ${typeName} claim is pending your approval (Stage ${stage.stage}).`,
        link:    '/dashboard/admin/reimbursements',
      })
    )
  );
}

// ── Notify employee of final decision ─────────────────────────────────────
async function notifyEmployee(
  userId: string,
  typeName: string,
  amount: number,
  approved: boolean,
  approvedAmount?: number | null,
  rejectionReason?: string | null,
): Promise<void> {
  const title   = approved ? '✅ Reimbursement Claim Approved' : '❌ Reimbursement Claim Rejected';
  let message = '';

  if (approved) {
    if (approvedAmount !== null && approvedAmount !== undefined && approvedAmount < amount) {
      message = `Your ${typeName} claim of ₹${amount} was partially approved for ₹${approvedAmount}.`;
    } else {
      message = `Your ${typeName} claim of ₹${amount} has been fully approved.`;
    }
  } else {
    message = `Your ${typeName} claim of ₹${amount} was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`;
  }

  await admin.from('notifications').insert({
    user_id: userId,
    title,
    message,
    link: '/dashboard/employee/reimbursements',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// POST Handler
// ══════════════════════════════════════════════════════════════════════════
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: requestId } = await params;
    const body = await req.json();
    const {
      approver_id,
      note,
      reject,
      rejection_reason,
      approved_amount,  // Only valid in Advanced tier with partial_approval_enabled
    } = body;

    if (!requestId || !approver_id) {
      return NextResponse.json({ error: 'requestId and approver_id are required' }, { status: 400 });
    }

    // ── 1. Fetch the request ──────────────────────────────────────────────
    const { data: req_row, error: reqErr } = await admin
      .from('reimbursement_requests')
      .select('*, reimbursement_types(name, approval_chain, max_amount)')
      .eq('id', requestId)
      .single();

    if (reqErr || !req_row) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    if (req_row.status !== 'pending') {
      return NextResponse.json({ error: `Request is already ${req_row.status}` }, { status: 409 });
    }

    const companyId: string       = req_row.company_id;
    const chain: any[]            = req_row.reimbursement_types?.approval_chain ?? [];
    const currentStageIndex: number = req_row.current_stage;
    const typeName: string        = req_row.reimbursement_types?.name ?? 'Reimbursement';
    const amount: number          = req_row.amount;

    // ── 2. Get module props (for partial approval check) ──────────────────
    const { data: modRow } = await admin
      .from('company_modules')
      .select('properties')
      .eq('company_id', companyId)
      .eq('module_key', 'reimbursements')
      .single();

    const props: Record<string, any>    = modRow?.properties ?? {};
    const partialEnabled: boolean        = props.partial_approval_enabled ?? false;

    // ── 3. Validate approver for current stage ────────────────────────────
    if (chain.length === 0) {
      // No chain defined — only superadmin can approve
      const { data: callerProfile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', approver_id)
        .eq('company_id', companyId)
        .single();

      if (!callerProfile || callerProfile.role !== 'superadmin') {
        return NextResponse.json({ error: 'Only superadmin can approve this claim (no approval chain configured)' }, { status: 403 });
      }
    } else {
      if (currentStageIndex >= chain.length) {
        return NextResponse.json({ error: 'All approval stages already completed' }, { status: 409 });
      }

      const currentStageDef = chain[currentStageIndex];
      const valid = await isValidApprover(approver_id, companyId, currentStageDef);
      if (!valid) {
        return NextResponse.json({
          error: `You are not the designated approver for stage ${currentStageIndex + 1} of this claim.`,
          stage: currentStageDef,
        }, { status: 403 });
      }
    }

    // ── 4. Fetch approver name ────────────────────────────────────────────
    const { data: approverProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', approver_id)
      .single();
    const approverName = approverProfile?.full_name ?? 'Approver';

    const now = new Date().toISOString();

    // ── 5. Handle rejection ───────────────────────────────────────────────
    if (reject) {
      const approvalEntry = {
        stage:         currentStageIndex + 1,
        approved_by:   approver_id,
        approver_name: approverName,
        at:            now,
        note:          note ?? null,
        action:        'rejected',
      };

      const { error: updateErr } = await admin
        .from('reimbursement_requests')
        .update({
          status:             'rejected',
          rejection_reason:   rejection_reason ?? note ?? null,
          rejected_at_stage:  currentStageIndex + 1,
          approvals:          [...(req_row.approvals ?? []), approvalEntry],
          updated_at:         now,
        })
        .eq('id', requestId);

      if (updateErr) throw updateErr;

      await notifyEmployee(req_row.user_id, typeName, amount, false, null, rejection_reason ?? note ?? null);
      return NextResponse.json({ ok: true, action: 'rejected' });
    }

    // ── 6. Handle partial amount (Advanced tier check) ────────────────────
    let finalApprovedAmount: number | null = null;
    if (approved_amount !== undefined && approved_amount !== null) {
      if (!partialEnabled) {
        return NextResponse.json({
          error: 'Partial approval is not enabled for this company. Upgrade to Advanced reimbursements tier.',
        }, { status: 403 });
      }
      if (approved_amount > amount) {
        return NextResponse.json({ error: 'approved_amount cannot exceed the claimed amount' }, { status: 400 });
      }
      finalApprovedAmount = approved_amount;
    }

    // ── 7. Build approval entry for audit trail ───────────────────────────
    const approvalEntry = {
      stage:          currentStageIndex + 1,
      approved_by:    approver_id,
      approver_name:  approverName,
      at:             now,
      note:           note ?? null,
      partial_amount: finalApprovedAmount,
      action:         'approved',
    };
    const updatedApprovals = [...(req_row.approvals ?? []), approvalEntry];

    // ── 8. Check if this is the final stage ──────────────────────────────
    const isLastStage = chain.length === 0 || currentStageIndex >= chain.length - 1;

    if (isLastStage) {
      const { error: updateErr } = await admin
        .from('reimbursement_requests')
        .update({
          status:          'approved',
          approved_amount: finalApprovedAmount,
          approvals:       updatedApprovals,
          updated_at:      now,
        })
        .eq('id', requestId);

      if (updateErr) throw updateErr;

      await notifyEmployee(req_row.user_id, typeName, amount, true, finalApprovedAmount, null);
      return NextResponse.json({ ok: true, action: 'approved', final: true });

    } else {
      // ── 9. Advance to next stage ────────────────────────────────────────
      const nextStageIndex = currentStageIndex + 1;
      const { error: updateErr } = await admin
        .from('reimbursement_requests')
        .update({
          current_stage:   nextStageIndex,
          approvals:       updatedApprovals,
          updated_at:      now,
        })
        .eq('id', requestId);

      if (updateErr) throw updateErr;

      // Notify next stage approver
      const nextStageDef = chain[nextStageIndex];
      await notifyNextApprover(companyId, nextStageDef, requestId, typeName, amount);

      return NextResponse.json({
        ok: true,
        action: 'stage_approved',
        next_stage: nextStageIndex + 1,
        next_approver_type: nextStageDef.approver_type,
        next_approver_label: nextStageDef.label,
      });
    }

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
