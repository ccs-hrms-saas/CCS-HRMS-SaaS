import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { user_id, column, value } = await req.json()

    if (!user_id || !column || !value) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Only allow safe document URL columns — prevent injection
    const ALLOWED_COLUMNS = ['aadhar_front_url', 'aadhar_back_url', 'pan_url', 'avatar_url', 'joining_letter_url']
    if (!ALLOWED_COLUMNS.includes(column)) {
      return NextResponse.json({ error: 'Column not allowed' }, { status: 403 })
    }

    const { error } = await admin
      .from('profiles')
      .update({ [column]: value })
      .eq('id', user_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
