import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/admin/attendance-data?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns attendance records + approved/pending leave requests for all
 * employees in the caller's company for the given date range.
 * Uses the service role key to bypass RLS — caller must be admin/superadmin.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    // 2. Verify admin role + get company_id
    const { data: caller } = await admin.from('profiles')
      .select('role, company_id, system_role')
      .eq('id', user.id)
      .single()

    const isDev   = caller?.system_role === 'developer'
    const isAdmin = caller?.role === 'admin' || caller?.role === 'superadmin'
    if (!isAdmin && !isDev) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const companyId = caller?.company_id
    if (!companyId && !isDev) return NextResponse.json({ error: 'No company' }, { status: 403 })

    // 3. Parse query params
    const { searchParams } = new URL(req.url)
    const fromDate = searchParams.get('from')
    const toDate   = searchParams.get('to')
    const dateOnly = searchParams.get('date') // single date mode for attendance page

    if (!fromDate && !dateOnly) return NextResponse.json({ error: 'Missing from/date param' }, { status: 400 })

    const from = dateOnly ?? fromDate!
    const to   = dateOnly ?? toDate ?? fromDate!

    // 4. Fetch all employees for this company
    const { data: employees } = await admin.from('profiles')
      .select('id, full_name, shift_start_time, shift_end_time, hours_per_day, weekly_off_day')
      .eq('company_id', companyId!)
      .is('system_role', null)
      .eq('is_active', true)
      .order('full_name')

    const empIds = (employees ?? []).map(e => e.id)
    if (empIds.length === 0) return NextResponse.json({ attendance: [], leaveApproved: [], leavePending: [], employees: [] })

    // 5. Fetch attendance records
    const { data: attendance } = await admin.from('attendance_records')
      .select('id, user_id, date, check_in, check_out, photo_url, checkout_photo_url')
      .in('user_id', empIds)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })

    // 6. Fetch approved + pending leaves
    const [{ data: leaveApproved }, { data: leavePending }] = await Promise.all([
      admin.from('leave_requests')
        .select('id, user_id, type, status, start_date, end_date, reason, created_at')
        .in('user_id', empIds)
        .eq('status', 'approved')
        .lte('start_date', to)
        .gte('end_date', from),
      admin.from('leave_requests')
        .select('id, user_id, type, status, start_date, end_date')
        .in('user_id', empIds)
        .eq('status', 'pending')
        .lte('start_date', to)
        .gte('end_date', from),
    ])

    return NextResponse.json({
      employees:     employees ?? [],
      attendance:    attendance ?? [],
      leaveApproved: leaveApproved ?? [],
      leavePending:  leavePending ?? [],
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
