const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Ler variáveis do .env
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Erro: URL ou Chave do Supabase não encontradas no .env");
  process.exit(1);
}

const supabase = createClient(url, key);

async function runMigration(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`\n--------------------------------------------`);
  console.log(`Executando migração: ${path.basename(filePath)}...`);
  
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  
  if (error) {
    console.error(`Falha ao executar via RPC para ${path.basename(filePath)}:`, error);
  } else {
    console.log(`Sucesso ao aplicar ${path.basename(filePath)}!`, data);
  }
}

async function start() {
  try {
    const migra1 = path.join(__dirname, '../supabase/migrations/20261204000000_connect_measure_ai_to_engineering_budget.sql');
    const migra2 = path.join(__dirname, '../supabase/migrations/20261205000005_fix_tasks_collaborator_rls_cycle.sql');
    
    await runMigration(migra1);
    await runMigration(migra2);
  } catch (err) {
    console.error("Erro geral na execução das migrações:", err);
  }
}

start();
