import { supabase } from './lib/supabase';

async function check() {
    const { data, error } = await supabase.rpc('exec_sql', { sql: "SELECT column_name FROM information_schema.columns WHERE table_name = 'employee_allocations'" });
    if (error) {
        // fallback: query the table and check one row keys
        const { data: row, error: e2 } = await supabase.from('employee_allocations').select('*').limit(1);
        if (e2) {
            console.error("Error:", e2);
        } else {
            console.log("Keys:", Object.keys(row?.[0] || {}));
        }
    } else {
        console.log("Cols:", data);
    }
}

check();
