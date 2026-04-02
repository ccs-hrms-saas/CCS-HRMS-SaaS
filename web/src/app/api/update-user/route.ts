import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { user_id, full_name, email } = await req.json()

    if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

    // Update name in profiles table
    if (full_name) {
      const { error: profileErr } = await supabaseAdmin
        .from('profiles')
        .update({ full_name })
        .eq('id', user_id)
      if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    // Update email in auth if provided
    if (email) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, { email })
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
