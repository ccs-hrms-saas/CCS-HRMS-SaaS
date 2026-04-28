import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/debug/payroll-check?user_name=Ansh&year=2026&month=4
 * 
 * Diagnostic endpoint: shows raw data for a specific employee
 * so we can verify what the payroll engine actually sees.
 */
export async function GET(req: NextRequest) {
  try {
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!jwt) return NextResponse.json({ error: 'No token' }, { status: 401 })

    const { data: { user } } = await admin.auth.getUser(jwt)
    if (!user) return NextResponse.json({ error: 'Invalid' }, { status: 401 })

    const { data: caller } = await admin.from('profiles')
      .select('role, company_id, system_role')
      .eq('id', user.id).single()
    if (!caller || (caller.role !== 'superadmin' && caller.system_role !== 'developer'))
      return NextResponse.json({ error: 'Superadmin only' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const userName = searchParams.get('user_name') || ''
    const year = Number(searchParams.get('year') || 2026)
    const month = Number(searchParams.get('month') || 4)

    const mStartStr = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const mEndStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    // Find the employee
    const { data: employees } = await admin.from('profiles')
      .select('id, full_name, weekly_off_day, hours_per_day, joining_date, remuneration')
      .eq('company_id', caller.company_id!)
      .ilike('full_name', `%${userName}%`)
      .limit(5)

    if (!employees || employees.length === 0)
      return NextResponse.json({ error: 'No employee found matching: ' + userName })

    const empIds = employees.map(e => e.id)

    // Fetch all data
    const [
      { data: attendance },
      { data: leaves },
      { data: leaveTypes },
      { data: settings },
    ] = await Promise.all([
      admin.from('attendance_records')
        .select('user_id, date, check_in, check_out, company_id')
        .in('user_id', empIds)
        .gte('date', mStartStr)
        .lte('date', mEndStr)
        .order('date'),
      admin.from('leave_requests')
        .select('user_id, type, start_date, end_date, status, company_id, reason')
        .in('user_id', empIds)
        .eq('status', 'approved')
        .lte('start_date', mEndStr)
        .gte('end_date', mStartStr)
        .order('start_date'),
      admin.from('leave_types')
        .select('name, is_paid')
        .eq('company_id', caller.company_id!),
      admin.from('app_settings')
        .select('week_off_type, week_off_days, hours_per_day')
        .eq('company_id', caller.company_id!)
        .single(),
    ])

    return NextResponse.json({
      employees,
      dateRange: { from: mStartStr, to: mEndStr },
      settings,
      leaveTypes,
      attendanceCount: attendance?.length ?? 0,
      attendanceDates: (attendance ?? []).map(r => ({
        user: employees.find(e => e.id === r.user_id)?.full_name,
        date: r.date,
        hasCheckIn: !!r.check_in,
        company_id: r.company_id,
      })),
      leavesCount: leaves?.length ?? 0,
      leaves: (leaves ?? []).map(l => ({
        user: employees.find(e => e.id === l.user_id)?.full_name,
        type: l.type,
        start_date: l.start_date,
        end_date: l.end_date,
        status: l.status,
        company_id: l.company_id,
        reason: l.reason,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
