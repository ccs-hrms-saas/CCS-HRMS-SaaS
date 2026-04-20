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
  const fy = new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  
  const { data: users } = await supabase.from('profiles').select('id, full_name, role').eq('is_active', true);
  const { data: bals } = await supabase.from('leave_balances').select('user_id').eq('financial_year', fy);
  const balUserIds = new Set(bals.map(b => b.user_id));
  
  const { data: types } = await supabase.from('leave_types').select('*').eq('is_paid', true);
  
  const toInsert = [];
  
  users.forEach(u => {
    if(!balUserIds.has(u.id) && u.role !== 'superadmin') {
      console.log('Inserting missing balances for:', u.full_name);
      types.forEach(t => {
        toInsert.push({
          user_id: u.id,
          leave_type_id: t.id,
          financial_year: fy,
          accrued: t.name === 'Earned Leave (EL)' ? 0 : (t.max_days_per_year || 0),
          used: 0
        });
      });
    }
  });
  
  if(toInsert.length > 0) {
    await supabase.from('leave_balances').insert(toInsert);
    console.log(`Inserted ${toInsert.length} balances.`);
  } else {
    console.log('No missing balances found for active employees.');
  }
}
run();
