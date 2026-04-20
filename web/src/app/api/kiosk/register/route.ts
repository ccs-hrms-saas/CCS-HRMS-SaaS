import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/kiosk/register
 *
 * Called once from the Kiosk APK during first-time setup.
 * Body: { company_code: string, device_name: string, setup_pin: string }
 *
 * The setup_pin must match the PIN stored in the company's kiosk_attendance
 * module properties. This prevents unauthorised devices from pairing.
 *
 * Returns: { device_token: string, company_id: string, company_name: string }
 */
export async function POST(req: Request) {
  try {
    const { company_code, device_name, setup_pin } = await req.json();

    if (!company_code || !setup_pin) {
      return NextResponse.json({ error: 'company_code and setup_pin are required' }, { status: 400 });
    }

    // 1. Resolve company from subdomain code
    const { data: company, error: companyErr } = await admin
      .from('companies')
      .select('id, name, is_active')
      .eq('subdomain', company_code)
      .single();

    if (companyErr || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if (!company.is_active) {
      return NextResponse.json({ error: 'This tenant is currently suspended' }, { status: 403 });
    }

    // 2. Fetch kiosk module config and validate setup_pin
    const { data: moduleRow } = await admin
      .from('company_modules')
      .select('properties, is_enabled')
      .eq('company_id', company.id)
      .eq('module_key', 'kiosk_attendance')
      .single();

    if (!moduleRow || !moduleRow.is_enabled) {
      return NextResponse.json({ error: 'Kiosk module is not enabled for this company' }, { status: 403 });
    }

    const kioskProps = moduleRow.properties as Record<string, any>;

    if (!kioskProps.setup_pin || kioskProps.setup_pin !== setup_pin) {
      return NextResponse.json({ error: 'Invalid setup PIN' }, { status: 401 });
    }

    // 3. Check device limit
    const { count } = await admin
      .from('kiosk_devices')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('is_active', true);

    const maxDevices = kioskProps.max_devices ?? 5;
    if ((count ?? 0) >= maxDevices) {
      return NextResponse.json({
        error: `Device limit reached (${maxDevices}). Revoke an existing device from the admin panel first.`
      }, { status: 403 });
    }

    // 4. Generate a secure device token
    const device_token = crypto.randomBytes(32).toString('hex');

    const { data: device, error: deviceErr } = await admin
      .from('kiosk_devices')
      .insert({
        company_id:   company.id,
        device_name:  device_name ?? 'Kiosk Device',
        device_token,
        last_ping:    new Date().toISOString(),
      })
      .select('id')
      .single();

    if (deviceErr) {
      return NextResponse.json({ error: deviceErr.message }, { status: 500 });
    }

    return NextResponse.json({
      device_token,
      device_id:    device.id,
      company_id:   company.id,
      company_name: company.name,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
