import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseAnonKey = envConfig.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  console.log('--- Buscando projetos ---');
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name, organization_id');

  if (projErr) {
    console.error('Erro ao buscar projetos:', projErr);
    return;
  }

  console.log(`Total de projetos encontrados: ${projects?.length}`);
  const divinoProjects = projects?.filter(p => p.name.toLowerCase().includes('divino') || p.name.toLowerCase().includes('espirito') || p.name.toLowerCase().includes('igreja'));
  console.log('Projetos relacionados a Divino/Igreja:', divinoProjects);

  console.log('--- Buscando contratos ---');
  const { data: contracts, error: contractErr } = await supabase
    .from('contracts')
    .select('id, title, number, project_id, organization_id, status, signed_contract_url, minuta_versions');

  if (contractErr) {
    console.error('Erro ao buscar contratos:', contractErr);
  } else {
    console.log(`Total de contratos: ${contracts?.length}`);
    const matchedContracts = contracts?.filter(c => {
      // ver se o project_id é de algum dos projetos "divino"
      return divinoProjects.some(dp => dp.id === c.project_id);
    });
    console.log('Contratos associados a esses projetos:', matchedContracts);
  }

  console.log('--- Buscando opura_documents ---');
  const { data: docs, error: docsErr } = await supabase
    .from('opura_documents')
    .select('id, nome, project_id, organization_id, categoria');

  if (docsErr) {
    console.error('Erro ao buscar opura_documents:', docsErr);
  } else {
    console.log(`Total de opura_documents: ${docs?.length}`);
    const matchedDocs = docs?.filter(d => {
      return divinoProjects.some(dp => dp.id === d.project_id);
    });
    console.log('Documentos associados a esses projetos:', matchedDocs);
  }
}

check();
