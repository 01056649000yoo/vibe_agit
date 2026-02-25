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

async function checkColumnMetadata() {
    console.log("Checking point_logs column metadata...");

    // We can use a trick to get column info from information_schema if we have a way.
    // Otherwise, we try to insert with mission_id explicitly set to NULL and see if it fails.
    const { error } = await supabase.from('point_logs').insert({
        student_id: '00000000-0000-0000-0000-000000000000',
        reason: 'Test',
        amount: 5,
        mission_id: null
    });

    console.log("Insertion with NULL mission_id error:", error?.message);
    if (error?.details) console.log("Details:", error.details);
}

checkColumnMetadata();
