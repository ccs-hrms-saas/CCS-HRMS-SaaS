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
  const { data: users } = await supabase.from('profiles').select('id, full_name').ilike('full_name', '%Abhinav%');
  if(!users || users.length === 0) return console.log('No Abhinav found');
  
  const empId = users[0].id;
  const { data: reqs } = await supabase.from('leave_requests').select('*').eq('user_id', empId);
  console.log('Leaves for Abhinav:', reqs);
  
  const { data: bals } = await supabase.from('leave_balances').select('*, leave_types(name)').eq('user_id', empId);
  console.log('Balances for Abhinav:', bals);
}
run();
