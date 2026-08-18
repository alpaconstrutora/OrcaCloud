/**
 * Nomenclatura — verificação de integração contra o Supabase REAL.
 *
 * Existe porque três correções seguidas foram feitas lendo código e
 * adivinhando, sem nunca reproduzir a geração de verdade (2026-08-18). Este
 * teste percorre EXATAMENTE o mesmo caminho que a tela percorre —
 * `generateDocumentNumber` de verdade, config de verdade, RPC de verdade —
 * para que a próxima falha apareça aqui, não num print do usuário.
 *
 * ⚠️ ESCREVE NO BANCO: consome sequencial de `document_number_counters` (é o
 * ponto do teste — a RPC é atômica e não tem "rollback"). Não cria nem altera
 * nenhum documento; só o contador anda. Buraco na numeração é inofensivo.
 *
 * NÃO roda no CI: fica de fora enquanto `NUMBERING_E2E` não valer '1'.
 *
 *   NUMBERING_E2E=1 NUMBERING_EMAIL=... NUMBERING_PASSWORD='...' \
 *     npx vitest run __tests__/documentNumbering.integration.test.ts
 *
 * ou as mesmas chaves em `.env.local` (que está no .gitignore).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { supabase } from '../lib/supabase';
import { generateDocumentNumber } from '../services/documentNumbering';
import { getNumberingConfig } from '../services/documentNumbering/settingsService';

function fromEnvOrDotLocal(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const raw = readFileSync('.env.local', 'utf8');
    const line = raw.split('\n').find(l => l.trim().startsWith(`${key}=`));
    return line?.slice(line.indexOf('=') + 1).trim();
  } catch {
    return undefined;
  }
}

const LIGADO = fromEnvOrDotLocal('NUMBERING_E2E') === '1';
const EMAIL = fromEnvOrDotLocal('NUMBERING_EMAIL');
const SENHA = fromEnvOrDotLocal('NUMBERING_PASSWORD');

describe.runIf(LIGADO && EMAIL && SENHA)('Nomenclatura · integração real', () => {
  let orgId = '';

  beforeAll(async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL!, password: SENHA! });
    if (error) throw new Error(`Login falhou: ${error.message}`);
    expect(data.session).toBeTruthy();

    const { data: membros } = await supabase.from('organization_members').select('organization_id').limit(1);
    orgId = (membros ?? [])[0]?.organization_id ?? '';
    expect(orgId, 'usuário de teste precisa ser membro de alguma organização').toBeTruthy();
  });

  it('lê a config de SUPPLY_CONTRACT que está gravada no banco', async () => {
    const config = await getNumberingConfig(orgId, 'SUPPLY_CONTRACT');
    console.log('[config SUPPLY_CONTRACT]', JSON.stringify(config));
    expect(config.slots.length).toBeGreaterThan(0);
  });

  /**
   * O caso que falhou em produção: contrato de Suprimentos SEM obra, com
   * máscara usando Empreendimento+Centro de Custo+Fornecedor. Tem que sair
   * com o prefixo e os códigos que existem — nunca só o sequencial.
   */
  it('gera número de contrato de Suprimentos sem obra, com fornecedor e centro de custo', async () => {
    const { data: forn } = await supabase.from('suppliers').select('id, code').not('code', 'is', null).limit(1);
    const { data: cc } = await supabase.from('cost_centers_v2').select('id, code').limit(1);
    const supplierId = (forn ?? [])[0]?.id;
    const costCenterId = (cc ?? [])[0]?.id;

    const numero = await generateDocumentNumber('SUPPLY_CONTRACT', orgId, {
      projectId: null,
      supplierId,
      costCenterId,
    });

    console.log('[numero gerado, sem obra]', numero, '| fornecedor', (forn ?? [])[0]?.code, '| cc', (cc ?? [])[0]?.code);

    // A regressão real: numero saindo como "014" (só sequencial, formato legado).
    expect(numero, 'número não pode ser só dígitos — a máscara tem prefixo e variáveis').not.toMatch(/^\d+$/);
  });

  it('gera número de Pedido de Compra numa obra real', async () => {
    const { data: proj } = await supabase
      .from('projects')
      .select('id, organization_id')
      .eq('organization_id', orgId)
      .not('code', 'is', null)
      .limit(1);
    const projectId = (proj ?? [])[0]?.id;
    if (!projectId) return;

    const numero = await generateDocumentNumber('PURCHASE_ORDER', orgId, { projectId });
    console.log('[numero pedido]', numero);
    expect(numero).toBeTruthy();
  });
});
