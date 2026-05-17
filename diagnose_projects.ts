import { supabase } from './lib/supabase';

async function diagnose() {
    const { data: projects, error } = await supabase.from('projects').select('id, name, settings');
    if (error) {
        console.error("Err:", error);
        return;
    }
    console.log("Total Projects:", projects?.length);
    projects?.forEach(p => {
        console.log(`Name: ${p.name} | OrgId in Settings: ${(p.settings as any)?.organizationId}`);
    });
}

diagnose();
