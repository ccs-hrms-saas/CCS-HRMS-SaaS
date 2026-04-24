import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Same PIN generation logic as the employee PWA
function generatePIN(secret: string): string {
  const now = Math.floor(Date.now() / 1000)
  const counter = Math.floor(now / 60)
  let hash = 0
  const str = secret + counter.toString()
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
  }
  return String(Math.abs(hash) % 10000).padStart(4, '0')
}

async function uploadPhotoServerSide(
  user_id: string,
  base64: string,
  suffix: string
): Promise<string | null> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const fileName = `${user_id}/${today}_${suffix}_${Date.now()}.jpg`

    // Strip data URI prefix if present (e.g. "data:image/jpeg;base64,")
    const clean = base64.includes(',') ? base64.split(',')[1] : base64

    // Decode base64 → Uint8Array → Blob
    // Supabase Storage JS v2 requires a Blob/File for correct binary uploads.
    // Using Buffer directly can cause the client to serialise metadata bytes
    // instead of raw image data, producing a corrupt file.
    const bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0))
    const blob  = new Blob([bytes], { type: 'image/jpeg' })

    const { data, error } = await supabaseAdmin.storage
      .from('attendance-photos')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true })

    if (error || !data) {
      console.error('[upload] storage error:', error)
      return null
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('attendance-photos')
      .getPublicUrl(fileName)

    return urlData.publicUrl ?? null
  } catch (e) {
    console.error('[upload] unexpected error:', e)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, pin, photo_base64 } = await req.json()

    if (!user_id || !pin) {
      return NextResponse.json({ error: 'Missing user_id or pin' }, { status: 400 })
    }

    // 1. Fetch TOTP secret for this employee
    const { data: totpData, error: totpError } = await supabaseAdmin
      .from('totp_secrets')
      .select('secret')
      .eq('user_id', user_id)
      .single()

    if (totpError || !totpData) {
      return NextResponse.json({ error: 'No PIN found for this employee. Ask them to open their Employee Portal first.' }, { status: 404 })
    }

    // 2. Verify PIN — also check previous minute to handle edge cases
    const now = Math.floor(Date.now() / 1000)
    const validPINs = [
      generatePIN(totpData.secret),
      // Also allow previous minute's PIN to avoid timing issues
      (() => {
        const counter = Math.floor((now - 60) / 60)
        let hash = 0
        const str = totpData.secret + counter.toString()
        for (let i = 0; i < str.length; i++) hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
        return String(Math.abs(hash) % 10000).padStart(4, '0')
      })()
    ]

    if (!validPINs.includes(pin)) {
      return NextResponse.json({ error: 'Incorrect PIN. Please check the Employee App and try again.' }, { status: 401 })
    }

    // 3. Fetch employee profile to get company_id
    // (service role bypasses RLS so auth.uid() is NULL — the auto-trigger can't fire)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('company_id')
      .eq('id', user_id)
      .single()

    const company_id = profile?.company_id ?? null

    // 4. Check if already checked in today
    const today = new Date().toISOString().split('T')[0]
    const { data: existingRecord } = await supabaseAdmin
      .from('attendance_records')
      .select('*')
      .eq('user_id', user_id)
      .eq('date', today)
      .single()

    // 5. Upload photo server-side using service role key (bypasses RLS)
    const photo_url: string | null = photo_base64
      ? await uploadPhotoServerSide(user_id, photo_base64, 'checkin')
      : null

    // 6. Check in or Check out — always include company_id explicitly
    if (!existingRecord || !existingRecord.check_in) {
      // First tap = Check In
      if (existingRecord) {
        await supabaseAdmin
          .from('attendance_records')
          .update({ check_in: new Date().toISOString(), photo_url, company_id })
          .eq('id', existingRecord.id)
      } else {
        await supabaseAdmin
          .from('attendance_records')
          .insert({ user_id, company_id, date: today, check_in: new Date().toISOString(), photo_url })
      }
      return NextResponse.json({ success: true, action: 'check_in', message: 'Checked In Successfully!' })
    } else if (!existingRecord.check_out) {
      // Second tap = Check Out — upload checkout photo server-side
      const checkout_photo_url: string | null = photo_base64
        ? await uploadPhotoServerSide(user_id, photo_base64, 'checkout')
        : null
      await supabaseAdmin
        .from('attendance_records')
        .update({ check_out: new Date().toISOString(), checkout_photo_url, company_id })
        .eq('id', existingRecord.id)
      return NextResponse.json({ success: true, action: 'check_out', message: 'Checked Out Successfully!' })
    } else {
      return NextResponse.json({ success: false, error: 'Attendance already completed for today.' }, { status: 409 })
    }

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
