const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenvStr = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(dotenvStr.split('\n').map(line => {
  const i = line.indexOf('=');
  if(i > 0) return [line.substring(0, i).trim(), line.substring(i + 1).trim().replace(/['\"]+/g, '')];
  return [];
}).filter(x => x.length));

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: users } = await supabase.from('profiles').select('id, full_name');
  const { data: bals } = await supabase.from('leave_balances').select('user_id');
  const balUserIds = new Set(bals.map(b => b.user_id));
  
  users.forEach(u => {
    if(!balUserIds.has(u.id)) {
      console.log('Missing balances for:', u.full_name);
    }
  });
}
run();
