import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Admin client — bypasses RLS. Only for server-side operations.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/admin/manual-override
 *
 * Allows admins and superadmins to force-log attendance or inject leave
 * for any employee in their own company.
 *
 * Security model:
 *  1. Caller must be authenticated (valid JWT from Authorization header)
 *  2. Caller must have role 'admin' or 'superadmin'
 *  3. Target employee (user_id) must belong to the SAME company as the caller
 *  4. All writes use the service role key but are double-checked at the app layer
 *
 * Body (mode: "present"):
 *   { mode, user_id, date, check_in, check_out }
 *
 * Body (mode: "leave"):
 *   { mode, user_id, date, leave_type }
 */
export async function POST(req: NextRequest) {
  try {
    // ── 1. Authenticate the caller from the Authorization header ──────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized — no token.' }, { status: 401 })
    }
    const jwt = authHeader.slice(7)

    // Verify the JWT and get the caller's user record
    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
    if (authErr || !caller) {
      return NextResponse.json({ error: 'Unauthorized — invalid session.' }, { status: 401 })
    }

    // ── 2. Fetch caller's profile to check role and company ───────────────
    const { data: callerProfile, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id, role, company_id, system_role')
      .eq('id', caller.id)
      .single()

    if (profErr || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found.' }, { status: 403 })
    }

    // Developer system_role can operate across companies (platform-level)
    const isDeveloper = callerProfile.system_role === 'developer'
    const isAdmin = callerProfile.role === 'admin' || callerProfile.role === 'superadmin'

    if (!isAdmin && !isDeveloper) {
      return NextResponse.json({ error: 'Forbidden — admin or superadmin role required.' }, { status: 403 })
    }

    // ── 3. Parse and validate request body ───────────────────────────────
    const { mode, user_id, date, check_in, check_out, leave_type } = await req.json()

    if (!mode || !user_id || !date) {
      return NextResponse.json({ error: 'Missing required fields: mode, user_id, date.' }, { status: 400 })
    }
    if (mode !== 'present' && mode !== 'leave') {
      return NextResponse.json({ error: 'mode must be "present" or "leave".' }, { status: 400 })
    }
    if (mode === 'present' && !check_in) {
      return NextResponse.json({ error: 'check_in is required for mode "present".' }, { status: 400 })
    }
    if (mode === 'leave' && !leave_type) {
      return NextResponse.json({ error: 'leave_type is required for mode "leave".' }, { status: 400 })
    }

    // ── 4. Verify the target employee belongs to the caller's company ─────
    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from('profiles')
      .select('id, company_id, full_name')
      .eq('id', user_id)
      .single()

    if (targetErr || !targetProfile) {
      return NextResponse.json({ error: 'Target employee not found.' }, { status: 404 })
    }

    // Cross-company check — developers are exempt
    if (!isDeveloper && targetProfile.company_id !== callerProfile.company_id) {
      return NextResponse.json({ error: 'Forbidden — employee belongs to a different company.' }, { status: 403 })
    }

    // ── 5A. Mode: Present ─────────────────────────────────────────────────
    if (mode === 'present') {
      // IMPORTANT: Admin enters times in IST. Append +05:30 so JS correctly
      // converts to UTC before storing. Without this, "10:35" is treated as
      // UTC and stored as 10:35Z, which displays as 16:05 IST — wrong.
      const inISO = new Date(`${date}T${check_in}:00+05:30`).toISOString()
      const outISO = check_out ? new Date(`${date}T${check_out}:00+05:30`).toISOString() : null

      // Validate times make sense
      if (outISO && new Date(outISO) <= new Date(inISO)) {
        return NextResponse.json({ error: 'Check-out time must be after check-in time.' }, { status: 400 })
      }

      // ── Override cleanup: remove any leave_request for this date ────────
      // Admin is explicitly saying "this person was present", so any
      // conflicting leave record must be removed.
      await supabaseAdmin
        .from('leave_requests')
        .delete()
        .eq('user_id', user_id)
        .lte('start_date', date)
        .gte('end_date', date)

      // Upsert: update if record exists for this employee+date, else insert
      // NOTE: Do NOT filter by company_id — older records may have NULL company_id
      // from before the tenant isolation fix. We match by user_id + date only.
      const { data: existing } = await supabaseAdmin
        .from('attendance_records')
        .select('id')
        .eq('user_id', user_id)
        .eq('date', date)
        .maybeSingle()

      if (existing) {
        const { error } = await supabaseAdmin
          .from('attendance_records')
          .update({
            check_in:   inISO,
            check_out:  outISO,
            company_id: targetProfile.company_id,
            photo_url:  `manual_override_by_${callerProfile.id}`,
          })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabaseAdmin
          .from('attendance_records')
          .insert({
            user_id,
            company_id: targetProfile.company_id,
            date,
            check_in:   inISO,
            check_out:  outISO,
            photo_url:  `manual_override_by_${callerProfile.id}`,
          })
        if (error) throw error
      }

      return NextResponse.json({
        success: true,
        message: `✅ Attendance overridden for ${targetProfile.full_name} on ${date}.`,
      })
    }

    // ── 5B. Mode: Leave ───────────────────────────────────────────────────
    if (mode === 'leave') {
      // Check for duplicate leave on the same date
      const { data: dupLeave } = await supabaseAdmin
        .from('leave_requests')
        .select('id')
        .eq('user_id', user_id)
        .lte('start_date', date)
        .gte('end_date', date)
        .maybeSingle()

      if (dupLeave) {
        return NextResponse.json({ error: 'A leave record already exists for this employee on this date.' }, { status: 409 })
      }

      // ── Override cleanup: remove any attendance_record for this date ────
      // Admin is explicitly saying "this person was on leave", so any
      // conflicting punch/attendance record must be removed.
      await supabaseAdmin
        .from('attendance_records')
        .delete()
        .eq('user_id', user_id)
        .eq('date', date)

      const { error: lvErr } = await supabaseAdmin
        .from('leave_requests')
        .insert({
          user_id,
          company_id: targetProfile.company_id,
          type: leave_type,
          start_date: date,
          end_date: date,
          reason: `Admin Manual Override by ${callerProfile.id}`,
          status: 'approved',
        })
      if (lvErr) throw lvErr

      // ── Auto-create leave type if it doesn't exist yet ────────────────
      // When an admin/superadmin uses a leave type name via override that
      // doesn't exist in the leave_types table, create it automatically
      // as a no-ledger, paid, informal leave. This ensures:
      // 1. The leave type appears in Leave Settings immediately
      // 2. Employees can opt for it in future applications
      // 3. The Override dropdown shows it next time
      const { data: existingType } = await supabaseAdmin
        .from('leave_types')
        .select('id')
        .eq('name', leave_type)
        .eq('company_id', targetProfile.company_id)
        .maybeSingle()

      if (!existingType) {
        await supabaseAdmin
          .from('leave_types')
          .insert({
            company_id: targetProfile.company_id,
            name: leave_type,
            frequency: 'yearly',
            max_days_per_year: 12,
            is_paid: true,
            deduction_hours: 0,
            count_holidays: false,
            allow_carry_forward: false,
            carry_forward_percent: 0,
            max_carry_forward: 0,
            no_ledger: true,
            half_day_allowed: false,
            short_leave_allowed: false,
          })
      }

      // Deduct from leave balance if it's a paid non-LWP leave
      if (leave_type !== 'Leave Without Pay (LWP)') {
        const { data: typeRes } = await supabaseAdmin
          .from('leave_types')
          .select('id, count_holidays, deduction_hours')
          .eq('name', leave_type)
          .eq('company_id', targetProfile.company_id)
          .single()

        if (typeRes) {
          const fy = new Date().getMonth() < 3
            ? new Date().getFullYear() - 1
            : new Date().getFullYear()

          const { data: bal } = await supabaseAdmin
            .from('leave_balances')
            .select('id, used')
            .eq('user_id', user_id)
            .eq('leave_type_id', typeRes.id)
            .eq('financial_year', fy)
            .single()

          if (bal) {
            await supabaseAdmin
              .from('leave_balances')
              .update({ used: Number(bal.used) + 1 })
              .eq('id', bal.id)
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `✅ Leave (${leave_type}) injected for ${targetProfile.full_name} on ${date}.`,
      })
    }

  } catch (err: any) {
    console.error('[manual-override]', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error.' }, { status: 500 })
  }
}
