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
  
  const { data: users } = await supabase.from('profiles').select('id, full_name, role, gender').eq('is_active', true);
  const { data: bals } = await supabase.from('leave_balances').select('*, leave_types(name)').eq('financial_year', fy);
  const { data: types } = await supabase.from('leave_types').select('*').eq('is_paid', true);
  
  // Group balances by user and type
  // map(user_id => Set(leave_type_id))
  const userBals = {};
  bals.forEach(b => {
    if(!userBals[b.user_id]) userBals[b.user_id] = new Set();
    userBals[b.user_id].add(b.leave_type_id);
  });
  
  const toInsert = [];
  
  users.forEach(u => {
    if(u.role === 'superadmin') return;
    
    types.forEach(t => {
      // Logic for specific leave types
      if (t.name === 'Menstruation Leave' && u.gender !== 'Female') {
        return; // Skip males/other
      }
      
      const hasBalance = userBals[u.id] && userBals[u.id].has(t.id);
      
      if (!hasBalance) {
        console.log(`Inserting missing ${t.name} for ${u.full_name}`);
        toInsert.push({
          user_id: u.id,
          leave_type_id: t.id,
          financial_year: fy,
          accrued: t.name === 'Earned Leave (EL)' ? 0 : (t.max_days_per_year || 0),
          used: 0
        });
      }
    });
  });
  
  if(toInsert.length > 0) {
    await supabase.from('leave_balances').insert(toInsert);
    console.log(`Inserted ${toInsert.length} missing balances across all users.`);
  } else {
    console.log('All users are fully synced.');
  }
}
run();
