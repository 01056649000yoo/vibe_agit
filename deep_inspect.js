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

async function deepInspect() {
    console.log("Deep inspecting point_logs...");

    // Try to find ANY log entries, seeing what columns are actually populated
    const { data: anyLogs, error: err1 } = await supabase
        .from('point_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (err1) {
        console.error("Error fetching logs (maybe RLS?):", err1);
    } else {
        console.log(`Found ${anyLogs?.length || 0} logs.`);
        anyLogs?.forEach(log => {
            console.log(`Log ID: ${log.id}, Student: ${log.student_id}, Post: ${log.post_id}, Reason: ${log.reason}, Amount: ${log.amount}`);
        });
    }

    // Check if points are even being stored in the students table
    const { data: students, error: err2 } = await supabase
        .from('students')
        .select('id, name, total_points')
        .gt('total_points', 0)
        .limit(5);

    if (err2) {
        console.error("Error fetching students:", err2);
    } else {
        console.log("Students with points:", students);
    }
}

deepInspect();
