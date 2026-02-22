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

async function checkColumns() {
    const columns = [
        'id', 'title', 'guide', 'genre', 'min_chars', 'min_paragraphs',
        'base_reward', 'bonus_threshold', 'bonus_reward', 'allow_comments',
        'is_archived', 'created_at', 'mission_type', 'guide_questions',
        'evaluation_rubric', 'tags'
    ];

    console.log('--- Checking writing_missions columns ---');
    for (const col of columns) {
        const { error } = await supabase.from('writing_missions').select(col).limit(1);
        if (error) {
            console.log(`❌ Column [${col}] is missing or inaccessible: ${error.message}`);
        } else {
            console.log(`✅ Column [${col}] exists.`);
        }
    }
}
checkColumns();
