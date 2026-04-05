import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const holidays = [
    { date: '2026-08-15', name: 'Independence Day' },
    { date: '2026-08-28', name: 'Raksha Bandhan' },
    { date: '2026-10-21', name: 'Vijay Dashami' },
    { date: '2026-11-09', name: 'Diwali' },
    { date: '2026-11-10', name: 'Diwali' },
    { date: '2026-11-11', name: 'Diwali' },
    { date: '2027-01-26', name: 'Republic Day' },
    { date: '2027-03-22', name: 'Holi' },
  ]

  const { data, error } = await admin
    .from('company_holidays')
    .upsert(holidays, { onConflict: 'date' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, inserted: data?.length ?? 0, holidays: data })
}
