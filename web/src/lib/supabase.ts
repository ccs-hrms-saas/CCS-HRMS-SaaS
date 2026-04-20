import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type UserRole = 'superadmin' | 'admin' | 'employee'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  manager_id: string | null
  created_at: string
  avatar_url: string | null
  designation: string | null
  phone_number: string | null
  company_id: string | null
  system_role: string | null
  department: string | null
}
