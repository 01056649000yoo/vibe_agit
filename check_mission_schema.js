import { supabase } from './src/lib/supabaseClient.js';

async function checkSchema() {
    const { data, error } = await supabase.from('writing_missions').select('*').limit(1);
    if (error) {
        console.error('Error fetching writing_missions:', error.message);
    } else {
        console.log('Columns in writing_missions:', Object.keys(data[0] || {}));
    }
}
checkSchema();
