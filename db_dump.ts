import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

async function run() {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const url = envContent.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
    const key = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

    if (!url || !key) {
        console.error("Could not parse .env");
        return;
    }

    const supabase = createClient(url, key);
    const { data, error } = await supabase.from('projects').select('id, name, settings');
    if (error) {
        console.error("Error fetching projects:", error);
        return;
    }
    console.log("TOTAL PROJECTS IN DB:", data.length);
    data.forEach(p => {
        console.log(`ID: ${p.id} | Name: ${p.name} | OrgID in Settings: ${p.settings?.organizationId}`);
    });
}

run();
