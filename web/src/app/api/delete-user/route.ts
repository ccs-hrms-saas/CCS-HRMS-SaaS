import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(req: NextRequest) {
  try {
    const { user_id, permanent } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

    if (permanent) {
      // Delete all related records first (FK constraints)
      await supabaseAdmin.from('attendance_records').delete().eq('user_id', user_id)
      await supabaseAdmin.from('leave_requests').delete().eq('user_id', user_id)
      await supabaseAdmin.from('totp_secrets').delete().eq('user_id', user_id)

      // Now delete the profile row
      const { error: profileErr } = await supabaseAdmin
        .from('profiles').delete().eq('id', user_id)
      if (profileErr) return NextResponse.json({ error: `Profile: ${profileErr.message}` }, { status: 500 })

      // Finally delete the auth user
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(user_id)
      if (authErr) return NextResponse.json({ error: `Auth: ${authErr.message}` }, { status: 500 })

      return NextResponse.json({ success: true, action: 'permanently_deleted' })
    }

    // SOFT DELETE — mark as inactive, preserve all records
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: false, left_on: today })
      .eq('id', user_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, action: 'deactivated' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
