import { supabase } from '../lib/supabase';

async function check() {
    const { data, error } = await supabase.from('measure_projects').select('*').limit(1);
    if (error) {
        console.error("Erro ao selecionar da tabela measure_projects:", error);
    } else {
        console.log("Colunas encontradas em measure_projects:", Object.keys(data?.[0] || {}));
    }
}

check();
