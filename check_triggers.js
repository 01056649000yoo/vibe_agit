import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value.length > 0) {
        envVars[key.trim()] = value.join('=').trim();
    }
});

const supabaseUrl = envVars['VITE_SUPABASE_URL'];
const supabaseKey = envVars['VITE_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
    console.log("Checking students table auth_id mapping...");
    const { data: students, error: sErr } = await supabase.from('students').select('id, name, auth_id').limit(10);
    if (sErr) console.error("Error fetching students:", sErr);
    else console.log("Students:", students);

    console.log("\nChecking for triggers on point_logs...");
    const { data: triggers, error: tErr } = await supabase.rpc('get_triggers', { table_name: 'point_logs' });
    if (tErr) console.error("Error checking triggers (RPC might not exist):", tErr);
    else console.log("Triggers:", triggers);
}

checkDatabase();
