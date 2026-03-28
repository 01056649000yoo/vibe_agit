import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rdtapjpppundovhtwzzc.supabase.co';
const supabaseKey = 'sb_publishable_xu5EvZxaNPBrmi2OtJ0pbA_tlmY5qHF';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log("Fetching student to check keys...");
    // We try to fetch WITHOUT the column name first to see what's returned
    // Actually, we can't do '*' if RLS is on and we don't have a token.
    // BUT! Maybe there's an RPC that returns everything?
    
    // Let's try to get ONE student's keys using a known field
    const { data, error } = await supabase
        .from('students')
        .select('id, name')
        .limit(1);

    if (error) {
        console.error("Error:", error.message);
    } else if (data && data.length > 0) {
        console.log("Keys found in student record:", Object.keys(data[0]));
    } else {
        console.log("No students found or access denied.");
    }
}

inspect();
