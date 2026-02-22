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

async function debugMissions() {
    console.log('--- Fetching all writing_missions ---');
    const { data: missions, error } = await supabase
        .from('writing_missions')
        .select('id, title, mission_type, is_archived, class_id, teacher_id');

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    console.log(`Summary: Total ${missions.length} missions found.`);
    const stats = missions.reduce((acc, m) => {
        const type = String(m.mission_type);
        acc[type] = (acc[type] || 0) + 1;
        if (m.is_archived) acc.archived = (acc.archived || 0) + 1;
        if (m.mission_type === null) acc.isNullType = (acc.isNullType || 0) + 1;
        return acc;
    }, {});
    console.log('Stats:', stats);

    console.log('\n--- Sample Missions (up to 10) ---');
    missions.slice(0, 10).forEach(m => {
        console.log(`- [${m.title}] Type: ${m.mission_type}, Archived: ${m.is_archived}, Class: ${m.class_id}`);
    });
}
debugMissions();
