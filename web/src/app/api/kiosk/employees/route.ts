import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/kiosk/employees
 *
 * Returns the employee list for the kiosk display screen.
 * Called by the Kiosk APK to populate the "who is punching in?" selection.
 * Header: x-device-token
 */
export async function GET(req: Request) {
  try {
    const device_token = req.headers.get('x-device-token');

    if (!device_token) {
      return NextResponse.json({ error: 'x-device-token header is required' }, { status: 401 });
    }

    // 1. Validate device
    const { data: device } = await admin
      .from('kiosk_devices')
      .select('id, company_id, is_active')
      .eq('device_token', device_token)
      .single();

    if (!device || !device.is_active) {
      return NextResponse.json({ error: 'Invalid or revoked device' }, { status: 401 });
    }

    // Update last_ping
    await admin
      .from('kiosk_devices')
      .update({ last_ping: new Date().toISOString() })
      .eq('id', device.id);

    // 2. Fetch active employees for this company
    const { data: employees, error } = await admin
      .from('profiles')
      .select('id, full_name, designation, avatar_url')
      .eq('company_id', device.company_id)
      .eq('status', 'active')
      .in('role', ['employee', 'admin', 'superadmin'])
      .order('full_name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ employees: employees ?? [] });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
