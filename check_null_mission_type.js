import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// .env 파일에서 변수 추출
const envContent = fs.readFileSync('.env', 'utf8');
const lines = envContent.split('\n');
const env = {};
lines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNullMissionType() {
    const { data, error } = await supabase
        .from('writing_missions')
        .select('id, title, mission_type')
        .is('mission_type', null);

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log(`Found ${data.length} missions with NULL mission_type`);
        data.forEach(m => console.log(`- ${m.title} (ID: ${m.id})`));
    }
}
checkNullMissionType();
