const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenvStr = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(dotenvStr.split('\n').map(line => {
  const i = line.indexOf('=');
  if(i > 0) return [line.substring(0, i).trim(), line.substring(i + 1).trim().replace(/['\"]+/g, '')];
  return [];
}).filter(x => x.length));

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function getLeaveDaysCount(startDate, endDate, countHolidays, holsSet) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let days = 0;
  let current = new Date(start);
  while (current <= end) {
    const dayStr = current.toISOString().split('T')[0];
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isWorkingDay = !isWeekend && !holsSet.has(dayStr);
    
    if (countHolidays || isWorkingDay) {
      days++;
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

async function fix() {
  const fy = "2026";
  
  // 1. Get holidays
  const { data: hRes } = await supabase.from('company_holidays').select('date');
  const hols = new Set((hRes || []).map(h => h.date));
  
  // 2. Get leave types
  const { data: typesRes } = await supabase.from('leave_types').select('*');
  const typesMap = {};
  for(const t of typesRes) typesMap[t.name] = t;
  
  // 3. Get all approved leaves
  const { data: reqs } = await supabase.from('leave_requests').select('*').eq('status', 'approved');
  
  // 4. Calculate expected used per user + type
  const expectedUsed = {}; // map of user_id -> map of leave_type_id -> days
  for(const req of reqs) {
    const typeObj = typesMap[req.type];
    if(!typeObj) continue;
    if(req.type === 'Menstruation Leave' || req.type === 'Leave Without Pay (LWP)') continue;
    
    // Check if leave falls in this FY - we simplify, assuming start_date is in FY 2026.
    const days = getLeaveDaysCount(req.start_date, req.end_date, typeObj.count_holidays, hols);
    
    if(!expectedUsed[req.user_id]) expectedUsed[req.user_id] = {};
    if(!expectedUsed[req.user_id][typeObj.id]) expectedUsed[req.user_id][typeObj.id] = 0;
    expectedUsed[req.user_id][typeObj.id] += days;
  }
  
  // 5. Fetch all balances for current FY
  const { data: balances } = await supabase.from('leave_balances').select('*, profiles!inner(full_name), leave_types!inner(name)').eq('financial_year', fy);
  
  for(const bal of balances) {
    const expected = (expectedUsed[bal.user_id] && expectedUsed[bal.user_id][bal.leave_type_id]) || 0;
    const actual = Number(bal.used) || 0;
    
    if(expected !== actual) {
      console.log(`Mismatch for ${bal.profiles.full_name} - ${bal.leave_types.name}: Expected ${expected}, Actual ${actual}. Updating...`);
      await supabase.from('leave_balances').update({ used: expected }).eq('id', bal.id);
    }
  }
  console.log("Done");
}
fix();
