import { supabase } from '../lib/supabase';

async function run() {
    const sql = `
        ALTER TABLE public.measure_projects 
        ADD COLUMN IF NOT EXISTS associated_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
    `;

    console.log("Executando SQL...");
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
        console.error("Falha ao executar via RPC exec_sql:", error);
    } else {
        console.log("SQL executado com sucesso!", data);
    }
}

run();
