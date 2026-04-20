import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET  /api/reimbursements/types?company_id=<uuid>
 *   List all active reimbursement types for a company.
 *   Available to any authenticated member of the company (RLS enforced).
 *
 * POST /api/reimbursements/types
 *   Body: { company_id, name, description?, max_amount?, requires_receipt?, approval_chain? }
 *   Creates a new reimbursement type.
 *   Enforces:
 *     - Caller must be superadmin or admin of the company
 *     - max_categories cap from the reimbursements module properties
 *     - approval_chain depth vs max_approval_chain_depth property
 *     - requires_receipt: can only be false if allow_optional_receipt = true (Advanced)
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Helper: get reimbursements module props for a company ──────────────────
async function getReimbProps(companyId: string): Promise<Record<string, any>> {
  const { data } = await admin
    .from('company_modules')
    .select('is_enabled, properties')
    .eq('company_id', companyId)
    .eq('module_key', 'reimbursements')
    .single();
  return data ?? { is_enabled: false, properties: {} };
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('company_id');
    if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

    const mod = await getReimbProps(companyId);
    if (!mod.is_enabled) {
      return NextResponse.json({ error: 'Reimbursements module is not enabled for this company' }, { status: 403 });
    }

    const { data, error } = await admin
      .from('reimbursement_types')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return NextResponse.json({ ok: true, types: data ?? [] });
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
      caller_id,      // UUID of the admin/superadmin making the call
      name,
      description,
      max_amount,
      requires_receipt,
      approval_chain,
    } = body;

    if (!company_id || !name || !caller_id) {
      return NextResponse.json({ error: 'company_id, caller_id, and name are required' }, { status: 400 });
    }

    // ── 1. Verify caller is admin or superadmin of this company ───────────
    const { data: caller } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller_id)
      .eq('company_id', company_id)
      .single();

    if (!caller || !['superadmin', 'admin'].includes(caller.role)) {
      return NextResponse.json({ error: 'Only admins and superadmins can create reimbursement types' }, { status: 403 });
    }

    // ── 2. Check module is enabled ────────────────────────────────────────
    const mod = await getReimbProps(company_id);
    if (!mod.is_enabled) {
      return NextResponse.json({ error: 'Reimbursements module is not enabled for this company' }, { status: 403 });
    }

    const props: Record<string, any> = mod.properties ?? {};
    const tier: string = props.tier ?? 'basic';
    const maxCategories: number = props.max_categories ?? 3;
    const maxChainDepth: number = props.max_approval_chain_depth ?? 1;
    const allowOptionalReceipt: boolean = props.allow_optional_receipt ?? false;

    // ── 3. Enforce max_categories cap ─────────────────────────────────────
    const { count } = await admin
      .from('reimbursement_types')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company_id)
      .eq('is_active', true);

    if ((count ?? 0) >= maxCategories) {
      return NextResponse.json({
        error: `Category limit reached. Your ${tier} tier allows up to ${maxCategories} categories.`,
        tier,
        limit: maxCategories,
      }, { status: 403 });
    }

    // ── 4. Enforce approval chain depth ───────────────────────────────────
    const chain: any[] = approval_chain ?? [];
    if (chain.length > maxChainDepth) {
      return NextResponse.json({
        error: `Approval chain depth ${chain.length} exceeds limit of ${maxChainDepth} for your ${tier} tier.`,
        tier,
        limit: maxChainDepth,
      }, { status: 403 });
    }

    // ── 5. Enforce requires_receipt ───────────────────────────────────────
    const receiptRequired: boolean = requires_receipt ?? true;
    if (!receiptRequired && !allowOptionalReceipt) {
      return NextResponse.json({
        error: 'Optional receipt is not enabled for this company. Upgrade to Advanced tier.',
      }, { status: 403 });
    }

    // ── 6. Validate approval_chain approver types vs allowed tier ─────────
    // Basic: role only | Standard: role | Advanced: role, job_role, department, person
    const jobRoleApproverEnabled: boolean = props.job_role_approver_enabled ?? false;
    const deptApproverEnabled: boolean = props.department_approver_enabled ?? false;
    const personApproverEnabled: boolean = props.person_approver_enabled ?? false;

    for (const stage of chain) {
      if (stage.approver_type === 'job_role' && !jobRoleApproverEnabled) {
        return NextResponse.json({ error: 'Job-role based approvers require Advanced tier.' }, { status: 403 });
      }
      if (stage.approver_type === 'department' && !deptApproverEnabled) {
        return NextResponse.json({ error: 'Department-based approvers require Advanced tier.' }, { status: 403 });
      }
      if (stage.approver_type === 'person' && !personApproverEnabled) {
        return NextResponse.json({ error: 'Person-assigned approvers require Advanced tier.' }, { status: 403 });
      }
    }

    // ── 7. Insert ─────────────────────────────────────────────────────────
    const { data: newType, error: insertError } = await admin
      .from('reimbursement_types')
      .insert({
        company_id,
        name,
        description: description ?? null,
        max_amount: max_amount ?? null,
        requires_receipt: receiptRequired,
        approval_chain: chain,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: `A category named "${name}" already exists.` }, { status: 409 });
      }
      throw insertError;
    }

    return NextResponse.json({ ok: true, type: newType });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
