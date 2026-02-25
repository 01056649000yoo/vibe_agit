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

async function checkNullability() {
    console.log("Checking point_logs column constraints...");

    // Use an intentional insertion error to get constraint names if possible, 
    // or just try to insert a partial record.
    const { error } = await supabase.from('point_logs').insert({
        student_id: '00000000-0000-0000-0000-000000000000', // Invalid but typed
        reason: 'Test',
        amount: 5
    });

    console.log("Partial insertion error:", error?.message);
    if (error?.details) console.log("Details:", error.details);
}

checkNullability();
