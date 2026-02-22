import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const lines = envContent.split('\n');
const env = {};
lines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function inspectDatabase() {
    console.log('--- Inspecting Classes ---');
    const { data: classes, error: cErr } = await supabase.from('classes').select('id, name, teacher_id');
    if (cErr) console.error(cErr);
    classes.forEach(c => console.log(`Class: ${c.name} (ID: ${c.id}), Teacher: ${c.teacher_id}`));

    console.log('\n--- Inspecting Writing Missions ---');
    const { data: missions, error: mErr } = await supabase.from('writing_missions').select('*');
    if (mErr) console.error(mErr);

    if (missions) {
        missions.forEach(m => {
            console.log(`Mission: [${m.title}]`);
            console.log(` - ID: ${m.id}`);
            console.log(` - ClassID: ${m.class_id}`);
            console.log(` - Type: ${m.mission_type}`);
            console.log(` - Archived: ${m.is_archived}`);
            console.log(` - Guide Length: ${m.guide ? m.guide.length : 'NULL'}`);
            console.log(` - CreatedAt: ${m.created_at}`);
            console.log('-------------------');
        });
    }
}
inspectDatabase();
