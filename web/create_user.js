const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key) acc[key] = val.join('=');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function create() {
  // First, check if auth user already exists and get ID if it does.
  let userId;
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing.users.find(u => u.email === 'admin@ccs-hrms.com');
  
  if (found) {
    userId = found.id;
  } else {
    const { data: user, error: userError } = await supabase.auth.admin.createUser({
      email: "admin@ccs-hrms.com",
      password: "password123",
      email_confirm: true,
    });
    if (userError) {
      console.error(userError); return;
    }
    userId = user.user.id;
  }

  // Next.js platform owner profiles
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    full_name: "Platform Owner",
    role: "superadmin",
    system_role: "platform_owner",
  });
  
  if (profileError) {
    if(profileError.code !== '23505') console.error("Profile Error", profileError); // ignore unique violation
  }
  
  console.log("Success! Created demo admin.");
}
create();
