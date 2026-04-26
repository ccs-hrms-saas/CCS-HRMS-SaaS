import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/kiosk/punch
 *
 * Called by the Kiosk APK when an employee clocks in or out.
 * Body: { device_token: string, employee_id: string, type: 'check_in' | 'check_out' }
 *
 * The device_token (from /api/kiosk/register) proves the device is authorised.
 * No user session is required — the kiosk acts as a trusted device.
 */
export async function POST(req: Request) {
  try {
    const { device_token, employee_id, type } = await req.json();

    if (!device_token || !employee_id || !type) {
      return NextResponse.json({ error: 'device_token, employee_id, and type are required' }, { status: 400 });
    }

    if (!['check_in', 'check_out'].includes(type)) {
      return NextResponse.json({ error: 'type must be check_in or check_out' }, { status: 400 });
    }

    // 1. Validate device token
    const { data: device } = await admin
      .from('kiosk_devices')
      .select('id, company_id, is_active')
      .eq('device_token', device_token)
      .single();

    if (!device || !device.is_active) {
      return NextResponse.json({ error: 'Invalid or revoked device' }, { status: 401 });
    }

    // 2. Update device last_ping
    await admin
      .from('kiosk_devices')
      .update({ last_ping: new Date().toISOString() })
      .eq('id', device.id);

    // 3. Validate employee belongs to the same company
    const { data: employee } = await admin
      .from('profiles')
      .select('id, full_name, company_id')
      .eq('id', employee_id)
      .eq('company_id', device.company_id)
      .single();

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found in this company' }, { status: 404 });
    }

    // 4. Record attendance punch
    const today = new Date().toISOString().split('T')[0];
    const now   = new Date().toISOString();

    if (type === 'check_in') {
      // Check if already checked in today (prevent duplicate check-in)
      const { data: existing } = await admin
        .from('attendance_records')
        .select('id, check_in')
        .eq('user_id', employee_id)
        .eq('company_id', device.company_id)
        .eq('date', today)
        .maybeSingle();

      if (existing?.check_in) {
        // Already checked in — treat as a no-op and return success
        return NextResponse.json({ ok: true, employee_name: employee.full_name, type: 'already_checked_in', timestamp: now });
      }

      if (existing) {
        // Row exists but no check_in yet — update it
        const { error } = await admin
          .from('attendance_records')
          .update({ check_in: now })
          .eq('id', existing.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        // Insert a new record for today — user_id is the correct column name
        const { error } = await admin.from('attendance_records').insert({
          user_id:    employee_id,      // ← MUST be user_id, NOT employee_id
          company_id: device.company_id,
          date:       today,
          check_in:   now,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

    } else {
      // Update existing record with check_out time — also uses user_id
      const { error } = await admin
        .from('attendance_records')
        .update({ check_out: now })
        .eq('user_id', employee_id)    // ← MUST be user_id, NOT employee_id
        .eq('company_id', device.company_id)
        .eq('date', today)
        .is('check_out', null);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok:           true,
      employee_name: employee.full_name,
      type,
      timestamp:    now,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
