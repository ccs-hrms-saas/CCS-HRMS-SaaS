import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/absence-deduction
 * Called by admin/manager to process leave deductions for employees
 * who were truly absent (no check-in, no approved leave) for > 3 days.
 *
 * Deduction order: EL → Comp Off → CL
 * NEVER deducts SL or Menstruation Leave (case-by-case)
 *
 * Body: { user_id: string, from: string, to: string }
 * OR:   { run_all: true, from: string, to: string }  ← bulk for all active employees
 */

// Deduction order is now DYNAMIC — fetched from the tenant's leave_types table.
// All paid, non-ML leave types are eligible for deduction, ordered by name.
const ABSENCE_THRESHOLD = 3; // deduct only if truly absent > 3 days

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function localIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── processEmployee now receives the tenant's work schedule days ──────────────
async function processEmployee(
  userId: string,
  from: string,
  to: string,
  holidaySet: Set<string>,
  weekOffDays: number[],
  fy: number,
  companyId: string    // ← needed to fetch tenant-specific leave types
) {
  // 1. Get all attendance records in range
  const { data: attData } = await admin.from('attendance_records')
    .select('date').eq('user_id', userId).gte('date', from).lte('date', to);
  const checkedInDates = new Set((attData ?? []).map((r: any) => r.date));

  // 2. Get all approved leaves in range
  const { data: lvData } = await admin.from('leave_requests')
    .select('start_date, end_date, type')
    .eq('user_id', userId).eq('status', 'approved')
    .lte('start_date', to).gte('end_date', from);

  const approvedLeaveDates = new Set<string>();
  (lvData ?? []).forEach((lv: any) => {
    const cur = new Date(lv.start_date + 'T00:00:00');
    const end = new Date(lv.end_date + 'T00:00:00');
    while (cur <= end) {
      approvedLeaveDates.add(localIsoDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
  });

  // 3. Count truly absent working days (no check-in, no approved leave)
  let trueAbsents = 0;
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  const todayStr = localIsoDate(new Date());
  while (cur <= end) {
    const ds = localIsoDate(cur);
    if (ds >= todayStr) { cur.setDate(cur.getDate() + 1); continue; } // skip future
    const dow = cur.getDay();
    const isWeeklyOff = weekOffDays.includes(dow);
    if (!isWeeklyOff && !holidaySet.has(ds) && !checkedInDates.has(ds) && !approvedLeaveDates.has(ds)) {
      trueAbsents++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (trueAbsents <= ABSENCE_THRESHOLD) {
    return { userId, trueAbsents, deducted: 0, from_type: null, note: `≤${ABSENCE_THRESHOLD} absent days, no deduction` };
  }

  const daysToDeduct = trueAbsents; // deduct all truly absent days

  // 4. Fetch tenant's leave types to determine deduction order dynamically
  const { data: tenantLeaveTypes } = await admin.from('leave_types')
    .select('name, is_paid, is_ml_type')
    .eq('company_id', companyId);
  
  // Eligible for deduction: paid, non-ML types (SL/ML are case-by-case, never auto-deducted)
  const deductionOrder = (tenantLeaveTypes ?? [])
    .filter((t: any) => t.is_paid && !t.is_ml_type)
    .map((t: any) => t.name);

  const { data: balancesRaw } = await admin.from('leave_balances')
    .select('*, leave_types(name)')
    .eq('user_id', userId).eq('financial_year', fy);
  const balances = (balancesRaw ?? []).filter((b: any) => deductionOrder.includes(b.leave_types?.name));


  let remaining = daysToDeduct;
  const deductions: { type: string; days: number }[] = [];

  for (const leaveTypeName of deductionOrder) {
    if (remaining <= 0) break;
    const bal = (balances ?? []).find((b: any) => b.leave_types?.name === leaveTypeName);
    if (!bal) continue;
    const available = Math.max(0, (bal.accrued ?? 0) - (bal.used ?? 0));
    if (available <= 0) continue;
    const deduct = Math.min(remaining, available);
    await admin.from('leave_balances').update({ used: (bal.used ?? 0) + deduct }).eq('id', bal.id);
    deductions.push({ type: leaveTypeName, days: deduct });
    remaining -= deduct;
  }

  // 5. Remaining after all leaves exhausted = LWP (no deduction needed, just log)
  const totalDeducted = daysToDeduct - remaining;

  return { userId, trueAbsents, deducted: totalDeducted, deductions, lwpDays: remaining };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_id, run_all, from, to, month_year } = body;

    if (!from || !to) return NextResponse.json({ error: 'from and to dates required' }, { status: 400 });

    const monthKey: string = month_year ?? (from as string).substring(0, 7); // e.g. '2026-04'

    // ── Idempotency: skip if already processed this month ──
    if (run_all) {
      const { data: existing } = await admin
        .from('absence_deduction_runs')
        .select('id')
        .eq('month_year', monthKey)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ ok: true, skipped: true, reason: `Already processed for ${monthKey}` });
      }
    }

    // Financial year based on the from date
    const fromDate = new Date(from as string);
    const fy = fromDate.getMonth() < 3 ? fromDate.getFullYear() - 1 : fromDate.getFullYear();

    // Determine company_id: either from the request body (admin API) or from caller's profile
    const companyId: string | undefined = body.company_id;
    if (!companyId) {
      return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
    }

    // Fetch the tenant's work schedule so we honour their week-off days
    const { data: appSettings } = await admin
      .from('app_settings')
      .select('week_off_type, week_off_days, week_off_rules')
      .eq('company_id', companyId)
      .single();
    // Default: Sunday off only (safe fallback)
    const weekOffDays: number[] = Array.isArray(appSettings?.week_off_days)
      ? appSettings.week_off_days
      : [0];

    // Holidays — scoped to this tenant only
    const { data: holData } = await admin
      .from('company_holidays')
      .select('date')
      .eq('company_id', companyId);
    const holidaySet = new Set<string>((holData ?? []).map((h: any) => h.date));

    let userIds: string[] = [];
    if (run_all) {
      // Employees scoped to this company only
      const { data } = await admin
        .from('profiles')
        .select('id')
        .eq('is_active', true)
        .eq('company_id', companyId)
        .not('role', 'eq', 'superadmin')
        .is('system_role', null);
      userIds = (data ?? []).map((p: any) => p.id);
    } else if (user_id) {
      userIds = [user_id];
    } else {
      return NextResponse.json({ error: 'user_id or run_all required' }, { status: 400 });
    }

    const results = await Promise.all(
      userIds.map(id => processEmployee(id, from as string, to as string, holidaySet, weekOffDays, fy, companyId))
    );

    // ── Log this run so it never repeats for the same month ──
    if (run_all) {
      const totalDays = results.reduce((s, r) => s + (r.deducted ?? 0), 0);
      await admin.from('absence_deduction_runs').insert({
        month_year: monthKey,
        employees_processed: userIds.length,
        total_days_deducted: totalDays,
      });
    }

    // ── Notify each employee whose balance was auto-adjusted ──
    for (const r of results) {
      if ((r.deducted ?? 0) > 0) {
        await admin.from('notifications').insert({
          user_id: r.userId,
          title: '📋 Leave Balance Auto-Adjusted',
          message: `${r.deducted} absence day(s) in ${monthKey} were automatically deducted from your leave balance as per company policy.`,
          link: '/dashboard/employee/leaves',
        });
      }
    }

    return NextResponse.json({ ok: true, month_year: monthKey, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

