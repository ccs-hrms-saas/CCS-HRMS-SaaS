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

    // 3. Check if already checked in today
    const today = new Date().toISOString().split('T')[0]
    const { data: existingRecord } = await supabaseAdmin
      .from('attendance_records')
      .select('*')
      .eq('user_id', user_id)
      .eq('date', today)
      .single()

    let photo_url: string | null = null

    // 4. Upload photo if provided
    if (photo_base64) {
      const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      const fileName = `${user_id}/${today}_${Date.now()}.jpg`
      const { data: uploadData } = await supabaseAdmin.storage
        .from('attendance-photos')
        .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true })
      if (uploadData) {
        const { data: urlData } = supabaseAdmin.storage.from('attendance-photos').getPublicUrl(fileName)
        photo_url = urlData.publicUrl
      }
    }

    // 5. Check in or Check out
    if (!existingRecord || !existingRecord.check_in) {
      // First tap = Check In
      if (existingRecord) {
        await supabaseAdmin
          .from('attendance_records')
          .update({ check_in: new Date().toISOString(), photo_url })
          .eq('id', existingRecord.id)
      } else {
        await supabaseAdmin
          .from('attendance_records')
          .insert({ user_id, date: today, check_in: new Date().toISOString(), photo_url })
      }
      return NextResponse.json({ success: true, action: 'check_in', message: 'Checked In Successfully!' })
    } else if (!existingRecord.check_out) {
      // Second tap = Check Out
      await supabaseAdmin
        .from('attendance_records')
        .update({ check_out: new Date().toISOString() })
        .eq('id', existingRecord.id)
      return NextResponse.json({ success: true, action: 'check_out', message: 'Checked Out Successfully!' })
    } else {
      return NextResponse.json({ success: false, error: 'Attendance already completed for today.' }, { status: 409 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
