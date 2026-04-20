import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/upload-apk
 * Body: FormData with fields:
 *   - file: the APK binary
 *   - type: "kiosk" | "employee"
 *   - version: string (e.g. "1.2.0")
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file    = form.get('file') as File | null;
    const type    = form.get('type') as string;    // "kiosk" | "employee"
    const version = (form.get('version') as string) || '1.0.0';

    if (!file || !type) {
      return NextResponse.json({ error: 'Missing file or type' }, { status: 400 });
    }

    const fileName = `${type}_app_v${version.replace(/\./g, '-')}_${Date.now()}.apk`;
    const buffer   = Buffer.from(await file.arrayBuffer());

    // Upload to Supabase Storage
    const { error: uploadErr } = await admin.storage
      .from('platform-apks')
      .upload(fileName, buffer, {
        contentType: 'application/vnd.android.package-archive',
        upsert: true,
      });

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = admin.storage.from('platform-apks').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    // Save to platform_config
    const urlKey     = type === 'kiosk' ? 'kiosk_apk_url'     : 'employee_apk_url';
    const versionKey = type === 'kiosk' ? 'kiosk_apk_version' : 'employee_apk_version';

    await admin.from('platform_config').upsert([
      { key: urlKey,     value: publicUrl, updated_at: new Date().toISOString() },
      { key: versionKey, value: version,   updated_at: new Date().toISOString() },
    ], { onConflict: 'key' });

    return NextResponse.json({ ok: true, url: publicUrl, version });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
