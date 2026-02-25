import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Read .env file manually
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

async function test() {
    console.log("Checking DB structure...");

    // 1. Check point_logs structure
    const { data: cols, error: err1 } = await supabase
        .from('point_logs')
        .select('*')
        .limit(1);

    console.log("Point Logs Sample:", cols);
    if (err1) console.error("Error fetching point logs:", err1);

    // 2. See if there are any negative point logs
    const { data: negLogs, error: err2 } = await supabase
        .from('point_logs')
        .select('*')
        .lt('amount', 0)
        .order('created_at', { ascending: false })
        .limit(5);

    console.log("Negative Logs:", negLogs);
}

test();
