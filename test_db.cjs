const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
    console.log("Checking DB structure...");
    // 1. Check point_logs structure
    const { data: cols, error: err1 } = await supabase
        .from('point_logs')
        .select('*')
        .limit(1);

    console.log("Point Logs Sample:", cols);
    if (err1) console.error("Error fetching point logs:", err1);

    // 2. See if there are any negative point logs
    const { data: negLogs, error: err2 } = await supabase
        .from('point_logs')
        .select('*')
        .lt('amount', 0)
        .order('created_at', { ascending: false })
        .limit(5);

    console.log("Negative Logs:", negLogs);
}

test();
