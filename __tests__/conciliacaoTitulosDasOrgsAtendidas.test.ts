/**
 * Conta que ATENDE outras organizações vale para o motor de conciliação (11/10/2026).
 *
 * O caso: conta Banco Itaú da org "Altair", marcada "atende todas as organizações". O
 * aluguel da Igreja Universal cai nela, mas é título da Alpa. A tela Pendentes mostrava
 * os dois lados; o motor buscava título só da DONA da conta (0 títulos) e cada rodada
 * registrou `title_rows_scanned = 0`. Regra do usuário: "se está marcado todas
 * organizações é porque todas as organizações deve ser aceita pelo sistema".
 *
 * Plano: docs/planos/2026-10-11-conciliacao-conta-atende-todas-organizacoes.md
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as regras from '../utils/reconciliationRules';

const DONA = '11111111-1111-4111-8111-111111111111';
const ALPA = '22222222-2222-4222-8222-222222222222';
const GARDEN = '33333333-3333-4333-8333-333333333333';

describe('orgsDosTitulos', () => {
    it('a dona sempre entra, mesmo com a função devolvendo vazio ou nulo', () => {
        expect(regras.orgsDosTitulos(DONA, [])).toEqual([DONA]);
        expect(regras.orgsDosTitulos(DONA, null)).toEqual([DONA]);
        expect(regras.orgsDosTitulos(DONA, undefined)).toEqual([DONA]);
    });
    it('soma as atendidas, sem repetir a dona', () => {
        expect(regras.orgsDosTitulos(DONA, [DONA, ALPA, GARDEN, ALPA])).toEqual([DONA, ALPA, GARDEN]);
    });
    it('descarta o que não é uuid — o valor vai para dentro de um filtro do PostgREST', () => {
        expect(regras.orgsDosTitulos(DONA, ['', null, 'x),organization_id.is.null', ALPA])).toEqual([DONA, ALPA]);
    });
});

describe('filtroOrgsOuGlobal', () => {
    it('lista as orgs e mantém o cadastro global (org nula)', () => {
        expect(regras.filtroOrgsOuGlobal([DONA, ALPA]))
            .toBe(`organization_id.in.(${DONA},${ALPA}),organization_id.is.null`);
    });
});

describe('o caso da Igreja: título de org atendida vira candidato', () => {
    // Extrato Itaú 05/12/2016 R$ 4.167,03 × título Alpa 10/12/2016, bruto 4.556,00 com IRRF retido.
    const extrato = {
        id: 'b-0512', direction: 'CREDIT', amount: 4167.03, transaction_date: '2016-12-05',
        description_raw: 'Igreja Universal do Reino de Deus', description_normalized: 'IGREJA UNIVERSAL DO REINO DE DEUS',
        counterparty_name: 'Igreja Universal do Reino de Deus',
    };
    const titulo = regras.comValorEsperado({
        id: 't-1012', direction: 'CREDIT', amount: 4556, valor_esperado: 4167.03,
        transaction_date: '2016-12-10', due_date: '2016-12-10', party_name: 'Igreja Universal do Reino de Deus',
    });
    const semIndice = { docIndex: new Map(), aliases: [] };

    it('5 dias de distância: vira sugestão (não concilia sozinho)', () => {
        const plano = regras.planMatching([extrato], [titulo], regras.AJUSTES_PADRAO, semIndice);
        expect(plano.autoMatches).toHaveLength(0);
        expect(plano.suggestionRows).toHaveLength(1);
        expect(plano.suggestionRows[0].candidate_internal_transaction_id).toBe('t-1012');
        expect(plano.suggestionRows[0].confidence).toBe(78); // exato 40 + ≤10d 8 + mesmo nome 30
    });
});

// Trava de texto: as três cargas de título do motor não podem voltar a filtrar só pela dona.
// Foi `.eq('organization_id', orgId)` nas três até 11/10/2026.
describe('cargas de título do motor usam as orgs atendidas', () => {
    const ler = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
    // Cada consulta a internal_transactions que pede PENDING é uma carga de candidatos.
    const cargaDeTitulos = (fonte: string) =>
        fonte.replace(/\r\n/g, '\n')
            .split(".from('internal_transactions')")
            .slice(1)
            .map(t => t.slice(0, 600))
            .filter(t => /\.eq\('status', 'PENDING'\)/.test(t));
    it.each([
        'supabase/functions/reconciliation-engine/index.ts',
        'services/bankReconciliationService.ts',
        'services/reconciliationGroupService.ts',
    ])('%s', (arquivo) => {
        const trechos = cargaDeTitulos(ler(arquivo));
        expect(trechos.length).toBeGreaterThan(0);
        for (const t of trechos) {
            expect(t).toMatch(/\.in\('organization_id', orgs(DosTitulos)?\)/);
            expect(t).not.toMatch(/\.eq\('organization_id'/);
        }
    });
});
