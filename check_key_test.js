
import { createClient } from '@supabase/supabase-js';

const url = 'https://rdtapjpppundovhtwzzc.supabase.co';
const key = 'sb_publishable_xu5EvZxaNPBrmi2OtJ0pbA_tlmY5qHF';

console.log('Testing connection to:', url);
console.log('Using Key:', key);

const supabase = createClient(url, key);

async function testConnection() {
    try {
        const { data, error } = await supabase.from('writing_missions').select('id').limit(1);

        if (error) {
            console.error('❌ Connection Failed!');
            console.error('Error:', error.message);
            console.error('Details:', error);
        } else {
            console.log('✅ Connection Successful!');
            console.log('Data fetched:', data);
        }
    } catch (e) {
        console.error('❌ Unexpected Error:', e);
    }
}

testConnection();
