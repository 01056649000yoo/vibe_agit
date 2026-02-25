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

async function inspectHonorRoll() {
    console.log("Inspecting agit_honor_roll schema...");

    // Attempt an insert to see what's missing or required
    const { error } = await supabase.from('agit_honor_roll').insert({
        student_id: '00000000-0000-0000-0000-000000000000',
        class_id: '00000000-0000-0000-0000-000000000000'
    });

    console.log("Error:", error?.message);
    if (error?.details) console.log("Details:", error.details);
}

inspectHonorRoll();
