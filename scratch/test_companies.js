import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltando VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY no arquivo .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log('--- Buscando Organizações ---');
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name');
    
    if (orgsError) throw orgsError;
    console.log('Organizações encontradas:', orgs);

    console.log('\n--- Buscando Empresas ---');
    const { data: companies, error: compError } = await supabase
      .from('companies')
      .select('id, org_id, razao_social, tipo, is_headquarters');
    
    if (compError) throw compError;
    console.log('Empresas encontradas:', companies);
  } catch (error) {
    console.error('Erro ao executar query:', error);
  }
}

run();
