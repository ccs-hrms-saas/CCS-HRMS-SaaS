import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { user_ids, title, message, link } = await req.json()

    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

    let targets: string[] = []

    if (user_ids === 'all_employees') {
      const { data } = await admin.from('profiles').select('id').eq('is_active', true).in('role', ['employee'])
      targets = (data ?? []).map((p: any) => p.id)
    } else if (user_ids === 'all_admins') {
      const { data } = await admin.from('profiles').select('id').eq('is_active', true).in('role', ['admin', 'superadmin'])
      targets = (data ?? []).map((p: any) => p.id)
    } else if (user_ids === 'all_staff') {
      const { data } = await admin.from('profiles').select('id').eq('is_active', true)
      targets = (data ?? []).map((p: any) => p.id)
    } else if (Array.isArray(user_ids)) {
      targets = user_ids
    } else if (typeof user_ids === 'string') {
      targets = [user_ids]
    }

    if (targets.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    const rows = targets.map(uid => ({ user_id: uid, title, message: message || null, link: link || null }))
    const { error } = await admin.from('notifications').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, sent: rows.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
