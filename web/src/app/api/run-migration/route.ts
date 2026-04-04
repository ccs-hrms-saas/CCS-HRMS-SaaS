import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'public' } }
)

export async function GET() {
  const log: string[] = []

  try {
    // ── Step 1: Create the table via direct insert trick ──
    // We use raw fetch to Supabase's internal postgres endpoint
    const pgUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', 'https://') + '/rest/v1/'
    
    // Try creating table through a workaround — check if table already exists
    const { data: existing, error: checkErr } = await admin
      .from('employee_appraisals')
      .select('id')
      .limit(1)

    if (!checkErr) {
      log.push('✅ employee_appraisals table already exists, skipping create')
    } else if (checkErr.code === '42P01') {
      // Table doesn't exist — we need raw SQL, but exec_sql doesn't exist
      // Use the Supabase SQL endpoint directly
      log.push('❌ Table missing. Cannot create without exec_sql or direct DB access.')
      log.push('PLEASE RUN THIS IN SUPABASE SQL EDITOR:')
      log.push(`CREATE TABLE IF NOT EXISTS employee_appraisals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appraisal_date  DATE NOT NULL,
  letter_url      TEXT NOT NULL,
  notes           TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE employee_appraisals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view all appraisals" ON employee_appraisals FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
CREATE POLICY "Employee views own appraisals" ON employee_appraisals FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins manage appraisals" ON employee_appraisals FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-documents','employee-documents',true),('profile-pictures','profile-pictures',true),('medical-certificates','medical-certificates',true) ON CONFLICT (id) DO UPDATE SET public = true;`)
    } else {
      log.push('Check error: ' + checkErr.message)
    }

    // ── Step 2: Fix buckets via storage admin API ──
    for (const bucket of ['employee-documents', 'profile-pictures', 'medical-certificates']) {
      // Try to update bucket to public using storage admin
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/bucket/${bucket}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: bucket, name: bucket, public: true })
      })
      const j = await res.json()
      log.push(`Bucket ${bucket}: ${res.ok ? '✅ Set to public' : '❌ ' + JSON.stringify(j)}`)

      // Also try to create it in case it doesn't exist
      if (!res.ok) {
        const res2 = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/bucket`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ id: bucket, name: bucket, public: true })
        })
        const j2 = await res2.json()
        log.push(`  Create ${bucket}: ${res2.ok ? '✅ Created' : JSON.stringify(j2)}`)
      }
    }

  } catch (err: any) {
    log.push('Fatal: ' + err.message)
  }

  return NextResponse.json({ log })
}
