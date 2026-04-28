import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Uses the service_role key — ONLY available server-side, never exposed to browser
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { full_name, email, password, role, manager_id, phone_number, gender, designation, joining_date, remuneration, joining_letter_url, company_id, weekly_off_day, hours_per_day, shift_start_time, shift_end_time } = await req.json()

    if (!full_name || !email || !password || !role || !gender || !designation || !joining_date || !remuneration || !company_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Step 1: Create the auth user via admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm so they can log in immediately
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const userId = authData.user.id

    // Auto-compute hours_per_day from shift window if both times are provided
    const resolvedHours = (() => {
      if (shift_start_time && shift_end_time) {
        const [h1,m1] = shift_start_time.split(':').map(Number);
        const [h2,m2] = shift_end_time.split(':').map(Number);
        const diff = (h2*60+m2) - (h1*60+m1);
        if (diff > 0) return Math.round(diff/60*10)/10;
      }
      return hours_per_day !== null && hours_per_day !== undefined ? Number(hours_per_day) : null;
    })();

    // Step 2: Create their profile record
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        full_name,
        role,
        company_id,
        manager_id: manager_id || null,
        phone_number: phone_number || null,
        gender,
        designation,
        joining_date,
        remuneration: Number(remuneration),
        joining_letter_url: joining_letter_url || null,
        weekly_off_day: weekly_off_day !== null && weekly_off_day !== undefined ? Number(weekly_off_day) : null,
        hours_per_day: resolvedHours,
        shift_start_time: shift_start_time || null,
        shift_end_time:   shift_end_time   || null,
      })

    if (profileError) {
      // Rollback: delete the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    // Step 2.5: Seed default leave balances for current financial year
    const fy = new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear()
    const { data: types } = await supabaseAdmin.from('leave_types').select('*').eq('is_paid', true).eq('company_id', company_id)
    
    if (types && types.length > 0) {
      const balancesToInsert = types
        .filter((t: any) => !(t.is_ml_type && gender !== 'Female'))
        .map((t: any) => ({
          user_id: userId,
          leave_type_id: t.id,
          company_id,
          financial_year: fy,
          // If leave type has accrual_rate set, start with 0 (earned over time)
          // Otherwise grant the full max_days_per_year upfront
          accrued: t.accrual_rate ? 0 : (t.max_days_per_year || 0),
          used: 0
        }))
      await supabaseAdmin.from('leave_balances').insert(balancesToInsert)
    }

    // Step 3: Send welcome email (fire-and-forget — don't fail if email fails)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ccs-hrms.vercel.app'
    fetch(`${appUrl}/api/send-welcome-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_email: email, to_name: full_name, temp_password: password, designation }),
    }).catch(() => {}) // Silent fail — don't block user creation

    // Step 4: Create a welcome notification for the new employee
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      company_id,
      title: '👋 Welcome to CCS-HRMS!',
      message: `Hi ${full_name.split(' ')[0]}, your account is set up. Complete your profile to get started.`,
      link: '/dashboard/employee/profile',
    })

    return NextResponse.json({ success: true, user_id: userId })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
