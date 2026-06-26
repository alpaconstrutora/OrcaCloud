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
  console.log('--- Testando Outras Colunas de Arquivos na Tabela contracts ---');
  
  const testSets = [
    { name: 'Coluna file_path', cols: 'id, file_path' },
    { name: 'Coluna attachment_path', cols: 'id, attachment_path' },
    { name: 'Coluna pdf_url', cols: 'id, pdf_url' },
    { name: 'Coluna pdf_path', cols: 'id, pdf_path' },
  ];

  for (const set of testSets) {
    console.log(`Testando ${set.name}:`);
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select(set.cols)
        .limit(1);

      if (error) {
        console.log(` ❌ Não existe: ${error.message}`);
      } else {
        console.log(` ✅ Existe!`);
      }
    } catch (err) {
      console.error(` 💥 Falha:`, err);
    }
  }
}

check();
