// One-time script to create the first Super Admin user
// Run: cd web && SERVICE_ROLE_KEY=your_key node ../scripts/create-first-admin.mjs

import { createClient } from '@supabase/supabase-js'

// ─── FILL IN THESE DETAILS ───
const ADMIN_NAME     = "Super Admin"
const ADMIN_EMAIL    = "admin@ccs-hrms.com"
const ADMIN_PASSWORD = "Admin@1234"
// ─────────────────────────────

const SUPABASE_URL     = "https://mkaowowwignznfkxcpeu.supabase.co"
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error("❌ Missing SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  email_confirm: true,
})

if (authError) { console.error("❌ Auth error:", authError.message); process.exit(1) }

const userId = authData.user.id

const { error: profileError } = await supabase.from("profiles").upsert({
  id: userId,
  full_name: ADMIN_NAME,
  role: "superadmin",
  manager_id: null,
})

if (profileError) { console.error("❌ Profile error:", profileError.message); process.exit(1) }

console.log("\n✅ Super Admin created!\n")
console.log(`   📧 Email:    ${ADMIN_EMAIL}`)
console.log(`   🔑 Password: ${ADMIN_PASSWORD}`)
console.log("\n👉 Go to http://localhost:3001 and log in!\n")
