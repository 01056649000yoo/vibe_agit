import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rdtapjpppundovhtwzzc.supabase.co';
const supabaseKey = 'sb_publishable_xu5EvZxaNPBrmi2OtJ0pbA_tlmY5qHF';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log("Fetching students...");
    const { data, error } = await supabase
        .from('students')
        .select('*')
        .limit(5);

    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log("Data count:", data.length);
        if (data.length > 0) {
            console.log("First student sample:", JSON.stringify(data[0], null, 2));
        }
    }
}

test();
