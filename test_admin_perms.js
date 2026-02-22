import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const lines = envContent.split('\n');
const env = {};
lines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function testSettings() {
    // We can't easily "log in" as the user in a node script without their password.
    // But we can check the policies and the user's role data.

    console.log('--- Checking Admin Users ---');
    const { data: admins, error } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('role', 'ADMIN');

    if (error) {
        console.error('Error fetching admins:', error.message);
    } else {
        console.log(`Found ${admins.length} admin(s):`);
        admins.forEach(a => console.log(`- ${a.email} (${a.id})`));
    }

    console.log('\n--- Checking system_settings policies via SQL (if possible) ---');
    // Note: We can't query pg_policies via the anon/public client usually.
}
testSettings();
