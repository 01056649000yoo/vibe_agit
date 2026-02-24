import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
    const studentId = 'e207d57c-ed59-4ac9-a968-3f5f8b4dc144'; // example
    const lastCheckTime = '1970-01-01T00:00:00.000Z';
    const result = await supabase
        .from('post_reactions')
        .select('id, student_posts!inner(student_id)', { count: 'exact', head: true })
        .eq('student_posts.student_id', studentId)
        .neq('student_id', studentId)
        .gt('created_at', lastCheckTime);

    console.log(result);
}
test();
