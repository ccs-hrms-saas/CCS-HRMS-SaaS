import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: mlType } = await supabase.from('leave_types').select('id, count_holidays').eq('name', 'Menstruation Leave').single();
  if(!mlType) return console.log("NO ML TYPE");

  const { data: hRes } = await supabase.from("company_holidays").select("date");
  const hols = new Set((hRes || []).map(h => h.date));

  const { data: leaves } = await supabase.from('leave_requests')
    .select('*')
    .eq('type', 'Menstruation Leave')
    .eq('status', 'approved');
  
  if(!leaves || leaves.length === 0) return console.log("NO ML TAKEN OR FOUND");

  const fy = 2026; 

  const map = {};
  leaves.forEach(l => {
     let count = 0;
     let cur = new Date(l.start_date);
     const end = new Date(l.end_date);
     while(cur <= end) {
       let dow = cur.getDay();
       let dts = cur.toISOString().split('T')[0];
       let isWkOff = false;
       if (dow === 0) isWkOff = true;
       if (dow === 6) {
         let wk = Math.ceil(cur.getDate() / 7);
         if(wk === 1 || wk === 3) isWkOff = true;
       }
       if (mlType.count_holidays || (!isWkOff && !hols.has(dts))) count++;
       cur.setDate(cur.getDate() + 1);
     }
     
     if(!map[l.user_id]) map[l.user_id] = 0;
     map[l.user_id] += count;
  });

  console.log("Calculated usages:", map);

  for(const uid of Object.keys(map)) {
    const used = map[uid];
    const { data: bal } = await supabase.from('leave_balances')
       .select('id, used').eq('user_id', uid).eq('leave_type_id', mlType.id).eq('financial_year', fy).single();
    if(bal) {
       console.log(`Updating user ${uid} ML balance: used = ${used}`);
       await supabase.from('leave_balances').update({ used: used }).eq('id', bal.id);
    }
  }

  console.log("DONE RECONCILIATION");
}

main().catch(console.error);
