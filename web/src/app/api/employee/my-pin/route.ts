import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Same TOTP logic as /api/mark-attendance */
function generatePIN(secret: string): string {
  const now     = Math.floor(Date.now() / 1000)
  const counter = Math.floor(now / 60)
  let hash = 0
  const str = secret + counter.toString()
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
  }
  return String(Math.abs(hash) % 10000).padStart(4, '0')
}

function makeSecret(): string {
  // 32-char random hex secret
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * GET /api/employee/my-pin
 * Returns the employee's current 4-digit kiosk attendance PIN.
 * Auto-creates a TOTP secret if none exists.
 * Auth: Bearer JWT (employee session).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(auth.slice(7))
    if (authErr || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    // Fetch or create TOTP secret
    let { data: totpRow } = await supabaseAdmin
      .from('totp_secrets')
      .select('secret')
      .eq('user_id', user.id)
      .single()

    if (!totpRow) {
      const secret = makeSecret()
      const { data: inserted } = await supabaseAdmin
        .from('totp_secrets')
        .insert({ user_id: user.id, secret })
        .select('secret')
        .single()
      totpRow = inserted
    }

    if (!totpRow) return NextResponse.json({ error: 'Could not create PIN' }, { status: 500 })

    const pin            = generatePIN(totpRow.secret)
    const secondsLeft    = 60 - (Math.floor(Date.now() / 1000) % 60)

    return NextResponse.json({ pin, secondsLeft })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
