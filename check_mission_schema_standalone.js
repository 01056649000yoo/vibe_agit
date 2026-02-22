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

async function checkSchema() {
    try {
        const { data, error } = await supabase.from('writing_missions').select('*').limit(1);
        if (error) {
            console.error('Error fetching writing_missions:', error.message);
        } else if (data && data.length > 0) {
            console.log('Columns in writing_missions:', Object.keys(data[0]));
        } else {
            console.log('No data in writing_missions, but query succeeded.');
        }
    } catch (err) {
        console.error('Unexpected error:', err.message);
    }
}
checkSchema();
