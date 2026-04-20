import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** GET /api/platform-config — returns all config as a key→value map */
export async function GET() {
  const { data, error } = await admin.from('platform_config').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const config: Record<string, string> = {};
  (data ?? []).forEach((r: any) => { config[r.key] = r.value; });
  return NextResponse.json(config);
}

/** POST /api/platform-config — upserts one or more config values
 *  Body: { key: string; value: string }[]  OR  { key: string; value: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows: { key: string; value: string }[] = Array.isArray(body) ? body : [body];

    for (const { key, value } of rows) {
      await admin
        .from('platform_config')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
