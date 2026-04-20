import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET  /api/reimbursements/requests?company_id=<uuid>&user_id=<uuid>&role=<role>
 *   Employees see only their own. Admins/superadmins see all.
 *   Optional: &status=pending|approved|rejected
 *
 * POST /api/reimbursements/requests
 *   Body: { company_id, user_id, type_id, amount, description?, receipt_url? }
 *   Enforces:
 *     - Module enabled
 *     - max_claims_per_month cap (null = unlimited in Advanced)
 *     - receipt required if type.requires_receipt = true
 *     - amount ≤ type.max_amount (if set)
 *     - Sets receipt_expires_at from module property receipt_retention_days
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('company_id');
    const userId    = searchParams.get('user_id');
    const role      = searchParams.get('role');       // 'employee' | 'admin' | 'superadmin'
    const status    = searchParams.get('status');     // optional filter

    if (!companyId || !userId) {
      return NextResponse.json({ error: 'company_id and user_id are required' }, { status: 400 });
    }

    let query = admin
      .from('reimbursement_requests')
      .select(`
        *,
        reimbursement_types ( name, approval_chain, max_amount ),
        profiles!reimbursement_requests_user_id_fkey ( full_name )
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    // Employees only see their own requests
    if (!['admin', 'superadmin'].includes(role ?? '')) {
      query = query.eq('user_id', userId);
    }

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, requests: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      company_id,
      user_id,
      type_id,
      amount,
      description,
      receipt_url,
    } = body;

    if (!company_id || !user_id || !type_id || !amount) {
      return NextResponse.json({ error: 'company_id, user_id, type_id, amount are required' }, { status: 400 });
    }

    // ── 1. Check module is enabled and get properties ──────────────────────
    const { data: modRow } = await admin
      .from('company_modules')
      .select('is_enabled, properties')
      .eq('company_id', company_id)
      .eq('module_key', 'reimbursements')
      .single();

    if (!modRow?.is_enabled) {
      return NextResponse.json({ error: 'Reimbursements module is not enabled for this company' }, { status: 403 });
    }

    const props: Record<string, any> = modRow.properties ?? {};
    const tier: string              = props.tier ?? 'basic';
    const maxPerMonth: number | null = props.max_claims_per_month ?? 1;
    const retentionDays: number | null = props.receipt_retention_days ?? 90;

    // ── 2. Get the reimbursement type ─────────────────────────────────────
    const { data: typeRow, error: typeErr } = await admin
      .from('reimbursement_types')
      .select('*')
      .eq('id', type_id)
      .eq('company_id', company_id)
      .eq('is_active', true)
      .single();

    if (typeErr || !typeRow) {
      return NextResponse.json({ error: 'Reimbursement type not found or inactive' }, { status: 404 });
    }

    // ── 3. Enforce receipt requirement ────────────────────────────────────
    if (typeRow.requires_receipt && !receipt_url) {
      return NextResponse.json({
        error: `A receipt is required for "${typeRow.name}" claims. Please upload a receipt.`,
      }, { status: 400 });
    }

    // ── 4. Enforce amount cap ─────────────────────────────────────────────
    if (typeRow.max_amount !== null && amount > typeRow.max_amount) {
      return NextResponse.json({
        error: `Claim amount ₹${amount} exceeds the maximum of ₹${typeRow.max_amount} for "${typeRow.name}".`,
      }, { status: 400 });
    }

    // ── 5. Enforce monthly claim limit ────────────────────────────────────
    if (maxPerMonth !== null) {
      const now    = new Date();
      const from   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const to     = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { count } = await admin
        .from('reimbursement_requests')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', company_id)
        .eq('user_id', user_id)
        .gte('created_at', from)
        .lte('created_at', to);

      if ((count ?? 0) >= maxPerMonth) {
        return NextResponse.json({
          error: `Monthly claim limit reached. Your plan (${tier}) allows ${maxPerMonth} claim${maxPerMonth === 1 ? '' : 's'} per month.`,
          tier,
          limit: maxPerMonth,
        }, { status: 403 });
      }
    }

    // ── 6. Calculate receipt expiry date ──────────────────────────────────
    let receiptExpiresAt: string | null = null;
    if (receipt_url && retentionDays !== null) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + retentionDays);
      receiptExpiresAt = expiry.toISOString().split('T')[0];
    }

    // ── 7. Insert the request ─────────────────────────────────────────────
    const { data: newRequest, error: insertError } = await admin
      .from('reimbursement_requests')
      .insert({
        company_id,
        user_id,
        type_id,
        amount,
        description:       description ?? null,
        receipt_url:       receipt_url ?? null,
        status:            'pending',
        current_stage:     0,
        approvals:         [],
        receipt_expires_at: receiptExpiresAt,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // ── 8. Notify first-stage approver ────────────────────────────────────
    const chain: any[] = typeRow.approval_chain ?? [];
    if (chain.length > 0) {
      const firstStage = chain[0];
      await notifyApprover(company_id, firstStage, newRequest.id, typeRow.name, amount, user_id);
    }

    return NextResponse.json({ ok: true, request: newRequest });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── Helper: notify the approver for a given stage ─────────────────────────
async function notifyApprover(
  companyId: string,
  stage: Record<string, any>,
  requestId: string,
  typeName: string,
  amount: number,
  submittedByUserId: string,
): Promise<void> {
  // Resolve who to notify based on approver_type
  let approverIds: string[] = [];

  if (stage.approver_type === 'role') {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('role', stage.value);
    approverIds = (data ?? []).map((p: any) => p.id);

  } else if (stage.approver_type === 'job_role') {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('job_role', stage.value);
    approverIds = (data ?? []).map((p: any) => p.id);

  } else if (stage.approver_type === 'person') {
    approverIds = [stage.value]; // stage.value is the UUID

  } else if (stage.approver_type === 'department') {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('department', stage.value);
    approverIds = (data ?? []).map((p: any) => p.id);
  }

  // Fetch submitter name
  const { data: submitter } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', submittedByUserId)
    .single();

  const submitterName = submitter?.full_name ?? 'An employee';

  // Send in-app notification to each resolved approver
  await Promise.all(
    approverIds.map(approverId =>
      admin.from('notifications').insert({
        user_id:   approverId,
        title:     '💰 Reimbursement Claim Pending Approval',
        message:   `${submitterName} has submitted a ₹${amount} ${typeName} claim. Please review and approve.`,
        link:      '/dashboard/admin/reimbursements',
      })
    )
  );
}
