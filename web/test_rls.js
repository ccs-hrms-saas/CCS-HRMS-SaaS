const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key) acc[key] = val.join('=');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: "admin@ccs-hrms.com",
    password: "password123"
  });

  if (authError) {
    console.error("Auth error:", authError);
    return;
  }

  const { data, error } = await supabase.from('profiles').select('*').eq('id', authData.user.id);
  console.log("Profiles read result:", data);
  if (error) console.error(error);
}
test();
