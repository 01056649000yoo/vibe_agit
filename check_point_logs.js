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

async function checkData() {
    console.log("Checking point_logs data...");

    // Check for logs with post_id
    const { data: logsWithPostId, error: err1 } = await supabase
        .from('point_logs')
        .select('*')
        .not('post_id', 'is', null)
        .limit(5);

    if (err1) {
        console.error("Error fetching logs with post_id:", err1);
    } else {
        console.log("Logs with post_id:", logsWithPostId);
    }

    // Check for any logs at all
    const { data: allLogs, error: err2 } = await supabase
        .from('point_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (err2) {
        console.error("Error fetching any logs:", err2);
    } else {
        console.log("Latest 5 logs:", allLogs);
    }
}

checkData();
