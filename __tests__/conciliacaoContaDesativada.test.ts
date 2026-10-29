/**
 * Conciliação: conta DESATIVADA sai de toda a Conciliação.
 *
 * O interruptor Ativa/Inativa de Contas de Pagamento (`payment_accounts.is_active`, 17/10/2026)
 * tirava a conta dos seletores, mas nenhuma função da Conciliação o lia: a "Asaas Sandbox",
 * desativada, seguia no Dashboard ("não bate") e com os movimentos do sandbox em Divergências,
 * Anomalias e Fechamento. Decisão do usuário (29/10/2026): conta desativada sai de TODAS.
 * Plano: docs/planos/2026-10-29-conciliacao-conta-desativada-e-empresa-da-conta.md.
 *
 * A trava lê a definição VIGENTE de cada função (a da migration de maior prefixo).
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PASTA = path.join(process.cwd(), 'supabase', 'migrations');

function prefixoDe(arquivo: string): string {
  return /^(?:aplicar_)?(\d{14})_/.exec(arquivo)?.[1] ?? '';
}

/** Corpo (entre as aspas de dólar) da última definição de `nome` nas migrations. */
function definicaoVigente(nome: string): { arquivo: string; corpo: string } {
  const criacao = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${nome}\\s*\\(`, 'i');
  const arquivos = readdirSync(PASTA)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => prefixoDe(a).localeCompare(prefixoDe(b)));
  let achado: { arquivo: string; corpo: string } | null = null;
  for (const arquivo of arquivos) {
    const sql = readFileSync(path.join(PASTA, arquivo), 'utf8');
    const m = criacao.exec(sql);
    if (!m) continue;
    const resto = sql.slice(m.index);
    const abre = /AS\s+(\$[A-Za-z_]*\$)/.exec(resto);
    if (!abre) continue;
    const inicio = abre.index + abre[0].length;
    achado = { arquivo, corpo: resto.slice(inicio, resto.indexOf(abre[1], inicio)) };
  }
  if (!achado) throw new Error(`nenhuma migration define public.${nome}`);
  return achado;
}

/** `pa.is_active IS NOT FALSE` (conta do recorte) ou `NOT EXISTS (... pa.is_active = false)`. */
const FILTRA_CONTA_DESATIVADA = /pa\.is_active\s+IS\s+NOT\s+FALSE|pa\.is_active\s*=\s*false/i;

describe('conciliação · conta desativada fora de todas as funções', () => {
  it.each([
    'fn_reconciliation_dashboard',
    'fn_reconciliation_consolidated',
    'fn_reconciliation_divergences',
    'fn_reconciliation_anomalies',
    'fn_financial_close_checklist',
  ])('%s ignora o extrato de conta desativada', (nome) => {
    const { arquivo, corpo } = definicaoVigente(nome);
    expect(corpo, `${arquivo}: ${nome} não filtra conta desativada`).toMatch(FILTRA_CONTA_DESATIVADA);
  });

  it('"Por empresa" separa a pessoa física da conta de PJ sem empresa', () => {
    const { corpo } = definicaoVigente('fn_reconciliation_consolidated');
    expect(corpo).toContain("'(pessoa física)'".slice(1, -1));
    expect(corpo).toContain("'sem_empresa'");
  });
});
