/**
 * Trava: a versão vigente de `fn_fi_ledger` calcula a lista de obras UMA vez.
 *
 * 16/11/2026 — a Central de Controle parou de carregar. A RPC
 * `fn_central_controle_bootstrap` estourava o `statement_timeout` de 8 s do papel
 * `authenticated`, e cancelamento não é pego pelo `EXCEPTION WHEN OTHERS` de cada
 * bloco: a resposta inteira falhava e nenhum cartão abria.
 *
 * A causa estava em `fn_fi_ledger`: a CTE `obras` é referenciada uma vez só, então
 * o PostgreSQL a embute no `LEFT JOIN LATERAL` do fim e a reexecuta por lançamento
 * (Seq Scan em `projects` com detoast de `settings` × 2.115 linhas = 6,4 s). Com
 * `AS MATERIALIZED` a mesma consulta leva 16 ms e devolve exatamente as mesmas
 * linhas. Detalhes e medições: `aplicar_20271116850000_fn_fi_ledger_obras_materialized.sql`.
 *
 * O CI não tem banco, então a trava lê o texto: quem redefinir `fn_fi_ledger`
 * numa migration nova e perder o `MATERIALIZED` quebra aqui, não em produção.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PASTA = path.join(process.cwd(), 'supabase', 'migrations');

/** Ordem de aplicação = prefixo numérico, não o nome (os `aplicar_*` vêm depois no sort). */
function prefixo(nome: string): string {
    return nome.match(/2027\d{10}/)?.[0] ?? '';
}

function versaoVigenteDoLedger(): { nome: string; sql: string } {
    const definem = readdirSync(PASTA)
        .filter(nome => nome.endsWith('.sql'))
        .map(nome => ({ nome, sql: readFileSync(path.join(PASTA, nome), 'utf8') }))
        .filter(m => /FUNCTION\s+public\.fn_fi_ledger\s*\(/i.test(m.sql))
        .sort((a, b) => prefixo(a.nome).localeCompare(prefixo(b.nome)));
    const ultima = definem[definem.length - 1];
    if (!ultima) throw new Error('Nenhuma migration define public.fn_fi_ledger.');
    return ultima;
}

describe('fn_fi_ledger — lista de obras materializada', () => {
    it('a migration mais recente que define a função usa `WITH obras AS MATERIALIZED`', () => {
        const { nome, sql } = versaoVigenteDoLedger();
        expect(
            /WITH\s+obras\s+AS\s+MATERIALIZED\s*\(/i.test(sql),
            `${nome} redefine fn_fi_ledger sem "WITH obras AS MATERIALIZED" — a CTE volta a rodar por lançamento e a Central de Controle estoura 8 s`,
        ).toBe(true);
    });
});
