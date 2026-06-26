import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oxedkknreghxrgenyjiu.supabase.co';
const supabaseKey = 'sb_publishable_IgIC72BIXClNix4ARLo0QA_0UGDrnzW';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    try {
        console.log("Consultando organizacoes...");
        const { data: orgs, error: errOrgs } = await supabase.from('organizations').select('id, name');
        if (errOrgs) {
            console.error("Erro ao buscar organizacoes:", errOrgs);
        } else {
            console.log(`Organizacoes encontradas (${orgs?.length || 0}):`, orgs);
        }

        console.log("\nConsultando fornecedores (sem filtro)...");
        const { data: sups, error: errSups } = await supabase.from('suppliers').select('id, name, organization_id');
        if (errSups) {
            console.error("Erro ao buscar fornecedores:", errSups);
        } else {
            console.log(`Fornecedores encontrados (${sups?.length || 0}):`);
            sups?.forEach(s => {
                console.log(`- ID: ${s.id} | Nome: ${s.name} | Org ID: ${s.organization_id}`);
            });
        }
    } catch (e) {
        console.error("Erro de execucao:", e);
    }
}

checkData();
