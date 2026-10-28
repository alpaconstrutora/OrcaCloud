/**
 * Conciliação › Dashboard: "conciliado" e "pendente" têm UMA definição só.
 *
 * A aba Dashboard mostra a coluna "Conciliado" em duas tabelas, cada uma vinda de uma
 * função: por conta (`fn_reconciliation_dashboard`) e por empresa
 * (`fn_reconciliation_consolidated`). Cada função escrevia a lista de status à mão.
 * Quando o status TRANSFER nasceu (`aplicar_20270919000016`), só o dashboard foi
 * atualizado — e em produção a mesma organização tinha R$ 287.816,00 de diferença entre
 * as duas tabelas (28/10/2026). Plano: docs/planos/2026-10-28-conciliacao-dashboard-confianca.md.
 *
 * A trava lê a definição VIGENTE de cada função (a da migration de maior prefixo) e exige
 * que ela use `fn_bank_tx_conciliado` / `fn_bank_tx_pendente` em vez de listar status.
 * O CI não tem credencial do banco; o drift do banco se confere com `pg_get_functiondef`.
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
    const fim = resto.indexOf(abre[1], inicio);
    achado = { arquivo, corpo: resto.slice(inicio, fim) };
  }
  if (!achado) throw new Error(`nenhuma migration define public.${nome}`);
  return achado;
}

/** Status de extrato escritos literalmente — o que a fonte única substitui. */
const LISTA_LITERAL = /'(MATCHED|CONFIRMED|LOCKED|IMPORTED|NORMALIZED|RULE_APPLIED)'/;

describe('conciliação · conciliado e pendente com uma definição só', () => {
  it.each(['fn_reconciliation_dashboard', 'fn_reconciliation_consolidated'])(
    '%s usa os helpers e não lista status de extrato à mão',
    (nome) => {
      const { arquivo, corpo } = definicaoVigente(nome);
      expect(corpo, `${arquivo}: lista literal de status em ${nome}`).not.toMatch(LISTA_LITERAL);
      expect(corpo, `${arquivo}: ${nome} sem fn_bank_tx_conciliado`).toContain('fn_bank_tx_conciliado(');
      expect(corpo, `${arquivo}: ${nome} sem fn_bank_tx_pendente`).toContain('fn_bank_tx_pendente(');
    },
  );

  it('transferência entre contas próprias conta como conciliada', () => {
    const { corpo } = definicaoVigente('fn_bank_tx_conciliado');
    for (const status of ['MATCHED', 'CONFIRMED', 'LOCKED', 'TRANSFER']) {
      expect(corpo).toContain(`'${status}'`);
    }
  });

  it('o dashboard devolve o saldo do banco e o calculado na MESMA data', () => {
    // Passo 2: comparar o saldo do banco com o calculado de hoje seria comparar datas diferentes.
    const { corpo } = definicaoVigente('fn_reconciliation_dashboard');
    for (const chave of ['saldo_banco', 'saldo_banco_data', 'saldo_banco_origem', 'calculado_na_data_banco', 'pendentes_apos_data_banco']) {
      expect(corpo).toContain(`'${chave}'`);
    }
  });

  it('o dashboard devolve a data do saldo inicial de cada conta', () => {
    // Sem ela a tela de edição do saldo inicial não sabe a data atual e grava NULL.
    expect(definicaoVigente('fn_reconciliation_dashboard').corpo).toContain("'opening_balance_date'");
  });
});
