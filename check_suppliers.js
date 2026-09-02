import { createClient } from '@supabase/supabase-js';

// Achado C4-01 da auditoria de 2026-09-01: a URL do projeto e a chave publishable
// estavam cravadas aqui, num arquivo versionado. A chave é pública por natureza
// (vai no bundle do frontend), então o problema não era o segredo em si — era o
// atrito zero: qualquer leitor do repositório ganhava um cliente pronto apontado
// para PRODUÇÃO, sem precisar configurar nada. Foi com essa chave que a leitura
// anônima de `invoices` (C1-02) acabou sendo confirmada.
//
// Agora lê do ambiente, como os demais scripts da raiz (test_db.js, query_doc.js).
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('\n❌ Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY antes de rodar.');
    console.error('   PowerShell: $env:VITE_SUPABASE_URL="https://<ref>.supabase.co"');
    console.error('   bash:       export VITE_SUPABASE_URL=https://<ref>.supabase.co\n');
    process.exit(1);
}

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
