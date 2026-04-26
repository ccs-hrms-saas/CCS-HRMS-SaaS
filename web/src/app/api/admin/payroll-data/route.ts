import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role bypasses ALL RLS — this is intentional for admin payroll calculations.
// Caller authentication is verified below before any data is returned.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/admin/payroll-data?year=YYYY&month=M
 *
 * Fetches all data required for payroll calculation for a given month.
 * Uses the service role key to bypass RLS — this is critical because:
 *   - attendance_records may have company_id = NULL on some rows (manual overrides)
 *   - The RESTRICTIVE tenant isolation policy blocks company_id=NULL rows for
 *     ALL client-side queries, even for admins.
 *   - Querying by user_id IN (company_employees) instead of company_id ensures
 *     every valid attendance record is found regardless of company_id state.
 *
 * Caller must be authenticated as admin or superadmin.
 */
export async function GET(req: NextRequest) {
  try {
    // ── 1. Authenticate caller ──────────────────────────────────────────────
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    // ── 2. Verify admin role + get company_id ───────────────────────────────
    const { data: caller } = await admin.from('profiles')
      .select('role, company_id, system_role')
      .eq('id', user.id)
      .single()

    const isDev   = caller?.system_role === 'developer'
    const isAdmin = caller?.role === 'admin' || caller?.role === 'superadmin'
    if (!isAdmin && !isDev) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = caller?.company_id
    if (!companyId && !isDev) return NextResponse.json({ error: 'No company' }, { status: 403 })

    // ── 3. Parse query params ───────────────────────────────────────────────
    const { searchParams } = new URL(req.url)
    const year  = Number(searchParams.get('year'))
    const month = Number(searchParams.get('month'))
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Valid year and month params required' }, { status: 400 })
    }

    const mStartStr = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay   = new Date(year, month, 0).getDate()
    const mEndStr   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    // ── 4. Fetch all active employees for this company ──────────────────────
    const { data: employees } = await admin.from('profiles')
      .select('id, full_name, remuneration, joining_date, hours_per_day, weekly_off_day, role')
      .eq('company_id', companyId!)
      .eq('is_active', true)
      .not('role', 'eq', 'superadmin')
      .is('system_role', null)

    const empIds = (employees ?? []).map((e: any) => e.id)
    if (empIds.length === 0) {
      return NextResponse.json({ employees: [], attendance: [], leaves: [], leaveTypes: [], adjustments: [], holidays: [], appSettings: null, overtimeRecords: [] })
    }

    // ── 5. Fetch all data in parallel — all via service role (bypasses RLS) ─
    // CRITICAL: attendance is queried by user_id IN (empIds), NOT by company_id.
    // This ensures records with company_id=NULL (manual overrides before fix) are
    // still found. The employee-membership check (empIds) is the security boundary.
    const [
      { data: attendance },
      { data: leaves },
      { data: leaveTypes },
      { data: adjustments },
      { data: holidays },
      { data: appSettings },
      { data: overtimeRecords },
    ] = await Promise.all([
      admin.from('attendance_records')
        .select('user_id, date, check_in')
        .in('user_id', empIds)           // ← scoped by employee membership, not company_id
        .gte('date', mStartStr)
        .lte('date', mEndStr),

      admin.from('leave_requests')
        .select('user_id, type, start_date, end_date, status')
        .in('user_id', empIds)           // ← same: employee membership as security boundary
        .eq('status', 'approved')
        .lte('start_date', mEndStr)      // overlapping range: start_date <= monthEnd
        .gte('end_date', mStartStr),     // AND end_date >= monthStart

      admin.from('leave_types')
        .select('name, is_paid')
        .eq('company_id', companyId!),

      admin.from('deficit_adjustments')
        .select('user_id, hours_cleared')
        .in('user_id', empIds)
        .eq('adjusted_against', 'LWP')
        .gte('adjustment_date', mStartStr)
        .lte('adjustment_date', mEndStr),

      admin.from('company_holidays')
        .select('id, date, scope')
        .eq('company_id', companyId!),

      admin.from('app_settings')
        .select('*')
        .eq('company_id', companyId!)
        .single(),

      admin.from('attendance_records')
        .select('user_id, overtime_hours')
        .in('user_id', empIds)
        .gte('date', mStartStr)
        .lte('date', mEndStr)
        .gt('overtime_hours', 0),
    ])

    return NextResponse.json({
      employees:      employees      ?? [],
      attendance:     attendance     ?? [],
      leaves:         leaves         ?? [],
      leaveTypes:     leaveTypes     ?? [],
      adjustments:    adjustments    ?? [],
      holidays:       holidays       ?? [],
      appSettings:    appSettings    ?? null,
      overtimeRecords: overtimeRecords ?? [],
    })

  } catch (err: any) {
    console.error('[payroll-data]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
