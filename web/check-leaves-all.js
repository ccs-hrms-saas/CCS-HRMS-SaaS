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
  const { data: reqs } = await supabase.from('leave_requests').select('*, profiles!inner(full_name)');
  const { data: bals } = await supabase.from('leave_balances').select('*, profiles!inner(full_name), leave_types!inner(name)');
  
  for(let p of ['Divyant', 'Anjlika', 'Ragini', 'Abhinav']) {
    console.log('--- ' + p + ' ---');
    console.log('REQS:');
    (reqs || []).filter(r => r.profiles.full_name.includes(p)).forEach(r => {
      console.log(`  ${r.type} | ${r.start_date} to ${r.end_date} | ${r.status}`);
    });
    console.log('BALS:');
    (bals || []).filter(b => b.profiles.full_name.includes(p)).forEach(b => {
      console.log(`  ${b.leave_types.name} | Accrued: ${b.accrued} | Used: ${b.used}`);
    });
  }
}
run();
