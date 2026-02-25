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

async function checkFunction() {
    console.log("Checking reward_for_comment status...");

    // We can't see pg_proc easily, but we can try to call it with dummy data 
    // and see the error or success.
    const { data, error } = await supabase.rpc('reward_for_comment', {
        p_post_id: '00000000-0000-0000-0000-000000000000'
    });

    console.log("RPC Response:", data);
    console.log("RPC Error:", error?.message);
}

checkFunction();
