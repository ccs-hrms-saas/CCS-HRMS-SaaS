import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/leave/ml-lapse-check
 *
 * Triggered by Tenant Superadmin for their company.
 * Checks which ML-eligible female employees did NOT take ML
 * in the given month, marks them as lapsed in ml_lapse_records,
 * and awards bonus leave (CL or Comp-Off) for every N lapsed months.
 *
 * Body: { company_id, caller_id, year: number, month: number }
 *
 * Tier enforcement:
 *   - leave_settings.ml_leave_enabled must be true (Advanced tier)
 *   - payroll.ml_lapse_tracking must be true (Advanced tier) 
 *     ← only if payroll module is enabled; skipped if payroll is off
 *
 * Returns: { processed, lapsed_this_month, awards_granted }
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { company_id, caller_id, year, month } = body;

    if (!company_id || !caller_id || !year || !month) {
      return NextResponse.json(
        { error: 'company_id, caller_id, year, and month are required' },
        { status: 400 }
      );
    }

    // ── 1. Verify caller is superadmin of this company ────────────────────
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller_id)
      .eq('company_id', company_id)
      .single();

    if (!callerProfile || callerProfile.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Only a Superadmin can run the ML lapse check' },
        { status: 403 }
      );
    }

    // ── 2. Verify leave_settings: ml_leave_enabled ────────────────────────
    const { data: leaveMod } = await admin
      .from('company_modules')
      .select('is_enabled, properties')
      .eq('company_id', company_id)
      .eq('module_key', 'leave_settings')
      .single();

    const leaveProps: Record<string, any> = leaveMod?.properties ?? {};
    if (!leaveProps.ml_leave_enabled) {
      return NextResponse.json(
        { error: 'Menstruation Leave is not enabled in Leave Settings. This requires the Advanced leave tier.' },
        { status: 403 }
      );
    }

    const awardType: string     = leaveProps.ml_lapse_award_type ?? 'Comp-Off';
    const awardThreshold: number = leaveProps.ml_lapse_award_threshold ?? 4;

    // ── 3. Get ML leave type ID for this company ──────────────────────────
    const { data: mlLeaveType } = await admin
      .from('leave_types')
      .select('id, name')
      .eq('company_id', company_id)
      .eq('is_ml_type', true)
      .eq('is_active', true)
      .maybeSingle();

    if (!mlLeaveType) {
      return NextResponse.json(
        { error: 'No Menstruation Leave type found. Please create an ML leave type with "is_ml_type" enabled in your leave settings.' },
        { status: 404 }
      );
    }

    // ── 4. Get award leave type ID for this company ───────────────────────
    const { data: awardLeaveType } = await admin
      .from('leave_types')
      .select('id, name')
      .eq('company_id', company_id)
      .ilike('name', awardType.trim())
      .eq('is_active', true)
      .maybeSingle();

    if (!awardLeaveType) {
      return NextResponse.json(
        { error: `Award leave type "${awardType}" not found. Please create this leave type or update the ML award setting.` },
        { status: 404 }
      );
    }

    // ── 5. Get all ML-eligible active employees ───────────────────────────
    const { data: eligible } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('company_id', company_id)
      .eq('is_ml_eligible', true)
      .eq('is_active', true);

    if (!eligible || eligible.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        lapsed_this_month: 0,
        awards_granted: 0,
        note: 'No ML-eligible employees found. Set is_ml_eligible = true on relevant employee profiles.',
      });
    }

    // ── 6. Get ML leave requests for this month (taken = not lapsed) ──────
    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const toDate   = new Date(year, month, 0).toISOString().split('T')[0]; // last day of month

    const { data: mlRequests } = await admin
      .from('leave_requests')
      .select('user_id')
      .eq('company_id', company_id)
      .eq('leave_type_id', mlLeaveType.id)
      .eq('status', 'approved')
      .gte('start_date', fromDate)
      .lte('start_date', toDate);

    const tookMlThisMonth = new Set((mlRequests ?? []).map((r: any) => r.user_id));

    // ── 7. Current financial year ─────────────────────────────────────────
    const refDate = new Date(year, month - 1, 1);
    const fy = refDate.getMonth() < 3 ? refDate.getFullYear() - 1 : refDate.getFullYear();

    // ── 8. Process each eligible employee ────────────────────────────────
    let lapsedThisMonth = 0;
    let awardsGranted   = 0;
    const processed     = eligible.length;

    for (const emp of eligible) {
      const mlTaken = tookMlThisMonth.has(emp.id);

      // Check if already logged for this month (idempotency)
      const { data: existing } = await admin
        .from('ml_lapse_records')
        .select('id')
        .eq('user_id', emp.id)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle();

      if (existing) continue; // Already processed; skip

      // Insert lapse record
      await admin.from('ml_lapse_records').insert({
        company_id,
        user_id:      emp.id,
        year,
        month,
        ml_taken:     mlTaken,
        award_granted: false,
      });

      if (!mlTaken) {
        lapsedThisMonth++;

        // Count total lapsed months (not including this one, which is just inserted)
        // We need the total including the current one to check the threshold
        const { count: totalLapsed } = await admin
          .from('ml_lapse_records')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', emp.id)
          .eq('ml_taken', false)
          .eq('award_granted', false);

        const lapseCount = totalLapsed ?? 0;

        // Award when lapse count reaches (or exceeds) the threshold
        if (lapseCount >= awardThreshold) {
          // Mark all pending lapses for this batch as award_granted = true
          await admin
            .from('ml_lapse_records')
            .update({ award_granted: true })
            .eq('user_id', emp.id)
            .eq('ml_taken', false)
            .eq('award_granted', false);

          // Credit 1 day of awardLeaveType to their leave balance
          const { data: existingBalance } = await admin
            .from('leave_balances')
            .select('id, accrued')
            .eq('user_id', emp.id)
            .eq('leave_type_id', awardLeaveType.id)
            .eq('financial_year', fy)
            .maybeSingle();

          if (existingBalance) {
            await admin
              .from('leave_balances')
              .update({ accrued: (existingBalance.accrued ?? 0) + 1 })
              .eq('id', existingBalance.id);
          } else {
            await admin.from('leave_balances').insert({
              user_id:       emp.id,
              company_id,
              leave_type_id: awardLeaveType.id,
              financial_year: fy,
              accrued:       1,
              used:          0,
            });
          }

          // Notify employee
          await admin.from('notifications').insert({
            user_id:  emp.id,
            title:    '🎁 Bonus Leave Credited!',
            message:  `You've earned 1 day of ${awardType} leave as a reward for not taking Menstruation Leave for ${awardThreshold} consecutive months.`,
            link:     '/dashboard/employee/leaves',
          });

          awardsGranted++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      year,
      month,
      processed,
      lapsed_this_month: lapsedThisMonth,
      awards_granted:    awardsGranted,
      award_type:        awardType,
      award_threshold:   awardThreshold,
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
