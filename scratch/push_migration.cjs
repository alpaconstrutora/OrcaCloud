const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const migrationsDir = path.join(__dirname, '../supabase/migrations');
const tempDir = path.join(__dirname, '../supabase/.temp/migrations');

// Criar pasta temporária se não existir
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Lista de arquivos indicados que estão causando erro por serem antigos e não estarem na nuvem
const conflictFiles = [
  '20261120000001_report_schedules.sql',
  '20261203000001_client_portal_get_contracts.sql',
  '20261203000002_client_portal_get_planning.sql',
  '20261203000004_portal_planning_chain_linkage.sql',
  '20261203000005_portal_planning_budget_phases.sql',
  '20261203000006_planning_admin_and_shared.sql',
  '20261219000003_receivable_party_id.sql',
  '20261220000001_reconciliation_balances.sql',
  '20261220000002_reconciliation_divergences.sql',
  '20261220000003_financial_period_close.sql',
  '20261220000004_period_lock_triggers.sql',
  '20261220000005_reconciliation_anomalies.sql',
  '20261220000006_reconciliation_consolidated.sql',
  '20261220000007_reconciliation_settings.sql',
  '20261220000008_reconciliation_aliases.sql',
  '20261220000009_backfill_contract_party_direction.sql',
  '20261220000010_backfill_contract_party_name.sql'
];

try {
  console.log('Movendo arquivos conflitantes para pasta temporária...');
  conflictFiles.forEach(file => {
    const src = path.join(migrationsDir, file);
    const dest = path.join(tempDir, file);
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
      console.log(`Movido: ${file}`);
    }
  });

  console.log('Executando supabase db push...');
  execSync('npx supabase db push', { stdio: 'inherit' });

} catch (err) {
  console.error('Erro na execução:', err);
} finally {
  console.log('Restaurando arquivos conflitantes para a pasta original...');
  conflictFiles.forEach(file => {
    const src = path.join(tempDir, file);
    const dest = path.join(migrationsDir, file);
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
      console.log(`Restaurado: ${file}`);
    }
  });
}
