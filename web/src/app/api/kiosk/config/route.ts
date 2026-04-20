import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/kiosk/config
 *
 * Called by the Kiosk APK on startup (after pairing) to check its own status
 * and retrieve company branding/config.
 * Header: x-device-token
 *
 * Returns:
 * {
 *   company_name: string
 *   company_logo: string | null
 *   show_employee_photo: boolean
 *   is_active: boolean       ← false = device has been revoked
 *   company_active: boolean  ← false = company has been suspended
 * }
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

    if (!device) {
      return NextResponse.json({ error: 'Device not found. Please re-pair the device.' }, { status: 404 });
    }

    if (!device.is_active) {
      return NextResponse.json({
        is_active:      false,
        company_active: false,
        message:        'This device has been revoked by the administrator. Please contact your HR admin.',
      }, { status: 403 });
    }

    // Update last_ping
    await admin
      .from('kiosk_devices')
      .update({ last_ping: new Date().toISOString() })
      .eq('id', device.id);

    // 2. Fetch company info + kiosk module config
    const [{ data: company }, { data: kioskMod }] = await Promise.all([
      admin.from('companies').select('name, is_active, branding').eq('id', device.company_id).single(),
      admin.from('company_modules')
        .select('properties, is_enabled')
        .eq('company_id', device.company_id)
        .eq('module_key', 'kiosk_attendance')
        .single(),
    ]);

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if (!company.is_active) {
      return NextResponse.json({
        is_active:      true,
        company_active: false,
        message:        'This workspace has been suspended. Attendance cannot be recorded.',
      }, { status: 403 });
    }

    if (!kioskMod?.is_enabled) {
      return NextResponse.json({
        is_active:      true,
        company_active: true,
        module_enabled: false,
        message:        'Kiosk module is currently disabled for this company.',
      }, { status: 403 });
    }

    const props = kioskMod.properties as Record<string, any>;
    const branding = company.branding as Record<string, any> ?? {};

    return NextResponse.json({
      is_active:           true,
      company_active:      true,
      module_enabled:      true,
      company_name:        company.name,
      company_logo:        branding.logo_url ?? null,
      show_employee_photo: props.show_employee_photo ?? true,
      require_device_pin:  props.require_device_pin ?? true,
      pin_rotation_days:   props.pin_rotation_days ?? 30,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
