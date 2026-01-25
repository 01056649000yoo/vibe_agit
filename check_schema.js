import { supabase } from './src/lib/supabaseClient.js';

async function checkSchema() {
    const { data, error } = await supabase.from('students').select('*').limit(1);
    if (error) {
        console.error(error);
    } else {
        console.log(Object.keys(data[0] || {}));
    }
}
checkSchema();
