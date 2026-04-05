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

const DEDUCTION_ORDER = ["Earned Leave (EL)", "Comp Off", "Casual Leave (CL)"];
const ABSENCE_THRESHOLD = 3; // deduct only if truly absent > 3 days

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isoDate(d: Date) { return d.toISOString().split('T')[0]; }

function isWeeklyOff(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0) return true;
  if (dow === 6) {
    const wk = Math.ceil(date.getDate() / 7);
    return wk === 1 || wk === 3;
  }
  return false;
}

async function processEmployee(userId: string, from: string, to: string, holidaySet: Set<string>, fy: number) {
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
      approvedLeaveDates.add(isoDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
  });

  // 3. Count truly absent working days (no check-in, no approved leave)
  let trueAbsents = 0;
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  const todayStr = isoDate(new Date());
  while (cur <= end) {
    const ds = isoDate(cur);
    if (ds >= todayStr) { cur.setDate(cur.getDate() + 1); continue; } // skip future
    if (!isWeeklyOff(cur) && !holidaySet.has(ds) && !checkedInDates.has(ds) && !approvedLeaveDates.has(ds)) {
      trueAbsents++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (trueAbsents <= ABSENCE_THRESHOLD) {
    return { userId, trueAbsents, deducted: 0, from_type: null, note: `≤${ABSENCE_THRESHOLD} absent days, no deduction` };
  }

  const daysToDeduct = trueAbsents; // deduct all truly absent days

  // 4. Fetch all leave balances for this user/FY, filter to deduction-eligible types in JS
  const { data: balancesRaw } = await admin.from('leave_balances')
    .select('*, leave_types(name)')
    .eq('user_id', userId).eq('financial_year', fy);
  const balances = (balancesRaw ?? []).filter((b: any) => DEDUCTION_ORDER.includes(b.leave_types?.name));


  let remaining = daysToDeduct;
  const deductions: { type: string; days: number }[] = [];

  for (const leaveTypeName of DEDUCTION_ORDER) {
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
    const { user_id, run_all, from, to } = await req.json();

    if (!from || !to) return NextResponse.json({ error: 'from and to dates required' }, { status: 400 });

    // Current financial year
    const today = new Date();
    const fy = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();

    // Holidays
    const { data: holData } = await admin.from('company_holidays').select('date');
    const holidaySet = new Set<string>((holData ?? []).map((h: any) => h.date));

    let userIds: string[] = [];
    if (run_all) {
      const { data } = await admin.from('profiles').select('id').eq('is_active', true).eq('role', 'employee');
      userIds = (data ?? []).map((p: any) => p.id);
    } else if (user_id) {
      userIds = [user_id];
    } else {
      return NextResponse.json({ error: 'user_id or run_all required' }, { status: 400 });
    }

    const results = await Promise.all(userIds.map(id => processEmployee(id, from, to, holidaySet, fy)));
    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
